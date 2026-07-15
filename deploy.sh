#!/bin/bash
# deploy.sh — Build and deploy VTrader UI + Insight Server

set -euo pipefail

SERVER="root@164.52.201.122"

# Remote paths
UI_REMOTE_PATH="/home/vtrader/vtrader-ui"
SERVER_REMOTE_PATH="/home/vtrader/insights"

# Local backend directory
SERVER_LOCAL_DIR="insight-server"

############################################################
# Build UI
############################################################

echo "📦 Building UI..."
npm run build

LOCAL_HASH="$(grep -o 'index-[^"]*\.js' dist/index.html | head -1)"

if [ -z "$LOCAL_HASH" ]; then
    echo "❌ Build produced no dist/index.html entry — aborting."
    exit 1
fi

echo "   Built entry: $LOCAL_HASH"

############################################################
# Deploy UI
############################################################

echo "🚀 Uploading UI to $SERVER:$UI_REMOTE_PATH ..."

rsync -avz --delete \
    --exclude '.DS_Store' \
    dist/ "$SERVER:$UI_REMOTE_PATH/"

############################################################
# Verify UI
############################################################

echo "🔍 Verifying deployed UI..."

REMOTE_HASH="$(ssh "$SERVER" "grep -o 'index-[^\"]*\.js' $UI_REMOTE_PATH/index.html | head -1")"

echo "   Local : $LOCAL_HASH"
echo "   Remote: $REMOTE_HASH"

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    echo "✅ UI deployment verified."
else
    echo "❌ UI verification failed!"
    echo "   local=$LOCAL_HASH"
    echo "   remote=$REMOTE_HASH"
    exit 1
fi

############################################################
# Deploy Backend
############################################################

echo ""
echo "🚀 Uploading Insight Server..."

rsync -avz --delete \
    --exclude 'node_modules/' \
    --exclude '.git/' \
    --exclude '.idea/' \
    --exclude '.vscode/' \
    --exclude '.DS_Store' \
    --exclude 'dist/' \
    --exclude 'build/' \
    --exclude 'coverage/' \
    --exclude '*.log' \
    "$SERVER_LOCAL_DIR/" \
    "$SERVER:$SERVER_REMOTE_PATH/"

echo "✅ Backend uploaded."

############################################################
# Done
############################################################

echo ""
echo "🎉 Deployment completed successfully!"
echo "   UI      → $UI_REMOTE_PATH"
echo "   Backend → $SERVER_REMOTE_PATH"

############################################################
# Restart Backend Service
############################################################

echo "🔄 Restarting VTrader Insights service..."

ssh "$SERVER" "systemctl restart vtrader-insights.service"

echo "✅ Backend service restarted."