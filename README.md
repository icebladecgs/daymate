# DayMate

DayMate is a React + Vite personal dashboard for daily tasks, habits, journaling, community features, challenges, Telegram notifications, and lightweight serverless automations.

## Local development

```bash
npm install
npm run dev
```

Python tools used by `telegram_agent.py`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Build for production:

```bash
npm run build
```

## Frontend stack

- React 19
- Vite 7
- Firebase client SDK
- Web Push / PWA support

## Serverless endpoints

The `api/` directory contains Vercel serverless functions for:

- Telegram notifications and webhook automation
- Market and stock search proxy endpoints
- Push notifications and cron jobs
- Widget data responses

## Required environment variables

Common:

- `FIREBASE_SERVICE_ACCOUNT`: Firebase Admin service account JSON
- `FIREBASE_USER_UID`: target user UID for personal automations
- `CRON_SECRET`: bearer token for cron-protected endpoints

Telegram:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`: optional, recommended for `/api/telegram-webhook`

Telegram local dev agent:

- `VERCEL_TOKEN`: optional, used by `telegram_agent.py` to poll deployment status after `git push`
- `VERCEL_PROJECT_ID`: optional, required with `VERCEL_TOKEN` for deployment polling
- `VERCEL_TEAM_ID`: optional, only needed when the Vercel project belongs to a team scope

AI / market:

- `ANTHROPIC_API_KEY`
- `FINNHUB_KEY`

Push:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VITE_VAPID_PUBLIC_KEY`

Widget protection:

- `WIDGET_ACCESS_TOKEN`: optional, when set `/api/widget` requires a matching bearer token, `X-Widget-Token`, or `?token=`
- `WIDGET_ALLOWED_ORIGINS`: optional comma-separated allowlist for browser origins calling `/api/widget`

Optional app metadata:

- `USER_NAME`
- `SELECTED_ASSETS`
- `NOTIFY_TYPE`

## Notes

- If `TELEGRAM_WEBHOOK_SECRET_TOKEN` is configured, Telegram webhook requests must include `x-telegram-bot-api-secret-token`.
- `telegram_agent.py` no longer embeds Vercel credentials; set `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` in `.env.local` if you want Telegram deployment-complete notifications.
- If `WIDGET_ACCESS_TOKEN` is configured, existing widget clients or shortcuts must be updated to send that token.
- Several endpoints are intended for a single-user deployment model driven by `FIREBASE_USER_UID`.

## Dev ergonomics

Environment bootstrap:

- Copy `.env.local.example` to `.env.local` and fill real secrets.
- Install Node deps with `npm install`.
- Install Python deps with `pip install -r requirements.txt` inside `.venv`.

Telegram dev bot, Windows host:

- `npm run tg:start`
- `npm run tg:stop`
- `npm run tg:restart`
- `npm run tg:status`

Telegram dev bot, Mac host:

- `npm run tg:mac:start`
- `npm run tg:mac:stop`
- `npm run tg:mac:restart`
- `npm run tg:mac:status`
- `npm run tg:mac:logs`
- `npm run tg:mac:launchd:install`
- `npm run tg:mac:launchd:uninstall`
- `npm run tg:mac:update`

If the Mac bot is managed by LaunchAgent:

- Do not stop it with `pkill` only. `launchd` may immediately restart it.
- Use `npm run tg:mac:stop` so the helper calls `launchctl bootout` when a LaunchAgent plist exists.
- Use `npm run tg:mac:start` or `npm run tg:mac:restart` so the helper calls `launchctl bootstrap` / `kickstart`.
- A plist template is available at `scripts/com.daymate.telegram-agent.plist.template`.
- `npm run tg:mac:launchd:install` writes the plist with your real paths and loads it immediately.
- `npm run tg:mac:launchd:uninstall` unloads and removes the plist cleanly.

Recommended daily flow for your current setup:

1. Develop on Windows.
2. Commit/push changes.
3. On Mac, stop the Telegram bot, `git pull origin main`, then restart the bot.
4. Keep only one Telegram polling bot running at a time.

Mac refresh sequence:

```bash
cd ~/daymate
npm run tg:mac:stop
git pull origin main
source .venv/bin/activate
pip install -r requirements.txt
npm run tg:mac:start
```

Shortcut:

```bash
npm run tg:mac:update
```

This runs the stop → pull → venv activate → `pip install -r requirements.txt` → start flow for you.

If dependencies did not change, the `pip install -r requirements.txt` step is safe to keep and usually quick.

LaunchAgent note:

```bash
# unload fully before pull/restart if launchd manages the bot
npm run tg:mac:stop
git pull origin main
npm run tg:mac:start
```

You can install the LaunchAgent automatically with `npm run tg:mac:launchd:install`.

If you still want to install it manually, copy `scripts/com.daymate.telegram-agent.plist.template` to `~/Library/LaunchAgents/com.daymate.telegram-agent.plist` and replace `__PROJECT_ROOT__` and `__PYTHON_EXE__` with real absolute paths.
