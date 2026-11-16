#!/bin/bash
# ==============================================================================
# Proactive PMS - Production MongoDB Automated Backup Script (Pillar 3)
# Target Environment: Linux VPS (Ubuntu / Debian / CentOS)
# Recommended Cron: 0 2 * * * (Every night at 02:00 AM)
# ==============================================================================

set -euo pipefail

BACKUP_DIR="/var/backups/proactive-mongodb"
LOG_FILE="/var/log/proactive-db-backup.log"
APP_DIR="/var/www/proactive/Proactive_backend"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="${BACKUP_DIR}/proactive-backup-${TIMESTAMP}.archive.gz"
RETENTION_DAYS=14

# Ensure backup and log directories exist
mkdir -p "${BACKUP_DIR}"
touch "${LOG_FILE}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log "========================================================"
log "Starting Proactive PMS Daily Database Backup..."

# Extract MONGO_URI from .env file if available
if [ -f "${APP_DIR}/.env" ]; then
    MONGO_URI=$(grep -E '^MONGO_URI=' "${APP_DIR}/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
else
    MONGO_URI="mongodb://root:secret@localhost:27017/proactive?authSource=admin"
fi

if [ -z "${MONGO_URI}" ]; then
    log "[ERROR] Could not resolve MONGO_URI. Aborting backup."
    exit 1
fi

# Check for mongodump command
if command -v mongodump &> /dev/null; then
    log "Using system mongodump..."
    mongodump --uri="${MONGO_URI}" --archive="${BACKUP_FILE}" --gzip >> "${LOG_FILE}" 2>&1
elif docker ps --format '{{.Names}}' | grep -q "mongo"; then
    log "Using dockerized mongodump inside container..."
    CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep "mongo" | head -n 1)
    docker exec "${CONTAINER_NAME}" mongodump --archive --gzip > "${BACKUP_FILE}" 2>> "${LOG_FILE}"
else
    log "mongodump not found natively. Falling back to Node.js backup runner..."
    cd "${APP_DIR}" && npm run db:backup >> "${LOG_FILE}" 2>&1
    exit 0
fi

# Verify backup creation
if [ -f "${BACKUP_FILE}" ]; then
    FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    log "[SUCCESS] Backup created successfully: ${BACKUP_FILE} (${FILE_SIZE})"
else
    log "[ERROR] Backup file was not generated!"
    exit 1
fi

# Rotate / Prune backups older than RETENTION_DAYS
log "Enforcing retention policy (${RETENTION_DAYS} days)..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -type f -name "proactive-backup-*.archive.gz" -mtime +"${RETENTION_DAYS}" | wc -l)
find "${BACKUP_DIR}" -type f -name "proactive-backup-*.archive.gz" -mtime +"${RETENTION_DAYS}" -delete
log "Cleaned up ${DELETED_COUNT} archive(s) older than ${RETENTION_DAYS} days."

log "Backup completed successfully."
log "========================================================"
