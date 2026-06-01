import os
import socket
import threading
import time
import random
import string

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

from game import GameSession


app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-secret-key"

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# Shared server state. The automatic queue, QR/private rooms, active games and
# player index are intentionally separate so one matchmaking mode cannot steal
# players or state from the other. Every mutation uses state_lock.
waiting_players = []
private_rooms = {}
active_games = {}
player_to_game = {}
game_threads = {}
state_lock = threading.Lock()


@app.route("/")
def index():
    return render_template("index.html")


def create_player(sid):
    return {
        "sid": sid,
        "name": f"Jugador {sid[:4]}",
    }


def detect_network_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return None


def print_startup_urls(port):
    network_ip = detect_network_ip()
    network_url = (
        f"http://{network_ip}:{port}"
        if network_ip
        else "No disponible. Verifica tu conexion WiFi."
    )

    print("=" * 40, flush=True)
    print("Servidor Adivina Quien iniciado", flush=True)
    print(f"Puerto: {port}", flush=True)
    print(f"Local: http://localhost:{port}", flush=True)
    print(f"Red local: {network_url}", flush=True)
    print("Usa la URL de red local en celulares o PCs conectados al mismo WiFi.", flush=True)
    print("=" * 40, flush=True)


def remove_from_waiting_queue(sid):
    waiting_players[:] = [
        player for player in waiting_players if player["sid"] != sid
    ]


def remove_private_room_for_creator(sid):
    removed_codes = []

    for room_code, room in list(private_rooms.items()):
        if room["creator"]["sid"] == sid:
            private_rooms.pop(room_code, None)
            removed_codes.append(room_code)

    return removed_codes


def generate_room_code():
    alphabet = string.ascii_uppercase + string.digits

    while True:
        code = "".join(random.choices(alphabet, k=6))
        if code not in private_rooms:
            return code


def create_game_for_players(player_one, player_two):
    game = GameSession(player_one, player_two)

    # active_games stores each independent GameSession by its UUID. The reverse
    # index player_to_game lets every socket event find exactly one session
    # without scanning or touching unrelated automatic or QR games.
    active_games[game.id] = game
    for player_id in game.player_ids:
        player_to_game[player_id] = game.id

    # A daemon thread is created per game. The game logic remains inside
    # GameSession, while this thread provides an isolated lifecycle worker.
    thread = threading.Thread(
        target=manage_game_thread,
        args=(game.id,),
        daemon=True,
    )
    game_threads[game.id] = thread

    return game, thread


def add_player_to_queue(sid):
    thread = None

    with state_lock:
        # Public matchmaking now starts only when the client explicitly emits
        # join_public_queue. A plain socket connection never enters this queue.
        # player_to_game is the source of truth for routing a socket to its
        # GameSession. This prevents actions from one browser tab from being
        # applied to any other active game.
        if sid in player_to_game:
            game_id = player_to_game[sid]
            game = active_games.get(game_id)
            if game:
                return {"status": "active", "game": game}

            player_to_game.pop(sid, None)

        # A player cannot wait in a private QR room and public queue at the
        # same time. Choosing public matchmaking cancels any private room they
        # created before entering waiting_players.
        remove_private_room_for_creator(sid)

        if any(player["sid"] == sid for player in waiting_players):
            return {"status": "waiting", "game": None}

        # Public matchmaking only uses waiting_players. QR rooms are stored in
        # private_rooms and never consume this queue.
        waiting_players.append(create_player(sid))
        print(
            f"[PUBLIC QUEUE] player={sid} waiting={len(waiting_players)}",
            flush=True,
        )

        if len(waiting_players) < 2:
            return {"status": "waiting", "game": None}

        player_one = waiting_players.pop(0)
        player_two = waiting_players.pop(0)
        game, thread = create_game_for_players(player_one, player_two)
        print(
            "[PUBLIC GAME] "
            f"game={game.id} players={player_one['sid']},{player_two['sid']} "
            f"waiting={len(waiting_players)}",
            flush=True,
        )

    thread.start()
    return {"status": "matched", "game": game}


def create_private_room_for_player(sid):
    with state_lock:
        if sid in player_to_game:
            raise ValueError("Ya tienes una partida activa.")

        # Choosing private matchmaking removes the player from public waiting.
        # This keeps waiting_players and private_rooms completely separated.
        remove_from_waiting_queue(sid)

        for room in private_rooms.values():
            if room["creator"]["sid"] == sid:
                return room

        room_code = generate_room_code()
        private_rooms[room_code] = {
            "code": room_code,
            "creator": create_player(sid),
            "created_at": time.time(),
        }

        return private_rooms[room_code]


def join_private_room_for_player(sid, room_code):
    room_code = (room_code or "").strip().upper()
    thread = None

    with state_lock:
        if sid in player_to_game:
            raise ValueError("Ya tienes una partida activa.")

        room = private_rooms.get(room_code)
        if not room:
            raise ValueError("La sala QR no existe o ya fue usada.")

        creator = room["creator"]
        if creator["sid"] == sid:
            raise ValueError("Ya estas esperando a otro jugador en esta sala QR.")

        remove_from_waiting_queue(sid)
        remove_private_room_for_creator(sid)
        private_rooms.pop(room_code, None)

        # The QR room accepts exactly two players: the creator and the first
        # valid guest. Once matched, the room is removed and a normal
        # GameSession is created, isolated like any automatic match.
        game, thread = create_game_for_players(creator, create_player(sid))

    thread.start()
    return game


def manage_game_thread(game_id):
    while True:
        time.sleep(1)

        with state_lock:
            game = active_games.get(game_id)

        if game is None or game.status == "finished":
            break

    with state_lock:
        game_threads.pop(game_id, None)


def get_game_for_player(player_id):
    with state_lock:
        game_id = player_to_game.get(player_id)
        if not game_id:
            return None

        # Returning only the session for this socket keeps simultaneous games
        # isolated even when many browser tabs emit events at the same time.
        return active_games.get(game_id)


def emit_private_state(game, player_id):
    # Each player receives a state generated specifically for their socket.
    # GameSession.get_public_state includes only that player's own secret
    # character and never exposes the rival's secret.
    socketio.emit(
        "state_update",
        game.get_public_state(player_id),
        to=player_id,
    )


def emit_private_states(game):
    for player_id in game.player_ids:
        emit_private_state(game, player_id)


def emit_action_result(game, action):
    for player_id in game.player_ids:
        public_action = game.get_action_for_player(action, player_id)
        if public_action:
            socketio.emit("action_result", public_action, to=player_id)


def start_game(game):
    for player_id in game.player_ids:
        # The room name is the game UUID. Broadcasts to room=game.id can only
        # reach the two sockets joined to this GameSession.
        join_room(game.id, sid=player_id)

    socketio.emit(
        "game_started",
        {"message": "Partida encontrada.", "game_id": game.id},
        room=game.id,
    )
    emit_private_states(game)


def finish_game_after_disconnect(game, disconnected_player):
    with game.lock:
        if game.status != "finished":
            game.status = "finished"
            opponent = game._get_opponent_id(disconnected_player)
            game.winner = opponent
            game.history.append(
                {
                    "type": "disconnect",
                    "player_id": disconnected_player,
                    "message": "El jugador abandono la partida.",
                }
            )


def remove_player_from_server(player_id):
    removed_game = None

    with state_lock:
        # Removing from waiting_players handles a tab that disconnects before
        # being matched. Removing private_rooms handles a QR creator who leaves
        # before the guest joins. Active game cleanup does not touch unrelated
        # automatic or QR sessions.
        remove_from_waiting_queue(player_id)
        remove_private_room_for_creator(player_id)

        game_id = player_to_game.pop(player_id, None)
        if not game_id:
            return None

        removed_game = active_games.pop(game_id, None)
        if removed_game:
            for sid in removed_game.player_ids:
                player_to_game.pop(sid, None)

            game_threads.pop(game_id, None)

    return removed_game


def remove_game_from_server(game_id):
    with state_lock:
        removed_game = active_games.pop(game_id, None)
        if not removed_game:
            return None

        for sid in removed_game.player_ids:
            player_to_game.pop(sid, None)

        game_threads.pop(game_id, None)
        return removed_game


def emit_error(message):
    emit("error_message", {"message": message})


@socketio.on("connect")
def handle_connect():
    print(
        f"[CONNECT] player={request.sid} address={request.remote_addr}",
        flush=True,
    )
    emit("connected", {"message": "Conectado al servidor de Adivina Quien."})

    # Connecting only establishes the socket. The user must choose public or
    # private matchmaking from the menu, so no one is added to waiting_players
    # just by opening the page.
    if request.args.get("room"):
        emit("private_room_detected", {"message": "Codigo QR detectado. Uniendote a la sala..."})


@socketio.on("join_public_queue")
def handle_join_public_queue():
    sid = request.sid
    result = add_player_to_queue(sid)

    if result["status"] == "waiting":
        emit("queue_status", {"message": "Esperando otro jugador..."})
        return

    if result["game"]:
        start_game(result["game"])


@socketio.on("cancel_matchmaking")
def handle_cancel_matchmaking():
    sid = request.sid

    with state_lock:
        if sid in player_to_game:
            emit_error("No puedes salir del emparejamiento porque ya estas en una partida.")
            return

        remove_from_waiting_queue(sid)
        remove_private_room_for_creator(sid)

    emit("matchmaking_cancelled", {"message": "Volviste al menu principal."})


@socketio.on("create_private_room")
def handle_create_private_room():
    sid = request.sid

    try:
        room = create_private_room_for_player(sid)
    except ValueError as error:
        emit_error(str(error))
        return

    emit(
        "private_room_created",
        {
            "room_code": room["code"],
            "message": "Sala QR creada. Esperando al segundo jugador.",
        },
    )
    emit("queue_status", {"message": "Sala QR creada. Esperando invitado...", "private": True})


@socketio.on("join_private_room")
def handle_join_private_room(data):
    sid = request.sid
    room_code = (data or {}).get("room")

    try:
        game = join_private_room_for_player(sid, room_code)
    except ValueError as error:
        emit_error(str(error))
        return

    start_game(game)


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    game = remove_player_from_server(sid)

    if not game:
        return

    finish_game_after_disconnect(game, sid)
    opponent = game._get_opponent_id(sid)
    socketio.emit(
        "opponent_left",
        {"message": "El rival abandono la partida."},
        to=opponent,
    )
    emit_private_state(game, opponent)


@socketio.on("leave_game")
def handle_leave_game():
    sid = request.sid
    game = get_game_for_player(sid)

    if not game:
        with state_lock:
            remove_from_waiting_queue(sid)
            remove_private_room_for_creator(sid)

        emit(
            "left_game",
            {"message": "Saliste del emparejamiento y volviste al menu principal."},
        )
        return

    try:
        action = game.leave_game(sid)
    except ValueError as error:
        emit_error(str(error))
        return

    opponent = game._get_opponent_id(sid)
    emit_action_result(game, action)
    emit_private_states(game)
    socketio.emit(
        "opponent_left",
        {"message": "El rival abandono la partida. Has ganado por abandono."},
        to=opponent,
    )
    socketio.emit(
        "left_game",
        {"message": "Abandonaste la partida y volviste al menu principal."},
        to=sid,
    )
    remove_game_from_server(game.id)


@socketio.on("ask_question")
def handle_ask_question(data):
    sid = request.sid
    game = get_game_for_player(sid)

    if not game:
        emit_error("No tienes una partida activa.")
        return

    try:
        attribute = data.get("attribute")
        value = data.get("value")
        action = game.ask_question(sid, attribute, value)
    except (AttributeError, ValueError) as error:
        emit_error(str(error))
        return

    # Each player receives only the version of the action that belongs to their
    # personal history. Opponent questions are not emitted as if they were own
    # activity, while final/system events remain clearly classified.
    emit_action_result(game, action)
    emit_private_states(game)


@socketio.on("guess_character")
def handle_guess_character(data):
    sid = request.sid
    game = get_game_for_player(sid)

    if not game:
        emit_error("No tienes una partida activa.")
        return

    try:
        character_id = int(data.get("character_id"))
        action = game.guess_character(sid, character_id)
    except (TypeError, ValueError) as error:
        emit_error(str(error))
        return

    emit_action_result(game, action)
    emit_private_states(game)


@socketio.on("request_state")
def handle_request_state():
    sid = request.sid
    game = get_game_for_player(sid)

    if not game:
        emit_error("No tienes una partida activa.")
        return

    emit_private_state(game, sid)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print_startup_urls(port)
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )
