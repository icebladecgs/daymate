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
LAUNCHD_LABEL="${DAYMATE_LAUNCHD_LABEL:-com.daymate.telegram-agent}"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"
LAUNCHD_DOMAIN="gui/$(id -u)"
LAUNCHD_TEMPLATE="$ROOT_DIR/scripts/com.daymate.telegram-agent.plist.template"

mkdir -p "$LOG_DIR"

launchd_installed() {
  [ -f "$LAUNCHD_PLIST" ]
}

launchd_loaded() {
  launchctl print "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" >/dev/null 2>&1
}

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
  if launchd_installed; then
    if launchd_loaded; then
      if PID="$(agent_pid)"; then
        echo "Telegram agent is running via launchd. PID=$PID"
      else
        echo "Telegram agent LaunchAgent is loaded. PID not detected yet."
      fi
    else
      echo "Telegram agent LaunchAgent is installed but not loaded."
    fi
    return
  fi

  if PID="$(agent_pid)"; then
    echo "Telegram agent is running. PID=$PID"
  else
    echo "Telegram agent is stopped."
  fi
}

stop_agent() {
  if launchd_installed; then
    if launchd_loaded; then
      launchctl bootout "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST" >/dev/null 2>&1 || true
      rm -f "$PID_FILE"
      echo "Stopped Telegram agent LaunchAgent."
    else
      echo "Telegram agent LaunchAgent is already unloaded."
    fi
    return
  fi

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

  if launchd_installed; then
    if launchd_loaded; then
      launchctl kickstart -k "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" >/dev/null 2>&1 || true
      sleep 2
      show_status
      return
    fi

    launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST"
    sleep 2
    show_status
    return
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
  if launchd_installed; then
    echo "== launchd =="
    launchctl print "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" 2>/dev/null | tail -n 20 || true
  fi
}

install_launchd() {
  if [ ! -f "$LAUNCHD_TEMPLATE" ]; then
    echo "LaunchAgent template not found: $LAUNCHD_TEMPLATE"
    exit 1
  fi
  mkdir -p "$(dirname "$LAUNCHD_PLIST")"
  sed -e "s|__PROJECT_ROOT__|$ROOT_DIR|g" -e "s|__PYTHON_EXE__|$PYTHON_EXE|g" "$LAUNCHD_TEMPLATE" > "$LAUNCHD_PLIST"
  chmod 644 "$LAUNCHD_PLIST"
  echo "Installed LaunchAgent plist: $LAUNCHD_PLIST"
  launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST" >/dev/null 2>&1 || launchctl kickstart -k "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" >/dev/null 2>&1 || true
  sleep 2
  show_status
}

uninstall_launchd() {
  if launchd_loaded; then
    launchctl bootout "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST" >/dev/null 2>&1 || true
  fi
  if [ -f "$LAUNCHD_PLIST" ]; then
    rm -f "$LAUNCHD_PLIST"
    echo "Removed LaunchAgent plist."
  else
    echo "LaunchAgent plist is not installed."
  fi
  rm -f "$PID_FILE"
}

case "$ACTION" in
  start) start_agent ;;
  stop) stop_agent ;;
  restart) stop_agent; start_agent ;;
  status) show_status ;;
  logs) show_logs ;;
  install-launchd) install_launchd ;;
  uninstall-launchd) uninstall_launchd ;;
  *)
    echo "Usage: sh scripts/telegram-agent.sh {start|stop|restart|status|logs|install-launchd|uninstall-launchd}"
    exit 1
    ;;
esac