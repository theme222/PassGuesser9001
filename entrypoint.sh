#!/bin/bash
set -e

# Export container environment variables so cron jobs can access them
printenv | grep -E '^(STUDENT_|PATH|NODE|TZ)' > /etc/environment || true

# Run once in background on container boot (if >=61m since last run or initial run)
/app/cron-runner.sh &

echo "[$(date +'%Y-%m-%d %H:%M:%S %Z')] Starting cron service (interval: 61 minutes, timezone: GMT+7)..."

# Start cron daemon in foreground
exec cron -f -L 15
