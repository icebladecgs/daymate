#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "[1/5] Stop Telegram bot"
sh scripts/telegram-agent.sh stop

echo "[2/5] Pull latest code"
git pull origin main

echo "[3/5] Activate virtualenv"
. "$ROOT_DIR/.venv/bin/activate"

echo "[4/5] Sync Python packages"
pip install -r requirements.txt

echo "[5/5] Start Telegram bot"
sh scripts/telegram-agent.sh start

echo "Done"