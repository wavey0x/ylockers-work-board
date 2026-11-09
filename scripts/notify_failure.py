"""Send a minimal failure notice; source contents and logs never leave the host."""

import json
import os
import re
import sys
from urllib.request import Request, urlopen


def message(unit, result):
    if unit == "ylockers-work-board-alert-test.service":
        return "🧪 yLockers board alert test\nFailure notifications are working · Electro"
    reason = {"timeout": "timeout", "exit-code": "exit error", "signal": "process stopped", "oom-kill": "out of memory"}.get(result, "error")
    return (
        "⚠️ yLockers board update failed\n"
        f"Electro · {reason} · last snapshot remains available\n"
        "https://ylockers-work-board.wavey.info"
    )


def send_alert(token, chat_id, text, opener=urlopen):
    if not re.fullmatch(r"\d+:[A-Za-z0-9_-]+", token) or not re.fullmatch(r"-?\d+", chat_id):
        raise ValueError("Alert credentials are missing or invalid.")
    request = Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=json.dumps({"chat_id": chat_id, "text": text, "link_preview_options": {"is_disabled": True}}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener(request, timeout=15) as response:
        if not json.load(response).get("ok"):
            raise RuntimeError("Telegram did not accept the alert.")


def main(argv=None, env=None, sender=send_alert):
    argv = sys.argv[1:] if argv is None else argv
    env = os.environ if env is None else env
    unit = argv[0] if argv else "ylockers-work-board.service"
    try:
        sender(env.get("TELEGRAM_BOT_TOKEN", ""), env.get("TELEGRAM_CHAT_ID", ""), message(unit, env.get("MONITOR_SERVICE_RESULT", "")))
    except Exception:
        # HTTP exceptions can contain the bot token in their URL. Never log them.
        print("Telegram alert delivery failed; systemd will retry.", file=sys.stderr)
        return 1
    print("Telegram failure notification sent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
