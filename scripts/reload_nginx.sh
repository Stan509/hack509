#!/usr/bin/env bash
# Triggered by Certbot post-renewal hook to reload Nginx inside the Docker frontend container
FRONTEND_CID=$(docker ps -q -f name=frontend)
if [ -n "${FRONTEND_CID}" ]; then
    docker exec "${FRONTEND_CID}" nginx -s reload || true
fi
