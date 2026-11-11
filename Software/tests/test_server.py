import importlib.util
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import json
import threading
import urllib.request
import urllib.error
from functools import partial
import unittest

spec = importlib.util.spec_from_file_location("lab_server", Path(__file__).resolve().parents[1] / "shared/server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class SharedStateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.now = 500_000
        self.path = Path(self.temporary.name) / "preferences.json"
        self.state = server.LabState(self.path, clock=lambda: self.now)

    def report(self, nm, state="on"):
        return self.state.command("/api/report", {"nm": nm, "state": state})

    def test_reports_are_shared_and_expire_using_server_time(self):
        result = self.report(532)
        self.assertEqual(result["reports"]["532"]["state"], "on")
        self.now += 1000
        self.assertEqual(self.state.snapshot()["reports"]["532"]["ageMs"], 1000)
        self.now += server.REPORT_TTL
        self.assertEqual(self.state.snapshot()["reports"]["532"]["state"], "unknown")

    def test_simultaneous_pcs_cannot_exceed_four_on(self):
        for nm in (405, 780, 1550, 632.8):
            self.state.command("/api/wavelengths", {"action": "add", "nm": nm})
        def attempt(nm):
            try:
                self.report(nm)
                return True
            except server.StateError:
                return False
        with ThreadPoolExecutor(max_workers=8) as pool:
            accepted = list(pool.map(attempt, self.state.wavelengths))
        self.assertEqual(sum(accepted), 4)
        snapshot = self.state.snapshot()
        self.assertEqual(sum(r["state"] == "on" for r in snapshot["reports"].values()), 4)
        on = next(nm for nm in self.state.wavelengths if snapshot["reports"][str(nm)]["state"] == "on")
        self.report(on)
        self.report(on, "off")

    def test_characters_and_appearance_persist_but_on_reports_do_not(self):
        self.state.command("/api/character", {"nm": 532, "character": "chewbacca"})
        self.state.command("/api/preferences", {"spaceEnabled": True, "starWarsEnabled": False})
        self.report(532)
        reopened = server.LabState(self.path, clock=lambda: self.now).snapshot()
        self.assertEqual(reopened["characters"]["532"], "chewbacca")
        self.assertTrue(reopened["spaceEnabled"])
        self.assertFalse(reopened["starWarsEnabled"])
        self.assertTrue(all(r["state"] == "unknown" for r in reopened["reports"].values()))
        self.assertNotEqual(reopened["instance"], self.state.instance)

    def test_removing_an_on_laser_is_rejected_and_off_allows_removal(self):
        self.report(971)
        with self.assertRaises(server.StateError):
            self.state.command("/api/wavelengths", {"action": "remove", "nm": 971})
        self.report(971, "off")
        self.state.command("/api/wavelengths", {"action": "remove", "nm": 971})
        self.assertNotIn(971, self.state.snapshot()["wavelengths"])

    def test_invalid_commands_do_not_change_reports(self):
        for data in ({"nm": True, "state": "on"}, {"nm": float("nan"), "state": "on"}, {"nm": 532, "state": "maybe"}, {"nm": 999, "state": "on"}):
            with self.assertRaises(server.StateError):
                self.state.command("/api/report", data)
        with self.assertRaises(server.StateError):
            self.state.command("/api/character", {"nm": 532, "character": "unknown"})
        self.assertTrue(all(r["state"] == "unknown" for r in self.state.snapshot()["reports"].values()))

    def test_character_changes_do_not_reconfirm_a_report(self):
        self.report(1064)
        self.now += 10_000
        changed = self.state.command("/api/character", {"nm": 1064, "character": "green"})
        self.assertEqual(changed["reports"]["1064"]["ageMs"], 10_000)
        self.assertEqual(changed["revision"], 2)

    def test_integral_float_keys_are_normalized(self):
        result = self.report(532.0)
        self.assertEqual(result["reports"]["532"]["state"], "on")
        self.state.command("/api/character", {"nm": 532.0, "character": "palpatine"})
        self.assertEqual(self.state.snapshot()["characters"]["532"], "palpatine")


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.directory = Path(cls.temporary.name)
        (cls.directory / "index.html").write_text("<html><head></head><body>Display</body></html>")
        cls.state = server.LabState(cls.directory / "preferences.json")
        handler = partial(server.LabHandler, state=cls.state, directory=str(cls.directory))
        cls.http = server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.worker = threading.Thread(target=lambda: cls.http.serve_forever(poll_interval=.05), daemon=True)
        cls.worker.start()
        cls.url = f"http://127.0.0.1:{cls.http.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.worker.join()
        cls.temporary.cleanup()

    def post(self, route, data, content_type="application/json", origin=None):
        headers = {"Content-Type": content_type}
        if origin:
            headers["Origin"] = origin
        request = urllib.request.Request(self.url + route, data=data, headers=headers)
        return urllib.request.urlopen(request, timeout=2)

    def test_web_page_enables_the_network_client(self):
        with urllib.request.urlopen(self.url + "/?display=1", timeout=2) as response:
            self.assertIn(b'name="weld-network"', response.read())

    def test_post_from_one_client_is_visible_to_another(self):
        with self.post("/api/report", json.dumps({"nm": 1064, "state": "on"}).encode(), origin=self.url) as response:
            self.assertEqual(json.load(response)["reports"]["1064"]["state"], "on")
        with urllib.request.urlopen(self.url + "/api/state", timeout=2) as response:
            self.assertEqual(json.load(response)["reports"]["1064"]["state"], "on")
            self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_cross_origin_and_form_commands_are_rejected(self):
        body = json.dumps({"nm": 532, "state": "on"}).encode()
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.post("/api/report", body, origin="http://unrelated.example")
        self.assertEqual(caught.exception.code, 403)
        caught.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.post("/api/report", body, content_type="text/plain")
        self.assertEqual(caught.exception.code, 415)
        caught.exception.close()

    def test_nonfinite_json_numbers_are_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.post("/api/report", b'{"nm":NaN,"state":"on"}')
        self.assertEqual(caught.exception.code, 400)
        caught.exception.close()


if __name__ == "__main__":
    unittest.main()
