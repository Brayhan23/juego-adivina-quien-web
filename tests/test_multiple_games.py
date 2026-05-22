import unittest

import app as server


class MultipleGamesTest(unittest.TestCase):
    def setUp(self):
        with server.state_lock:
            server.waiting_players.clear()
            server.active_games.clear()
            server.player_to_game.clear()
            server.game_threads.clear()

    def tearDown(self):
        with server.state_lock:
            server.waiting_players.clear()
            server.active_games.clear()
            server.player_to_game.clear()
            server.game_threads.clear()

    def test_four_clients_create_two_isolated_games(self):
        clients = [server.socketio.test_client(server.app) for _ in range(4)]
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

    def _latest_state(self, client):
        events = client.get_received()
        state_events = [event for event in events if event["name"] == "state_update"]
        self.assertTrue(state_events, events)
        return state_events[-1]["args"][0]

    def _latest_state_after_request(self, client):
        client.emit("request_state")
        return self._latest_state(client)

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


if __name__ == "__main__":
    unittest.main()
