import unittest

import app as server


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

        self.assertEqual(len(updated_states[0]["history"]), 1)
        self.assertEqual(len(updated_states[1]["history"]), 1)
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

        disconnecting_creator = server.socketio.test_client(server.app)
        self._create_qr_room(disconnecting_creator)
        room = self._private_room_created(disconnecting_creator)
        disconnecting_creator.disconnect()

        with server.state_lock:
            self.assertNotIn(room["room_code"], server.private_rooms)

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

        self.assertEqual(len(updated_states[0]["history"]), 1)
        self.assertEqual(len(updated_states[1]["history"]), 1)
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

        self.assertEqual(len(qr_states_after[0]["history"]), 1)
        self.assertEqual(len(qr_states_after[1]["history"]), 1)
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
