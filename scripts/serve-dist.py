#!/usr/bin/env python3
"""Serve a built browser client together with your own UT2004 game data.

Layout (mirrors the production deployment):

    http://127.0.0.1:8080/ut2004/        -> the client directory (--web)
    http://127.0.0.1:8080/ut2004/data/   -> your game data      (--data)

`--data` must point at the folder that contains System/, Maps/, Textures/,
Sounds/, ... (i.e. your own legally obtained UT2004 install directory).

Usage:
    python3 scripts/serve-dist.py --web ./ut2004-web --data /path/to/UT2004 [--port 8080] [--host 127.0.0.1]

Range requests are supported (the engine reads package data lazily over HTTP
byte ranges) and .wasm is served as application/wasm. Stdlib only.
"""
import argparse
import os
import posixpath
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

WEB = None
DATA = None

WS_RE = re.compile(r"bytes=(\d*)-(\d*)")

# Engine-relevant types the mimetypes table may not know.
EXTRA_TYPES = {
    ".wasm": "application/wasm",
    ".ut2": "application/octet-stream",
    ".u": "application/octet-stream",
    ".ucl": "application/octet-stream",
    ".ukx": "application/octet-stream",
    ".utx": "application/octet-stream",
    ".usx": "application/octet-stream",
    ".uax": "application/octet-stream",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".int": "text/plain; charset=utf-8",
    ".ini": "text/plain; charset=utf-8",
    ".json": "application/json",
}


class Handler(SimpleHTTPRequestHandler):
    server_version = "ut2004-wasm-dist/1.0"

    # ---- routing: /ut2004/* -> client, /ut2004/data/* -> game data
    def translate_path(self, path):
        path = urlsplit(path).path
        parts = [p for p in posixpath.normpath(unquote(path)).split("/") if p not in ("", ".", "..")]
        if parts[:2] == ["ut2004", "data"]:
            return os.path.join(DATA, *parts[2:])
        if parts[:1] == ["ut2004"]:
            return os.path.join(WEB, *parts[1:])
        # Shared mobile assets are bundled under WEB/assets/.
        return os.path.join(WEB, *parts)

    def _redirect_root(self):
        path = urlsplit(self.path).path
        if not path.startswith("/ut2004") and not path.startswith("/assets/"):
            self.send_response(302)
            self.send_header("Location", "/ut2004/")
            self.end_headers()
            return True
        return False

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in EXTRA_TYPES:
            return EXTRA_TYPES[ext]
        return super().guess_type(path)

    # ---- byte ranges (SimpleHTTPRequestHandler has none)
    def send_head(self):
        if self._redirect_root():
            return None
        self._range = None
        value = self.headers.get("Range")
        if value:
            file = self.translate_path(self.path)
            if os.path.isdir(file):
                file = os.path.join(file, "index.html")
            if os.path.isfile(file):
                size = os.path.getsize(file)
                m = WS_RE.fullmatch(value.strip())
                if m:
                    start_s, end_s = m.groups()
                    if start_s == "":  # suffix range: last N bytes
                        if end_s == "":
                            start, end = 0, size - 1
                        else:
                            n = min(int(end_s), size)
                            start, end = size - n, size - 1
                    else:
                        start = int(start_s)
                        end = min(int(end_s), size - 1) if end_s else size - 1
                    if 0 <= start <= end < size:
                        stream = open(file, "rb")
                        stream.seek(start)
                        self._range = end - start + 1
                        self.send_response(206)
                        self.send_header("Content-Type", self.guess_type(file))
                        self.send_header("Content-Length", str(self._range))
                        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                        self.send_header("Accept-Ranges", "bytes")
                        self.end_headers()
                        return stream
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return None
        # Precompressed sidecar (same idea as the production Caddy
        # `precompressed br gzip`): serve file.br when the client accepts it.
        # Never for ranged requests — ranges always read the raw file above.
        file = self.translate_path(self.path)
        if (
            "br" in self.headers.get("Accept-Encoding", "")
            and not os.path.isdir(file)
            and os.path.isfile(file + ".br")
        ):
            stream = open(file + ".br", "rb")
            size = os.fstat(stream.fileno()).st_size
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(file))
            self.send_header("Content-Encoding", "br")
            self.send_header("Content-Length", str(size))
            self.end_headers()
            return stream
        return super().send_head()

    def end_headers(self):
        if self.headers.get("Range"):
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_range", None)
        if not remaining:
            return super().copyfile(source, outputfile)
        while remaining:
            chunk = source.read(min(1 << 20, remaining))
            if not chunk:
                raise OSError("file truncated during range response")
            outputfile.write(chunk)
            remaining -= len(chunk)

    # Calmer default logging: show range reads compactly.
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    global WEB, DATA
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--web", required=True, help="directory with index.html + ut2004.js/.wasm (+ manifests)")
    parser.add_argument("--data", required=True, help="your own UT2004 data directory (contains System/, Maps/, ...)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    WEB = os.path.abspath(args.web)
    DATA = os.path.abspath(args.data)
    for name, path in (("--web", WEB), ("--data", DATA)):
        if not os.path.isdir(path):
            parser.error(f"{name}: not a directory: {path}")
    if not os.path.isfile(os.path.join(WEB, "index.html")):
        parser.error(f"--web: no index.html in {WEB}")
    if not os.path.isdir(os.path.join(DATA, "System")):
        parser.error(f"--data: no System/ under {DATA} (point it at your UT2004 install)")

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"client:  http://{args.host}:{args.port}/ut2004/")
    print(f"web:     {WEB}")
    print(f"data:    {DATA}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
