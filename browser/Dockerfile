FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV SCREEN_WIDTH=1366
ENV SCREEN_HEIGHT=768
ENV SCREEN_DEPTH=24

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    curl \
    ca-certificates \
    procps \
    net-tools \
    socat \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Link noVNC files to websockify web dir
RUN ln -s /usr/share/novnc/vnc.html /usr/share/novnc/index.html 2>/dev/null || true

# Dedicated non-root user for Chromium execution
RUN useradd -m -u 1000 chromeuser && \
    mkdir -p /home/chromeuser/.config /home/chromeuser/data /tmp/chromium-data /data && \
    chown -R chromeuser:chromeuser /home/chromeuser /tmp/chromium-data /data

WORKDIR /app
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY launch_chromium.sh /app/launch_chromium.sh
COPY entrypoint.sh /app/entrypoint.sh
COPY proxy_auth_relay.py /app/proxy_auth_relay.py
RUN sed -i 's/\r$//' /app/launch_chromium.sh /app/entrypoint.sh /app/proxy_auth_relay.py && \
    chmod +x /app/launch_chromium.sh /app/entrypoint.sh /app/proxy_auth_relay.py


EXPOSE 6080 9222

ENTRYPOINT ["/app/entrypoint.sh"]
