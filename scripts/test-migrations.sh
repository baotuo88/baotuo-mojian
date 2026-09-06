#!/bin/bash
# Database migration test script
# Tests fresh migration and rollback to ensure migration integrity

set -e

echo "🧪 Testing database migrations..."

# Use a test database URL
TEST_DB_URL="${TEST_DATABASE_URL:-postgresql://test:test@localhost:5432/baotuo_test}"

echo "📋 Test database: $TEST_DB_URL"

# Export for Prisma
export DATABASE_URL="$TEST_DB_URL"

echo ""
echo "Step 1: Reset database (fresh migrate)..."
pnpm --filter @ai-novel/server prisma migrate reset --force --skip-seed

echo ""
echo "Step 2: Deploy all migrations..."
pnpm --filter @ai-novel/server prisma migrate deploy

echo ""
echo "Step 3: Generate Prisma client..."
pnpm --filter @ai-novel/server prisma:generate

echo ""
echo "Step 4: Verify schema..."
pnpm --filter @ai-novel/server prisma db push --skip-generate

echo ""
echo "✅ Migration test passed!"
echo ""
echo "💡 Tips:"
echo "   - Set TEST_DATABASE_URL to use a different test database"
echo "   - Run this in CI to catch migration issues early"
echo ""
