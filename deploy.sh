#!/bin/bash

# MidatoPay Deployment Script
# Usage: ./deploy.sh [production|development]

set -e

ENVIRONMENT=${1:-production}
COMPOSE_FILE="docker-compose.yml"

if [ "$ENVIRONMENT" = "production" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    echo "🚀 Deploying to PRODUCTION..."
else
    echo "🚀 Deploying to DEVELOPMENT..."
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}📦 Step 1: Pulling latest code...${NC}"
git pull origin main || echo -e "${YELLOW}⚠️  Could not pull from git, continuing...${NC}"

echo -e "${GREEN}📦 Step 2: Building Docker images...${NC}"
docker compose -f $COMPOSE_FILE build --no-cache

echo -e "${GREEN}📦 Step 3: Stopping existing containers...${NC}"
docker compose -f $COMPOSE_FILE down

echo -e "${GREEN}📦 Step 4: Starting PostgreSQL only...${NC}"
docker compose -f $COMPOSE_FILE up -d postgres

echo -e "${GREEN}📦 Step 5: Waiting for PostgreSQL to be healthy...${NC}"
for i in $(seq 1 45); do
  if docker compose -f $COMPOSE_FILE exec -T postgres pg_isready -U midatopay >/dev/null 2>&1; then
    echo -e "${GREEN}   PostgreSQL is ready.${NC}"
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo -e "${RED}   PostgreSQL did not become ready in time.${NC}"
    exit 1
  fi
  sleep 2
done

echo -e "${GREEN}📦 Step 6: Running database migrations (before backend healthcheck)...${NC}"
docker compose -f $COMPOSE_FILE run --rm --no-deps backend npx prisma migrate deploy || {
  echo -e "${YELLOW}⚠️  migrate deploy failed. Check DATABASE_URL / POSTGRES_PASSWORD in repo .env and backend logs.${NC}"
  exit 1
}

echo -e "${GREEN}📦 Step 7: Starting all containers...${NC}"
docker compose -f $COMPOSE_FILE up -d

echo -e "${GREEN}📦 Step 8: Waiting for stack...${NC}"
sleep 5

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}📊 Checking container status...${NC}"
docker compose -f $COMPOSE_FILE ps

echo -e "${GREEN}📋 View logs with: docker compose -f $COMPOSE_FILE logs -f${NC}"
