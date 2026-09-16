#!/bin/bash
set -e

chmod +x /app/launch_chromium.sh
mkdir -p /data /tmp/chromium-data /tmp/.X11-unix
chown -R chromeuser:chromeuser /data /tmp/chromium-data /home/chromeuser
chmod 1777 /tmp /tmp/.X11-unix

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
