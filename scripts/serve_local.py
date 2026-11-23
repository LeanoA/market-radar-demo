#!/usr/bin/env python3
"""Local HTTP server for Market Radar with on-demand Yahoo Finance data refresh."""

from __future__ import annotations

import argparse
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import threading

ROOT_DIR = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT_DIR / "site"
BUILD_SCRIPT = ROOT_DIR / "scripts" / "build_radar.py"
REFRESH_LOCK = threading.Lock()


class MarketRadarHandler(SimpleHTTPRequestHandler):
    """Serve static site files plus local /api/health and /api/refresh endpoints."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self._send_json(HTTPStatus.OK, {"status": "ok", "mode": "local_server"})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/refresh":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Endpoint not found"})
            return

        if not REFRESH_LOCK.acquire(blocking=False):
            self._send_json(HTTPStatus.CONFLICT, {"error": "Refresh already in progress"})
            return

        try:
            proc = subprocess.run(
                ["uv", "run", str(BUILD_SCRIPT)],
                cwd=str(ROOT_DIR),
                capture_output=True,
                text=True,
                timeout=120,
            )
            if proc.returncode != 0:
                self._send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": proc.stderr.strip() or proc.stdout.strip() or "Refresh failed"},
                )
                return

            data_file = SITE_DIR / "data" / "market-radar.json"
            payload = json.loads(data_file.read_text(encoding="utf-8"))
            self._send_json(
                HTTPStatus.OK,
                {
                    "status": "refreshed",
                    "generated_at": payload.get("generated_at"),
                    "data_source": payload.get("data_source"),
                    "universe_size": payload.get("universe_size"),
                },
            )
        except Exception as exc:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        finally:
            REFRESH_LOCK.release()

    def _send_json(self, status: HTTPStatus, body: dict) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve Market Radar locally with live refresh API.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    args = parser.parse_args()

    data_file = SITE_DIR / "data" / "market-radar.json"
    if not data_file.exists():
        print("Initial dataset missing; building market-radar.json...", file=sys.stderr)
        subprocess.run(["uv", "run", str(BUILD_SCRIPT)], cwd=str(ROOT_DIR), check=False)

    handler = partial(MarketRadarHandler, directory=str(SITE_DIR))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Market Radar local server running at http://{args.host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Market Radar server.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
