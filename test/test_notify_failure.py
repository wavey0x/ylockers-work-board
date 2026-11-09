import contextlib
import io
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import notify_failure as alerts


class FailureAlerts(unittest.TestCase):
    def test_message_excludes_untrusted_context(self):
        text = alerts.message("SECRET source item", "SECRET error details")
        self.assertNotIn("SECRET", text)
        self.assertIn("yLockers board update failed", text)
        self.assertIn("timeout", alerts.message("ylockers-work-board.service", "timeout"))
        self.assertIn("alert test", alerts.message("ylockers-work-board-alert-test.service", "exit-code"))

    def test_request_is_minimal_and_success_is_checked(self):
        def opener(request, timeout):
            self.assertEqual(timeout, 15)
            self.assertEqual(request.method, "POST")
            payload = json.loads(request.data)
            self.assertEqual(payload["chat_id"], "-123")
            self.assertEqual(payload["text"], "test message")
            self.assertTrue(payload["link_preview_options"]["is_disabled"])
            self.assertNotIn("test_token", request.data.decode())
            return io.BytesIO(b'{"ok":true}')
        alerts.send_alert("123:test_token", "-123", "test message", opener)
        with self.assertRaises(RuntimeError):
            alerts.send_alert("123:test_token", "-123", "test", lambda *a, **kw: io.BytesIO(b'{"ok":false}'))

    def test_failure_does_not_log_credentials(self):
        def broken(*args):
            raise RuntimeError("https://api.telegram.org/bot123:SECRET/sendMessage")
        output = io.StringIO()
        with contextlib.redirect_stderr(output):
            code = alerts.main([], {"TELEGRAM_BOT_TOKEN": "123:SECRET"}, broken)
        self.assertEqual(code, 1)
        self.assertNotIn("SECRET", output.getvalue())
        self.assertIn("will retry", output.getvalue())


if __name__ == "__main__":
    unittest.main()
