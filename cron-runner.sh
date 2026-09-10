#!/bin/bash
set -u

LOCK_FILE="/tmp/passguesser.lock"
TIMESTAMP_FILE="/app/.last_run"
INTERVAL=3660 # 61 minutes in seconds (61 * 60)

# Prevent concurrent executions
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  exit 0
fi

NOW=$(date +%s)

if [ -f "$TIMESTAMP_FILE" ]; then
  LAST_RUN=$(cat "$TIMESTAMP_FILE" 2>/dev/null || echo 0)
  if [[ "$LAST_RUN" =~ ^[0-9]+$ ]]; then
    ELAPSED=$((NOW - LAST_RUN))
    if [ "$ELAPSED" -lt "$INTERVAL" ]; then
      exit 0
    fi
  fi
fi

echo "$NOW" > "$TIMESTAMP_FILE"

cd /app
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

# Run automation script
npm start
