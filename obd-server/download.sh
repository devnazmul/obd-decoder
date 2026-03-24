#!/bin/bash

# Download Script for OBD-II Telemetry Server (New Architecture) - logs
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

# Ensure local directories exist
mkdir -p ${LOCAL_DIR}/logs

echo "📥 Downloading logs from ${REMOTE_HOST}..."

# Sync logs from remote to local
# We don't use --delete here to avoid losing local logs that might have been rotated on the server
sshpass -e rsync -av \
    -e ssh \
    ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/logs/ ${LOCAL_DIR}/logs/

echo "🎉 Download complete!"
echo "   Logs → ./logs/"
