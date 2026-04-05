#!/bin/sh

set -eu

ACTION="${1:-status}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
PYTHON_EXE="$ROOT_DIR/.venv/bin/python"
AGENT_FILE="$ROOT_DIR/telegram_agent.py"
LOG_DIR="$ROOT_DIR/logs"
STDOUT_LOG="$LOG_DIR/telegram-agent.stdout.log"
STDERR_LOG="$LOG_DIR/telegram-agent.stderr.log"
PID_FILE="$LOG_DIR/telegram-agent.pid"

mkdir -p "$LOG_DIR"

agent_pid() {
  if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      printf '%s' "$PID"
      return 0
    fi
    rm -f "$PID_FILE"
  fi

  PID="$(pgrep -f "$ROOT_DIR/telegram_agent.py" | head -n 1 || true)"
  if [ -n "$PID" ]; then
    printf '%s' "$PID" > "$PID_FILE"
    printf '%s' "$PID"
    return 0
  fi

  return 1
}

show_status() {
  if PID="$(agent_pid)"; then
    echo "Telegram agent is running. PID=$PID"
  else
    echo "Telegram agent is stopped."
  fi
}

stop_agent() {
  if PID="$(agent_pid)"; then
    kill "$PID" 2>/dev/null || true
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    echo "Stopped Telegram agent."
  else
    echo "Telegram agent is already stopped."
  fi
}

start_agent() {
  if [ ! -x "$PYTHON_EXE" ]; then
    echo "Python executable not found: $PYTHON_EXE"
    exit 1
  fi
  if [ ! -f "$AGENT_FILE" ]; then
    echo "telegram_agent.py not found: $AGENT_FILE"
    exit 1
  fi

  if PID="$(agent_pid)"; then
    echo "Telegram agent is already running. PID=$PID"
    exit 0
  fi

  (
    cd "$ROOT_DIR"
    nohup "$PYTHON_EXE" telegram_agent.py >> "$STDOUT_LOG" 2>> "$STDERR_LOG" &
    echo $! > "$PID_FILE"
  )
  sleep 2

  if PID="$(agent_pid)"; then
    echo "Telegram agent is running. PID=$PID"
  else
    echo "Telegram agent failed to stay running. Recent stderr:"
    tail -n 20 "$STDERR_LOG" 2>/dev/null || true
    exit 1
  fi
}

show_logs() {
  echo "== stdout =="
  tail -n 20 "$STDOUT_LOG" 2>/dev/null || true
  echo "== stderr =="
  tail -n 20 "$STDERR_LOG" 2>/dev/null || true
}

case "$ACTION" in
  start) start_agent ;;
  stop) stop_agent ;;
  restart) stop_agent; start_agent ;;
  status) show_status ;;
  logs) show_logs ;;
  *)
    echo "Usage: sh scripts/telegram-agent.sh {start|stop|restart|status|logs}"
    exit 1
    ;;
esac