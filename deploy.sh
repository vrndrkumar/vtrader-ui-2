#!/bin/bash
# deploy.sh — build and push VTrader UI to production
# Usage: ./deploy.sh

set -euo pipefail

SERVER="root@164.52.201.122"
REMOTE_PATH="/home/vtrader/vtrader-ui"

echo "📦 Building (tsc + vite)..."
npm run build

LOCAL_HASH="$(grep -o 'index-[^\"]*\.js' dist/index.html | head -1)"
if [ -z "$LOCAL_HASH" ]; then
  echo "❌ Build produced no dist/index.html entry — aborting."
  exit 1
fi
echo "   Built entry: $LOCAL_HASH"

echo "🚀 Uploading to $SERVER:$REMOTE_PATH ..."
rsync -avz --delete --exclude '.DS_Store' dist/ "$SERVER:$REMOTE_PATH/"

echo "🔍 Verifying deployed index.html..."
REMOTE_HASH="$(ssh "$SERVER" "grep -o 'index-[^\"]*\.js' $REMOTE_PATH/index.html | head -1")"
echo "   Server entry: $REMOTE_HASH"

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
  echo "✅ Deploy verified → https://vtrader.in ($LOCAL_HASH)"
else
  echo "❌ MISMATCH: local=$LOCAL_HASH server=$REMOTE_HASH"
  echo "   The new build did NOT take effect on the server."
  exit 1
fi
