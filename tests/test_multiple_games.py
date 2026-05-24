import unittest
from collections import Counter
from pathlib import Path

import app as server
from characters import CHARACTERS


class MultipleGamesTest(unittest.TestCase):
    def setUp(self):
        with server.state_lock:
            server.waiting_players.clear()
            server.private_rooms.clear()
            server.active_games.clear()
            server.player_to_game.clear()
            server.game_threads.clear()

    def tearDown(self):
        with server.state_lock:
            server.waiting_players.clear()
            server.private_rooms.clear()
            server.active_games.clear()
            server.player_to_game.clear()
            server.game_threads.clear()

    def test_four_clients_create_two_isolated_games(self):
        clients = [server.socketio.test_client(server.app) for _ in range(4)]
        for client in clients:
            self._join_public_queue(client)

        states = [self._latest_state(client) for client in clients]

        first_game_id = states[0]["game_id"]
        second_game_id = states[2]["game_id"]

        self.assertEqual(states[1]["game_id"], first_game_id)
        self.assertEqual(states[3]["game_id"], second_game_id)
        self.assertNotEqual(first_game_id, second_game_id)

        self.assertEqual(states[0]["player_number"], 1)
        self.assertEqual(states[1]["player_number"], 2)
        self.assertEqual(states[2]["player_number"], 1)
        self.assertEqual(states[3]["player_number"], 2)

        for state in states:
            self.assertNotIn("player_id", state)
            self.assertNotIn("opponent_id", state)
            self.assertNotIn("current_turn", state)
            self.assertIsNone(state["opponent_secret_character"])
            self.assertEqual(state["history"], [])

        self.assertNotEqual(
            states[0]["your_secret_character"]["id"],
            states[1]["your_secret_character"]["id"],
        )
        self.assertNotEqual(
            states[2]["your_secret_character"]["id"],
            states[3]["your_secret_character"]["id"],
        )

        self._emit_valid_question_for_game(clients, states, first_game_id)
        updated_states = [self._latest_state_after_request(client) for client in clients]

        first_game_current = 0 if states[0]["is_your_turn"] else 1
        first_game_rival = 1 - first_game_current
        self.assertEqual(len(updated_states[first_game_current]["history"]), 1)
        self.assertEqual(updated_states[first_game_current]["history"][0]["actor_scope"], "self")
        self.assertEqual(updated_states[first_game_rival]["history"], [])
        self.assertEqual(updated_states[2]["history"], [])
        self.assertEqual(updated_states[3]["history"], [])
        self.assertNotEqual(
            updated_states[0]["current_turn_player_number"],
            states[0]["current_turn_player_number"],
        )
        self.assertEqual(
            updated_states[2]["current_turn_player_number"],
            states[2]["current_turn_player_number"],
        )

        winner_index = 0 if updated_states[0]["is_your_turn"] else 1
        loser_index = 1 - winner_index
        guess_id = updated_states[loser_index]["your_secret_character"]["id"]
        clients[winner_index].emit("guess_character", {"character_id": guess_id})

        final_states = [self._latest_state_after_request(client) for client in clients]
        self.assertEqual(final_states[0]["status"], "finished")
        self.assertEqual(final_states[1]["status"], "finished")
        self.assertEqual(final_states[2]["status"], "active")
        self.assertEqual(final_states[3]["status"], "active")
        self.assertIsNotNone(final_states[0]["winner_player_number"])
        self.assertIsNone(final_states[2]["winner_player_number"])

    def test_normal_connection_does_not_enter_any_queue(self):
        client = server.socketio.test_client(server.app)
        events = client.get_received()

        self.assertTrue(client.is_connected())
        self.assertTrue(any(event["name"] == "connected" for event in events))
        self.assertFalse(any(event["name"] == "queue_status" for event in events))
        self.assertFalse(any(event["name"] == "state_update" for event in events))

        with server.state_lock:
            self.assertEqual(server.waiting_players, [])
            self.assertEqual(server.private_rooms, {})
            self.assertEqual(server.active_games, {})

    def test_waiting_modes_are_cleaned_when_cancelled_or_disconnected(self):
        public_client = server.socketio.test_client(server.app)
        self._join_public_queue(public_client)

        with server.state_lock:
            self.assertEqual(len(server.waiting_players), 1)

        public_client.emit("cancel_matchmaking")
        public_client.get_received()

        with server.state_lock:
            self.assertEqual(server.waiting_players, [])

        private_client = server.socketio.test_client(server.app)
        self._create_qr_room(private_client)
        room = self._private_room_created(private_client)

        with server.state_lock:
            self.assertIn(room["room_code"], server.private_rooms)

        private_client.emit("cancel_matchmaking")
        private_client.get_received()

        with server.state_lock:
            self.assertNotIn(room["room_code"], server.private_rooms)

    def test_leave_game_cleans_public_queue_and_private_room_waiting(self):
        public_client = server.socketio.test_client(server.app)
        self._join_public_queue(public_client)
        public_client.emit("leave_game")
        public_events = public_client.get_received()

        self.assertTrue(any(event["name"] == "left_game" for event in public_events))
        with server.state_lock:
            self.assertEqual(server.waiting_players, [])

        private_client = server.socketio.test_client(server.app)
        self._create_qr_room(private_client)
        room = self._private_room_created(private_client)
        private_client.emit("leave_game")
        private_events = private_client.get_received()

        self.assertTrue(any(event["name"] == "left_game" for event in private_events))
        with server.state_lock:
            self.assertNotIn(room["room_code"], server.private_rooms)

    def test_leave_active_game_gives_opponent_win_and_cleans_indexes(self):
        clients = [server.socketio.test_client(server.app) for _ in range(2)]
        for client in clients:
            self._join_public_queue(client)

        states = [self._latest_state(client) for client in clients]
        leaving_index = 0
        opponent_index = 1
        game_id = states[leaving_index]["game_id"]

        clients[leaving_index].emit("leave_game")
        leaving_events = clients[leaving_index].get_received()
        opponent_state = self._latest_state(clients[opponent_index])

        self.assertTrue(any(event["name"] == "left_game" for event in leaving_events))
        self.assertEqual(opponent_state["status"], "finished")
        self.assertTrue(opponent_state["you_won"])
        self.assertEqual(opponent_state["history"][-1]["type"], "leave")
        self.assertEqual(opponent_state["history"][-1]["actor_scope"], "rival")

        with server.state_lock:
            self.assertNotIn(game_id, server.active_games)
            self.assertEqual(server.player_to_game, {})

    def test_correct_guess_wins_immediately(self):
        clients = [server.socketio.test_client(server.app) for _ in range(2)]
        for client in clients:
            self._join_public_queue(client)

        states = [self._latest_state(client) for client in clients]
        current_index = 0 if states[0]["is_your_turn"] else 1
        rival_index = 1 - current_index
        correct_id = states[rival_index]["your_secret_character"]["id"]

        clients[current_index].emit("guess_character", {"character_id": correct_id})
        final_states = [self._latest_state_after_request(client) for client in clients]

        self.assertEqual(final_states[current_index]["status"], "finished")
        self.assertTrue(final_states[current_index]["you_won"])
        self.assertFalse(final_states[rival_index]["you_won"])
        self.assertFalse(final_states[current_index]["can_guess"])
        self.assertEqual(final_states[current_index]["winner_player_number"], states[current_index]["player_number"])
        self.assertTrue(final_states[current_index]["history"][-1]["answer"])

    def test_wrong_guess_loses_immediately_and_blocks_more_actions(self):
        clients = [server.socketio.test_client(server.app) for _ in range(2)]
        for client in clients:
            self._join_public_queue(client)

        states = [self._latest_state(client) for client in clients]
        current_index = 0 if states[0]["is_your_turn"] else 1
        rival_index = 1 - current_index
        wrong_id = states[current_index]["your_secret_character"]["id"]

        clients[current_index].emit("guess_character", {"character_id": wrong_id})
        final_states = [self._latest_state_after_request(client) for client in clients]

        self.assertEqual(final_states[current_index]["status"], "finished")
        self.assertFalse(final_states[current_index]["you_won"])
        self.assertTrue(final_states[rival_index]["you_won"])
        self.assertFalse(final_states[current_index]["can_guess"])
        self.assertEqual(final_states[current_index]["winner_player_number"], states[rival_index]["player_number"])
        self.assertFalse(final_states[current_index]["history"][-1]["answer"])
        self.assertEqual(final_states[current_index]["history"][-1]["character_id"], wrong_id)

        clients[current_index].emit("ask_question", {"attribute": "gafas", "value": True})
        errors = [
            event for event in clients[current_index].get_received()
            if event["name"] == "error_message"
        ]
        self.assertTrue(errors)
        self.assertIn("termino", errors[-1]["args"][0]["message"])

        disconnecting_creator = server.socketio.test_client(server.app)
        self._create_qr_room(disconnecting_creator)
        room = self._private_room_created(disconnecting_creator)
        disconnecting_creator.disconnect()

        with server.state_lock:
            self.assertNotIn(room["room_code"], server.private_rooms)

    def test_accessory_questions_only_allow_curated_values(self):
        clients = [server.socketio.test_client(server.app) for _ in range(2)]
        for client in clients:
            self._join_public_queue(client)

        states = [self._latest_state(client) for client in clients]
        current_index = 0 if states[0]["is_your_turn"] else 1

        clients[current_index].emit(
            "ask_question",
            {"attribute": "accesorio", "value": "broche"},
        )
        errors = [
            event for event in clients[current_index].get_received()
            if event["name"] == "error_message"
        ]

        self.assertTrue(errors)
        self.assertIn("valor", errors[-1]["args"][0]["message"])

        state_after_error = self._latest_state_after_request(clients[current_index])
        self.assertTrue(state_after_error["is_your_turn"])
        self.assertEqual(state_after_error["history"], [])

        clients[current_index].emit(
            "ask_question",
            {"attribute": "accesorio", "value": "aretes"},
        )
        action_events = [
            event for event in clients[current_index].get_received()
            if event["name"] == "action_result"
        ]

        self.assertTrue(action_events)
        self.assertEqual(action_events[-1]["args"][0]["attribute"], "accesorio")
        self.assertEqual(action_events[-1]["args"][0]["value"], "aretes")

    def test_character_accessories_match_curated_question_values(self):
        allowed_accessories = {"aretes", "bufanda", "collar", "corbata"}
        accessory_counts = Counter(
            character["accesorio"] for character in CHARACTERS
        )

        self.assertEqual(set(accessory_counts), allowed_accessories)
        self.assertEqual(sum(accessory_counts.values()), len(CHARACTERS))
        for accessory in allowed_accessories:
            self.assertGreater(accessory_counts[accessory], 0)

    def test_characters_keep_avatar_fallback_and_image_path(self):
        expected_images = {
            "Ana": "/static/img/characters/ana.png",
            "Bruno": "/static/img/characters/bruno.png",
            "Carla": "/static/img/characters/carla.png",
            "Diego": "/static/img/characters/diego.png",
            "Elena": "/static/img/characters/elena.png",
            "Felipe": "/static/img/characters/felipe.png",
            "Gabriela": "/static/img/characters/gabriela.png",
            "Hector": "/static/img/characters/hector.png",
            "Isabel": "/static/img/characters/isabel.png",
            "Jorge": "/static/img/characters/jorge.png",
            "Laura": "/static/img/characters/laura.png",
            "Mateo": "/static/img/characters/mateo.png",
            "Natalia": "/static/img/characters/natalia.png",
            "Oscar": "/static/img/characters/oscar.png",
            "Paula": "/static/img/characters/paula.png",
            "Rafael": "/static/img/characters/rafael.png",
        }

        self.assertEqual(len(CHARACTERS), 16)
        for character in CHARACTERS:
            self.assertEqual(character["imagen"], expected_images[character["nombre"]])
            self.assertTrue(character["avatar"])

    def test_audio_controls_and_confetti_are_wired_in_static_files(self):
        html = Path("templates/index.html").read_text(encoding="utf-8")
        client_js = Path("static/js/client.js").read_text(encoding="utf-8")

        self.assertIn("music-toggle-button", html)
        self.assertIn("effects-toggle-button", html)
        self.assertIn("canvas-confetti@1.9.3", html)

        for audio_file in [
            "waiting-music.mp3",
            "game-music.mp3",
            "click.mp3",
            "card-flip.mp3",
            "question.mp3",
            "correct.mp3",
            "wrong.mp3",
            "victory.mp3",
            "defeat.mp3",
        ]:
            self.assertIn(f"/static/audio/{audio_file}", client_js)

        for function_name in [
            "enableAudio",
            "playSound",
            "playMusic",
            "stopMusic",
            "stopAllAudio",
            "setAudioEnabled",
            "updateAudioButton",
            "launchVictoryConfetti",
        ]:
            self.assertIn(f"function {function_name}", client_js)

    def test_answer_popup_is_wired_to_question_results(self):
        html = Path("templates/index.html").read_text(encoding="utf-8")
        client_js = Path("static/js/client.js").read_text(encoding="utf-8")
        styles = Path("static/css/styles.css").read_text(encoding="utf-8")

        self.assertIn("id=\"answer-popup\"", html)
        self.assertIn("function showAnswerPopup", client_js)
        self.assertIn("showAnswerPopup(action.answer)", client_js)
        self.assertIn(".answer-popup.show", styles)
        self.assertIn(".answer-popup.success", styles)
        self.assertIn(".answer-popup.error", styles)

    def test_two_qr_games_are_isolated(self):
        creator_one = server.socketio.test_client(server.app)
        self._create_qr_room(creator_one)
        room_one = self._private_room_created(creator_one)

        creator_two = server.socketio.test_client(server.app)
        self._create_qr_room(creator_two)
        room_two = self._private_room_created(creator_two)

        self.assertNotEqual(room_one["room_code"], room_two["room_code"])

        guest_one = server.socketio.test_client(
            server.app,
            query_string=f"room={room_one['room_code']}",
        )
        guest_two = server.socketio.test_client(
            server.app,
            query_string=f"room={room_two['room_code']}",
        )

        guest_one.emit("join_private_room", {"room": room_one["room_code"]})
        guest_two.emit("join_private_room", {"room": room_two["room_code"]})

        clients = [creator_one, guest_one, creator_two, guest_two]
        states = [self._latest_state(client) for client in clients]

        self.assertEqual(states[0]["game_id"], states[1]["game_id"])
        self.assertEqual(states[2]["game_id"], states[3]["game_id"])
        self.assertNotEqual(states[0]["game_id"], states[2]["game_id"])
        self.assertEqual(states[0]["player_number"], 1)
        self.assertEqual(states[1]["player_number"], 2)
        self.assertEqual(states[2]["player_number"], 1)
        self.assertEqual(states[3]["player_number"], 2)

        self._emit_valid_question_for_game(clients, states, states[0]["game_id"])
        updated_states = [self._latest_state_after_request(client) for client in clients]

        current_index = 0 if states[0]["is_your_turn"] else 1
        rival_index = 1 - current_index
        self.assertEqual(len(updated_states[current_index]["history"]), 1)
        self.assertEqual(updated_states[current_index]["history"][0]["actor_scope"], "self")
        self.assertEqual(updated_states[rival_index]["history"], [])
        self.assertEqual(updated_states[2]["history"], [])
        self.assertEqual(updated_states[3]["history"], [])

    def test_qr_game_and_automatic_game_do_not_mix(self):
        qr_creator = server.socketio.test_client(server.app)
        self._create_qr_room(qr_creator)
        room = self._private_room_created(qr_creator)

        auto_one = server.socketio.test_client(server.app)
        auto_two = server.socketio.test_client(server.app)
        self._join_public_queue(auto_one)
        self._join_public_queue(auto_two)

        qr_guest = server.socketio.test_client(
            server.app,
            query_string=f"room={room['room_code']}",
        )
        qr_guest.emit("join_private_room", {"room": room["room_code"]})

        qr_states = [self._latest_state(qr_creator), self._latest_state(qr_guest)]
        auto_states = [self._latest_state(auto_one), self._latest_state(auto_two)]

        self.assertEqual(qr_states[0]["game_id"], qr_states[1]["game_id"])
        self.assertEqual(auto_states[0]["game_id"], auto_states[1]["game_id"])
        self.assertNotEqual(qr_states[0]["game_id"], auto_states[0]["game_id"])

        self._emit_valid_question_for_game(
            [qr_creator, qr_guest],
            qr_states,
            qr_states[0]["game_id"],
        )
        qr_states_after = [
            self._latest_state_after_request(qr_creator),
            self._latest_state_after_request(qr_guest),
        ]
        auto_states_after = [
            self._latest_state_after_request(auto_one),
            self._latest_state_after_request(auto_two),
        ]

        qr_current_index = 0 if qr_states[0]["is_your_turn"] else 1
        qr_rival_index = 1 - qr_current_index
        self.assertEqual(len(qr_states_after[qr_current_index]["history"]), 1)
        self.assertEqual(qr_states_after[qr_current_index]["history"][0]["actor_scope"], "self")
        self.assertEqual(qr_states_after[qr_rival_index]["history"], [])
        self.assertEqual(auto_states_after[0]["history"], [])
        self.assertEqual(auto_states_after[1]["history"], [])

    def _latest_state(self, client):
        events = client.get_received()
        state_events = [event for event in events if event["name"] == "state_update"]
        self.assertTrue(state_events, events)
        return state_events[-1]["args"][0]

    def _latest_state_after_request(self, client):
        client.emit("request_state")
        return self._latest_state(client)

    def _join_public_queue(self, client):
        client.get_received()
        client.emit("join_public_queue")

    def _emit_valid_question_for_game(self, clients, states, game_id):
        game_indexes = [
            index for index, state in enumerate(states) if state["game_id"] == game_id
        ]
        current_index = next(
            index for index in game_indexes if states[index]["is_your_turn"]
        )
        rival_index = next(index for index in game_indexes if index != current_index)
        rival_has_glasses = states[rival_index]["your_secret_character"]["gafas"]

        clients[current_index].emit(
            "ask_question",
            {"attribute": "gafas", "value": rival_has_glasses},
        )

    def _create_qr_room(self, client):
        client.get_received()
        client.emit("create_private_room")

    def _private_room_created(self, client):
        events = client.get_received()
        room_events = [
            event for event in events if event["name"] == "private_room_created"
        ]
        self.assertTrue(room_events, events)
        return room_events[-1]["args"][0]


if __name__ == "__main__":
    unittest.main()
