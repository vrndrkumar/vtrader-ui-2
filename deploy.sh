#!/bin/bash
# deploy.sh — build and push VTrader UI to production
# Usage: ./deploy.sh

set -e

SERVER="root@164.52.201.122"
REMOTE_PATH="/home/vtrader/vtrader-ui"

echo "📦 Building..."
npm run build

echo "🚀 Uploading to $SERVER:$REMOTE_PATH ..."
rsync -avz --delete \
  --exclude '.DS_Store' \
  dist/ "$SERVER:$REMOTE_PATH/"

echo "✅ Deploy complete → https://vtrader.in"
