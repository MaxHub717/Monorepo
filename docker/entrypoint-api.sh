#!/bin/sh
set -eu

echo "========================================"
echo " NexGen API Container"
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
# Wait for infrastructure
####################################################

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"

wait_for "PostgreSQL" "$DB_HOST" "$DB_PORT"
wait_for "Redis" "$REDIS_HOST" "$REDIS_PORT"

####################################################
# Development helper
####################################################

if [ "${NODE_ENV}" = "development" ]; then

    if [ ! -d "node_modules/@prisma/client" ]; then
        echo "Generating Prisma Client..."
        pnpm --filter @nexgen/api exec prisma generate \
            --schema prisma/schema.prisma
    fi

fi

####################################################
# Optional migrations
####################################################

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then

    echo "Running Prisma migrations..."

    pnpm --filter @nexgen/api exec prisma migrate deploy \
        --schema prisma/schema.prisma

fi

####################################################
# Start application
####################################################

echo "Starting API..."

exec "$@"