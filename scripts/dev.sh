#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

source .env

echo "Starting AgentPI dev environment..."

# 1. Start Postgres
echo "Starting Postgres..."
docker compose up -d

# Wait for postgres
echo "Waiting for Postgres..."
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U agentpi > /dev/null 2>&1; then
    echo "Postgres ready."
    break
  fi
  sleep 1
done

# 2. Build packages
echo "Building packages..."
pnpm --filter @agentpi/shared build
pnpm --filter @agentpi/sdk build

# 3. Generate Prisma client & push schema
echo "Setting up database..."
cd apps/example-tool-api
DATABASE_URL="$DATABASE_URL" npx prisma db push --skip-generate 2>/dev/null || true
DATABASE_URL="$DATABASE_URL" npx prisma generate 2>/dev/null
cd "$ROOT_DIR"

# 4. Build apps
echo "Building apps..."
pnpm --filter @agentpi/service build
pnpm --filter @agentpi/example-tool-api build

# 5. Start services
echo ""
echo "Starting services..."
node apps/service/dist/main.js &
AGENTPI_PID=$!

node apps/example-tool-api/dist/main.js &
TOOL_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $AGENTPI_PID $TOOL_PID 2>/dev/null || true
  wait $AGENTPI_PID $TOOL_PID 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

sleep 2
echo ""
echo "═══════════════════════════════════════════════════"
echo "  AgentPI dev environment running"
echo "  AgentPI service:   http://localhost:${AGENTPI_PORT}"
echo "  Example Tool API:  http://localhost:${TOOL_PORT}"
echo "  JWKS:              http://localhost:${AGENTPI_PORT}/.well-known/jwks.json"
echo "  Discovery:         http://localhost:${TOOL_PORT}/.well-known/agentpi.json"
echo ""
echo "  Run the demo:      ./demo.sh"
echo "═══════════════════════════════════════════════════"

wait
