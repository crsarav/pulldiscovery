#!/usr/bin/env bash
# Kill whatever is bound to PORT (default 3000) and start Pull Discovery.
set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-3000}"

kill_port() {
  local pids
  pids="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    echo "Nothing listening on port $PORT"
    return 0
  fi

  echo "Stopping PIDs on port $PORT: $pids"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.5

  pids="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Force-killing PIDs on port $PORT: $pids"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

kill_port

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies…"
  npm install
fi

echo "Starting Pull Discovery at http://localhost:$PORT"
exec npm run dev -- --port "$PORT"
