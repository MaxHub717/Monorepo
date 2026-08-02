#!/bin/sh
set -eu

echo "========================================"
echo " NexGen Web Container"
echo "========================================"

wait_for() {
    NAME="$1"
    HOST="$2"
    PORT="$3"

    echo "Waiting for ${NAME} (${HOST}:${PORT})..."

    until nc -z "$HOST" "$PORT"; do
        sleep 2
    done

    echo "${NAME} is available."
}

####################################################
# Wait for API
####################################################

API_HOST="${API_HOST:-api}"
API_PORT="${API_PORT:-3000}"

wait_for "API" "$API_HOST" "$API_PORT"

####################################################
# Start Next.js
####################################################

echo "Starting Web..."

exec "$@"