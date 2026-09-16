#!/usr/bin/env bash
set -euo pipefail

# Hack509 Automated SQLite Backup & Integrity Verification Script
DB_PATH="/opt/hack509/data/db.sqlite3"
BACKUP_DIR="/opt/hack509/backups"
LOG_FILE="${BACKUP_DIR}/backup.log"
TIMESTAMP=$(date +'%Y%m%d_%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sqlite3"
TEST_RESTORE="/tmp/db_restore_test_${TIMESTAMP}.sqlite3"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

log "=== Starting Hack509 SQLite backup ==="

if [ ! -f "${DB_PATH}" ]; then
    log "ERROR: Source database ${DB_PATH} not found!"
    exit 1
fi

# 1. Safe online backup using SQLite atomic backup API
log "Creating atomic snapshot to ${BACKUP_FILE}..."
/usr/bin/sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"

# 2. Check integrity of the created backup
log "Verifying backup integrity..."
INTEGRITY=$(/usr/bin/sqlite3 "${BACKUP_FILE}" "PRAGMA integrity_check;")
if [ "${INTEGRITY}" != "ok" ]; then
    log "ERROR: Integrity check FAILED on backup: ${INTEGRITY}"
    rm -f "${BACKUP_FILE}"
    exit 2
fi
log "Integrity check PASSED."

# 3. Restoration test: simulate restore into test database and verify table count
log "Running restoration test..."
/usr/bin/sqlite3 "${BACKUP_FILE}" ".backup '${TEST_RESTORE}'"
RESTORE_CHECK=$(/usr/bin/sqlite3 "${TEST_RESTORE}" "PRAGMA integrity_check;")
TABLE_COUNT=$(/usr/bin/sqlite3 "${TEST_RESTORE}" "SELECT count(*) FROM sqlite_master WHERE type='table';")
rm -f "${TEST_RESTORE}"

if [ "${RESTORE_CHECK}" != "ok" ] || [ "${TABLE_COUNT}" -le 0 ]; then
    log "ERROR: Restoration test failed! Check: ${RESTORE_CHECK}, Tables: ${TABLE_COUNT}"
    exit 3
fi
log "Restoration test verified successfully (${TABLE_COUNT} tables verified)."

# 4. Retention: Keep last 14 daily backup snapshots
log "Applying retention policy (keeping last 14 days)..."
find "${BACKUP_DIR}" -name "db_backup_*.sqlite3" -type f -mtime +14 -exec rm -f {} \;

BACKUP_SIZE=$(ls -lh "${BACKUP_FILE}" | awk '{print $5}')
log "SUCCESS: Backup completed. File: ${BACKUP_FILE} (Size: ${BACKUP_SIZE})"
