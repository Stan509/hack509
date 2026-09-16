#!/bin/bash
set -e

# Wait for X display to be ready
while [ ! -e /tmp/.X11-unix/X99 ]; do
    sleep 0.2
done
sleep 1

# Terminate any previous relay instance
pkill -f proxy_auth_relay.py || true

PROXY_FLAG=""
if [ -f "/data/proxy.env" ]; then
    source /data/proxy.env
fi

if [ "$BROWSER_PROXY_ENABLED" = "1" ] && [ -n "$BROWSER_PROXY_HOST" ]; then
    echo "Starting local proxy relay to ${BROWSER_PROXY_HOST}:${BROWSER_PROXY_PORT:-7000}..."
    python3 /app/proxy_auth_relay.py &
    sleep 0.5
    PROXY_FLAG="--proxy-server=http://127.0.0.1:8888"
else
    echo "Direct server connection (no proxy active)."
fi

DEFAULT_URL="${START_URL:-https://www.truepeoplesearch.com}"

echo "Starting Chromium on display :99 with URL: $DEFAULT_URL"
exec chromium \
    --remote-debugging-port=9223 \
    --remote-debugging-address=127.0.0.1 \
    --remote-allow-origins=* \
    --user-data-dir=/tmp/chromium-data \
    --no-first-run \
    --no-default-browser-check \
    --disable-dev-shm-usage \
    --disable-gpu \
    --window-size=1366,768 \
    --window-position=0,0 \
    --start-maximized \
    --disable-blink-features=AutomationControlled \
    --no-sandbox \
    $PROXY_FLAG \
    "$DEFAULT_URL"
