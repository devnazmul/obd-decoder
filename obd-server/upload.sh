#!/bin/bash

# Project Upload Script for OBD-II Telemetry Server (New Architecture)
set -e

# Configuration
REMOTE_USER="ubuntu"
REMOTE_HOST="54.37.225.65"
REMOTE_DIR="/home/ubuntu/obd-telemetry-server-new"
LOCAL_DIR="."

# Load .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Set SSHPASS for sshpass tool
export SSHPASS=$SERVER_PASSWORD

echo "📦 Building project locally..."
npm install
npm run build

echo "🔄 Syncing files to ${REMOTE_HOST}..."

# Sync files only, using sshpass for authentication
# Note: We now include 'dist' so the remote has the compiled code
sshpass -e rsync -av --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='logs' \
    -e ssh \
    ${LOCAL_DIR}/ ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

echo "✅ Files synced successfully!"

# Ensure directories exist on remote
echo "📁 Ensuring remote directories exist..."
sshpass -e ssh ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${REMOTE_DIR} ${REMOTE_DIR}/logs"

echo "📦 Installing dependencies and building on remote..."
sshpass -e ssh ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_DIR} && npm install && npm run build"

echo "🔄 Restarting service..."
sshpass -e ssh ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_DIR} && (pm2 restart obd-server-new --update-env || pm2 start dist/index.js --name obd-server-new)"
echo "🚀 Service restarted successfully!"
