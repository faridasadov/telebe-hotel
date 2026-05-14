#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DB_FILE="$BASE_DIR/studentstay.db"
BACKUP_DIR="$BASE_DIR/backups"
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "Database not found: $DB_FILE" >&2
  exit 1
fi

cp "$DB_FILE" "$BACKUP_DIR/studentstay-$STAMP.db"
find "$BACKUP_DIR" -type f -name 'studentstay-*.db' -mtime +14 -delete
echo "$BACKUP_DIR/studentstay-$STAMP.db"
