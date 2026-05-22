import threading
import time

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

from game import GameSession


app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-secret-key"

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Shared server state. These structures are the only place where matchmaking
# and game ownership live, so every access that can change them uses
# state_lock. Each GameSession also has its own internal lock for turn actions.
waiting_players = []
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


def add_player_to_queue(sid):
    thread = None

    with state_lock:
        # player_to_game is the source of truth for routing a socket to its
        # GameSession. This prevents actions from one browser tab from being
        # applied to any other active game.
        if sid in player_to_game:
            game_id = player_to_game[sid]
            game = active_games.get(game_id)
            if game:
                return {"status": "active", "game": game}

            player_to_game.pop(sid, None)

        if any(player["sid"] == sid for player in waiting_players):
            return {"status": "waiting", "game": None}

        waiting_players.append(create_player(sid))

        if len(waiting_players) < 2:
            return {"status": "waiting", "game": None}

        player_one = waiting_players.pop(0)
        player_two = waiting_players.pop(0)
        game = GameSession(player_one, player_two)

        # active_games stores each independent GameSession by its UUID. The
        # reverse index player_to_game lets every socket event find exactly one
        # session without scanning or touching unrelated games.
        active_games[game.id] = game
        for player_id in game.player_ids:
            player_to_game[player_id] = game.id

        # A daemon thread is created per game. The game logic remains inside
        # GameSession, while this thread provides an isolated lifecycle worker
        # for the session and demonstrates concurrent game management.
        thread = threading.Thread(
            target=manage_game_thread,
            args=(game.id,),
            daemon=True,
        )
        game_threads[game.id] = thread

    thread.start()
    return {"status": "matched", "game": game}


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
        # being matched. Removing from active_games/player_to_game handles a tab
        # that leaves an active game without touching other sessions.
        waiting_players[:] = [
            player for player in waiting_players if player["sid"] != player_id
        ]

        game_id = player_to_game.pop(player_id, None)
        if not game_id:
            return None

        removed_game = active_games.pop(game_id, None)
        if removed_game:
            for sid in removed_game.player_ids:
                player_to_game.pop(sid, None)

            game_threads.pop(game_id, None)

    return removed_game


def emit_error(message):
    emit("error_message", {"message": message})


@socketio.on("connect")
def handle_connect():
    sid = request.sid
    emit("connected", {"message": "Conectado al servidor de Adivina Quien."})

    result = add_player_to_queue(sid)
    if result["status"] == "waiting":
        emit("queue_status", {"message": "Esperando otro jugador..."})
        return

    if result["game"]:
        start_game(result["game"])


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

    # The action result is emitted only to this game's room; then each socket
    # receives its own private state, preserving secrets and per-player numbers.
    socketio.emit("action_result", action, room=game.id)
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

    socketio.emit("action_result", action, room=game.id)
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
    socketio.run(
        app,
        host="localhost",
        port=5000,
        debug=True,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )
