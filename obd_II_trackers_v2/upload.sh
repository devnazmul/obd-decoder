#!/bin/bash

# Project Upload Script for OBD-II Telemetry Server
set -e

# Configuration
REMOTE_USER="ubuntu"
REMOTE_HOST="54.37.225.65"
REMOTE_DIR="/home/ubuntu/obd-telemetry-server"
LOCAL_DIR="."

# Load .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Set SSHPASS for sshpass tool
export SSHPASS=$SERVER_PASSWORD

echo "🔄 Syncing files to ${REMOTE_HOST}..."

# Sync files only, using sshpass for authentication
sshpass -e rsync -av --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='*.log' \
    -e ssh \
    ${LOCAL_DIR}/ ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

echo "✅ Files synced successfully!"

# Ensure directory exists on remote
echo "📁 Ensuring remote directory exists..."
sshpass -e ssh ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${REMOTE_DIR}"

echo "📦 Installing dependencies and building on remote..."
sshpass -e ssh ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_DIR} && npm install && npm run build"

echo "🔄 Restarting service..."
sshpass -e ssh ${REMOTE_USER}@${REMOTE_HOST} "pm2 restart obd-telemetry-server --update-env || pm2 start dist/index.js --name obd-telemetry-server"
echo "🚀 Service restarted successfully!"
