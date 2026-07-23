#!/bin/bash
# deploy.sh — Build and deploy VTrader UI + Insight Server

set -euo pipefail

SERVER="root@164.52.201.122"
UI_REMOTE_PATH="/home/vtrader/vtrader-ui"
SERVER_REMOTE_PATH="/home/vtrader/insights"
SERVER_LOCAL_DIR="insight-server"

SSH_OPTS=(
    -o ServerAliveInterval=15
    -o ServerAliveCountMax=6
    -o TCPKeepAlive=yes
    -o ConnectTimeout=15
)
RSYNC_SSH="ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o TCPKeepAlive=yes -o ConnectTimeout=15"

# ── Retry helper ──────────────────────────────────────────────────────────────
with_retry() {
    local max=$1 delay=$2; shift 2
    local attempt=1
    until "$@"; do
        if [ $attempt -ge $max ]; then
            echo "❌ Failed after $max attempts."
            return 1
        fi
        echo "   ⚠️  Attempt $attempt/$max failed — retrying in ${delay}s..."
        sleep "$delay"
        ((attempt++))
    done
}

############################################################
# Build UI
############################################################

echo "📦 Building UI..."
npm run build

LOCAL_HASH="$(grep -o 'index-[^"]*\.js' dist/index.html | head -1)"
[ -z "$LOCAL_HASH" ] && { echo "❌ Build produced no dist/index.html entry."; exit 1; }
echo "   Built entry: $LOCAL_HASH"

############################################################
# SSH pre-flight check
############################################################

echo "🔌 Checking SSH connection..."
with_retry 5 3 ssh "${SSH_OPTS[@]}" "$SERVER" "echo ok" > /dev/null
echo "   SSH OK"

############################################################
# Deploy UI
############################################################

echo "🚀 Uploading UI to $SERVER:$UI_REMOTE_PATH ..."

with_retry 3 5 \
    rsync -avz --delete --partial --timeout=30 \
        -e "$RSYNC_SSH" \
        --exclude '.DS_Store' \
        dist/ "$SERVER:$UI_REMOTE_PATH/"

############################################################
# Verify UI (non-fatal — rsync already confirmed transfer)
############################################################

sleep 2  # let the SSH daemon free its connection slot

echo "🔍 Verifying deployed UI..."
REMOTE_HASH=""
for i in 1 2 3; do
    REMOTE_HASH="$(ssh "${SSH_OPTS[@]}" "$SERVER" \
        "grep -o 'index-[^\"]*\.js' $UI_REMOTE_PATH/index.html | head -1" 2>/dev/null)" && break
    echo "   ⚠️  Verify attempt $i/3 failed — retrying in 3s..."
    sleep 3
done

echo "   Local : $LOCAL_HASH"
echo "   Remote: ${REMOTE_HASH:-<could not read>}"

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    echo "✅ UI deployment verified."
elif [ -z "$REMOTE_HASH" ]; then
    echo "⚠️  Could not verify remotely (SSH unstable) — rsync reported success."
else
    echo "❌ Hash mismatch — aborting."
    exit 1
fi

############################################################
# Deploy Backend
############################################################

echo ""
echo "🚀 Uploading Insight Server..."
sleep 2

with_retry 3 5 \
    rsync -avz --delete --partial --timeout=30 \
        -e "$RSYNC_SSH" \
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
# Restart Backend Service
############################################################

sleep 2
echo "🔄 Restarting VTrader Insights service..."
with_retry 3 5 ssh "${SSH_OPTS[@]}" "$SERVER" "systemctl restart vtrader-insights.service"
echo "✅ Backend service restarted."

echo ""
echo "🎉 Deployment completed successfully!"
echo "   UI      → $UI_REMOTE_PATH"
echo "   Backend → $SERVER_REMOTE_PATH"
