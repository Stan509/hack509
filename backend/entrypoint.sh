#!/bin/sh
set -e

echo "Initializing database and default accounts..."
python init_db.py

echo "Starting server..."
exec "$@"
