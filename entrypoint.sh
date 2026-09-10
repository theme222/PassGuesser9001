#!/bin/bash
set -e

# Export container environment variables so cron jobs can access them
printenv | grep -E '^(STUDENT_|PATH|NODE|TZ|PLAYWRIGHT_)' > /etc/environment || true

# Ensure cron log file exists
touch /var/log/cron.log

# Stream cron.log to container stdout so docker compose logs shows real-time output
tail -F /var/log/cron.log &

# Run once in background on container boot (if >=61m since last run or initial run)
/app/cron-runner.sh >> /var/log/cron.log 2>&1 &

echo "[$(date +'%Y-%m-%d %H:%M:%S %Z')] Starting cron service (interval: 61 minutes, timezone: GMT+7)..."

# Start cron daemon in foreground
exec cron -f -L 15
