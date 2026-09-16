#!/usr/bin/env python3
"""
Authenticated HTTP/HTTPS Proxy Tunnel for Chromium.
Listens on 127.0.0.1:8888.
Forwards traffic to upstream residential/datacenter proxy (e.g. Decodo)
with Proxy-Authorization header.
"""
import os
import sys
import base64
import asyncio
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("proxy_relay")

UPSTREAM_HOST = os.environ.get("BROWSER_PROXY_HOST", "")
UPSTREAM_PORT = int(os.environ.get("BROWSER_PROXY_PORT", "7000"))
UPSTREAM_USER = os.environ.get("BROWSER_PROXY_USER", "")
UPSTREAM_PASS = os.environ.get("BROWSER_PROXY_PASS", "")

def get_auth_header():
    if UPSTREAM_USER and UPSTREAM_PASS:
        cred = f"{UPSTREAM_USER}:{UPSTREAM_PASS}".encode("utf-8")
        return b"Basic " + base64.b64encode(cred)
    return None

async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

async def handle_client(client_reader, client_writer):
    upstream_writer = None
    try:
        line = await client_reader.readline()
        if not line:
            client_writer.close()
            return

        parts = line.split()
        if len(parts) < 3:
            client_writer.close()
            return

        method = parts[0].decode('latin1').upper()
        target = parts[1].decode('latin1')
        proto = parts[2].decode('latin1')

        headers = []
        while True:
            hdr = await client_reader.readline()
            if not hdr or hdr == b"\r\n" or hdr == b"\n":
                break
            if hdr.lower().startswith(b"proxy-authorization:"):
                continue
            headers.append(hdr)

        auth_hdr = get_auth_header()

        if method == "CONNECT":
            colon_idx = target.find(":")
            if colon_idx != -1:
                t_host = target[:colon_idx]
                t_port = int(target[colon_idx+1:])
            else:
                t_host = target
                t_port = 443

            upstream_reader, upstream_writer = await asyncio.open_connection(UPSTREAM_HOST, UPSTREAM_PORT)
            connect_req = f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n"
            if auth_hdr:
                connect_req += f"Proxy-Authorization: {auth_hdr.decode('latin1')}\r\n"
            connect_req += "Proxy-Connection: Keep-Alive\r\n\r\n"
            upstream_writer.write(connect_req.encode('latin1'))
            await upstream_writer.drain()

            up_resp = await upstream_reader.readline()
            if not up_resp:
                client_writer.close()
                upstream_writer.close()
                return

            while True:
                h = await upstream_reader.readline()
                if not h or h == b"\r\n" or h == b"\n":
                    break

            if b"200" in up_resp:
                client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                await client_writer.drain()
                await asyncio.gather(
                    pipe(client_reader, upstream_writer),
                    pipe(upstream_reader, client_writer),
                    return_exceptions=True
                )
            else:
                client_writer.write(up_resp)
                client_writer.write(b"\r\n")
                await client_writer.drain()
                client_writer.close()
                upstream_writer.close()
        else:
            upstream_reader, upstream_writer = await asyncio.open_connection(UPSTREAM_HOST, UPSTREAM_PORT)
            req = f"{method} {target} {proto}\r\n"
            if auth_hdr:
                req += f"Proxy-Authorization: {auth_hdr.decode('latin1')}\r\n"
            for h in headers:
                req += h.decode('latin1')
            req += "\r\n"
            upstream_writer.write(req.encode('latin1'))
            await upstream_writer.drain()

            await asyncio.gather(
                pipe(client_reader, upstream_writer),
                pipe(upstream_reader, client_writer),
                return_exceptions=True
            )
    except Exception as e:
        logger.debug(f"Proxy relay error: {e}")
    finally:
        try:
            client_writer.close()
            await client_writer.wait_closed()
        except Exception:
            pass
        if upstream_writer:
            try:
                upstream_writer.close()
                await upstream_writer.wait_closed()
            except Exception:
                pass

async def main():
    if not UPSTREAM_HOST:
        logger.info("No upstream proxy configured.")
        return
    server = await asyncio.start_server(handle_client, "127.0.0.1", 8888)
    logger.info(f"Proxy relay listening on 127.0.0.1:8888 -> {UPSTREAM_HOST}:{UPSTREAM_PORT}")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    asyncio.run(main())
