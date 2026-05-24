import random
import threading
import uuid
from copy import deepcopy

from characters import CHARACTERS, get_random_board


BOOLEAN_ATTRIBUTES = {
    "gafas",
    "sombrero",
    "barba",
    "bigote",
    "cabello_largo",
}

QUESTION_ATTRIBUTES = {
    "genero",
    "color_cabello",
    "accesorio",
} | BOOLEAN_ATTRIBUTES

ALLOWED_ACCESSORIES = {
    "aretes",
    "bufanda",
    "collar",
    "corbata",
}

ALLOWED_ATTRIBUTE_VALUES = {
    attribute: (
        ALLOWED_ACCESSORIES
        if attribute == "accesorio"
        else {character[attribute] for character in CHARACTERS}
    )
    for attribute in QUESTION_ATTRIBUTES
}


class GameSession:
    def __init__(self, player_one, player_two, game_id=None):
        self.id = game_id or str(uuid.uuid4())
        self.players = [
            self._normalize_player(player_one),
            self._normalize_player(player_two),
        ]
        self.player_ids = [player["id"] for player in self.players]
        self.board = get_random_board()
        self.secret_characters = self._assign_secret_characters()
        self.current_turn = self.player_ids[0]
        self.history = []
        self.status = "active"
        self.winner = None
        self.guess_attempts = set()
        self.lock = threading.Lock()

    def _normalize_player(self, player):
        if isinstance(player, dict):
            return {
                "id": player["sid"],
                "name": player.get("name", "Jugador"),
            }

        return {
            "id": player,
            "name": "Jugador",
        }

    def _assign_secret_characters(self):
        secret_one, secret_two = random.sample(self.board, 2)
        return {
            self.player_ids[0]: deepcopy(secret_one),
            self.player_ids[1]: deepcopy(secret_two),
        }

    def get_public_state(self, player_id):
        self._validate_player(player_id)

        player_number = self.player_ids.index(player_id) + 1
        return {
            "game_id": self.id,
            "player_number": player_number,
            "opponent_number": self._get_player_number(self._get_opponent_id(player_id)),
            "status": self.status,
            "players": self._get_public_players(),
            "board": deepcopy(self.board),
            "your_secret_character": deepcopy(self.secret_characters[player_id]),
            "opponent_secret_character": None,
            "current_turn_player_number": self._get_player_number(self.current_turn),
            "is_your_turn": self.current_turn == player_id,
            "winner_player_number": self._get_player_number(self.winner) if self.winner else None,
            "you_won": self.winner == player_id,
            "can_guess": player_id not in self.guess_attempts and self.status == "active",
            "used_guess_player_numbers": [
                self._get_player_number(guesser_id)
                for guesser_id in self.guess_attempts
            ],
            "history": self._get_public_history(player_id),
        }

    def ask_question(self, player_id, attribute, value):
        with self.lock:
            self._validate_action(player_id)
            self._validate_question(attribute, value)

            opponent_id = self._get_opponent_id(player_id)
            opponent_secret = self.secret_characters[opponent_id]
            answer = opponent_secret.get(attribute) == value

            action = {
                "type": "question",
                "player_id": player_id,
                "attribute": attribute,
                "value": value,
                "answer": answer,
            }
            self.history.append(action)
            self.switch_turn()

            return deepcopy(action)

    def guess_character(self, player_id, character_id):
        with self.lock:
            self._validate_action(player_id)
            self._validate_character_id(character_id)
            self._validate_guess_attempt(player_id)

            opponent_id = self._get_opponent_id(player_id)
            opponent_secret = self.secret_characters[opponent_id]
            is_correct = opponent_secret["id"] == character_id
            guessed_character = self._get_character_by_id(character_id)
            winner_id = player_id if is_correct else opponent_id

            self.guess_attempts.add(player_id)
            action = {
                "type": "guess",
                "player_id": player_id,
                "character_id": character_id,
                "character_name": guessed_character["nombre"],
                "answer": is_correct,
                "winner_id": winner_id,
                "ended_game": True,
            }
            self.history.append(action)

            self.status = "finished"
            self.winner = winner_id

            return deepcopy(action)

    def leave_game(self, player_id):
        with self.lock:
            self._validate_player(player_id)

            if self.status == "finished":
                raise ValueError("La partida ya termino.")

            opponent_id = self._get_opponent_id(player_id)
            action = {
                "type": "leave",
                "player_id": player_id,
                "winner_id": opponent_id,
                "message": "El jugador abandono la partida.",
                "ended_game": True,
            }
            self.history.append(action)
            self.status = "finished"
            self.winner = opponent_id

            return deepcopy(action)

    def switch_turn(self):
        self.current_turn = self._get_opponent_id(self.current_turn)
        return self.current_turn

    def _validate_action(self, player_id):
        self._validate_player(player_id)

        if self.status == "finished":
            raise ValueError("La partida ya termino.")

        if self.status != "active":
            raise ValueError("La partida no esta activa.")

        if self.current_turn != player_id:
            raise ValueError("No es tu turno.")

    def _validate_question(self, attribute, value):
        if attribute not in QUESTION_ATTRIBUTES:
            raise ValueError("La caracteristica no es valida para preguntas.")

        if attribute in BOOLEAN_ATTRIBUTES and not isinstance(value, bool):
            raise ValueError("Esta pregunta debe usar un valor Si o No.")

        if attribute not in BOOLEAN_ATTRIBUTES and not isinstance(value, str):
            raise ValueError("El valor de la pregunta no es valido.")

        if value not in ALLOWED_ATTRIBUTE_VALUES[attribute]:
            raise ValueError("El valor no existe en el tablero de personajes.")

    def _validate_character_id(self, character_id):
        if not isinstance(character_id, int):
            raise ValueError("El personaje seleccionado no es valido.")

        if character_id not in {character["id"] for character in self.board}:
            raise ValueError("El personaje no existe en el tablero.")

    def _validate_guess_attempt(self, player_id):
        if player_id in self.guess_attempts:
            raise ValueError("Ya usaste tu unica oportunidad para adivinar.")

    def _validate_player(self, player_id):
        if player_id not in self.player_ids:
            raise ValueError("El jugador no pertenece a esta partida.")

    def _get_opponent_id(self, player_id):
        self._validate_player(player_id)
        return self.player_ids[1] if self.player_ids[0] == player_id else self.player_ids[0]

    def _get_player_number(self, player_id):
        self._validate_player(player_id)
        return self.player_ids.index(player_id) + 1

    def _get_character_by_id(self, character_id):
        for character in self.board:
            if character["id"] == character_id:
                return character

        raise ValueError("El personaje no existe en el tablero.")

    def _get_public_players(self):
        return [
            {"number": index + 1, "name": player["name"]}
            for index, player in enumerate(self.players)
        ]

    def get_action_for_player(self, action, player_id):
        self._validate_player(player_id)
        return self._get_public_action(action, player_id)

    def _get_public_history(self, player_id):
        history = []

        for action in self.history:
            public_action = self._get_public_action(action, player_id)
            if public_action:
                history.append(public_action)

        return history

    def _get_public_action(self, action, viewer_id):
        public_action = deepcopy(action)
        player_id = public_action.pop("player_id", None)

        if player_id in self.player_ids:
            public_action["player_number"] = self._get_player_number(player_id)
            if player_id == viewer_id:
                public_action["actor_scope"] = "self"
                public_action["actor_label"] = "Tu"
            else:
                public_action["actor_scope"] = "rival"
                public_action["actor_label"] = "Rival"

        if public_action.get("type") == "question" and player_id != viewer_id:
            return None

        winner_id = public_action.pop("winner_id", None)
        if winner_id in self.player_ids:
            public_action["winner_player_number"] = self._get_player_number(winner_id)
            public_action["you_won_action"] = winner_id == viewer_id

        if "actor_scope" not in public_action:
            public_action["actor_scope"] = "system"
            public_action["actor_label"] = "Sistema"

        return public_action


class GameManager:
    """Stores matchmaking and active games only in server memory."""

    def __init__(self):
        self.waiting_players = []
        self.games = {}
        self.player_to_game = {}
        self.lock = threading.Lock()

    def add_player_to_queue(self, sid, name):
        with self.lock:
            if sid in self.player_to_game:
                game_id = self.player_to_game[sid]
                game = self.games[game_id]
                return {
                    "status": "matched",
                    "game_id": game_id,
                    "players": game.player_ids,
                }

            self.waiting_players = [
                player for player in self.waiting_players if player["sid"] != sid
            ]
            self.waiting_players.append({"sid": sid, "name": name})

            if len(self.waiting_players) < 2:
                return {"status": "waiting"}

            player_one = self.waiting_players.pop(0)
            player_two = self.waiting_players.pop(0)
            game = GameSession(player_one, player_two)

            self.games[game.id] = game
            for player_id in game.player_ids:
                self.player_to_game[player_id] = game.id

            return {
                "status": "matched",
                "game_id": game.id,
                "players": game.player_ids,
            }

    def get_game_by_player(self, sid):
        with self.lock:
            game_id = self.player_to_game.get(sid)
            if not game_id:
                return None

            return self.games.get(game_id)

    def remove_player(self, sid):
        with self.lock:
            self.waiting_players = [
                player for player in self.waiting_players if player["sid"] != sid
            ]
            game_id = self.player_to_game.pop(sid, None)

            if not game_id:
                return None

            game = self.games.pop(game_id, None)
            if not game:
                return None

            for player_id in game.player_ids:
                self.player_to_game.pop(player_id, None)

            return {"id": game.id, "players": game.player_ids}
