#!/usr/bin/env python3
"""Loopback test server with the single byte ranges Emscripten LazyFile requests."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import re

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        self.remaining = None
        value = self.headers.get('Range')
        if not value:
            return super().send_head()
        file = Path(self.translate_path(self.path))
        if not file.is_file():
            return super().send_head()
        size = file.stat().st_size
        match = re.fullmatch(r'bytes=(\d+)-(\d+)', value)
        if not match or not (0 <= int(match[1]) <= int(match[2]) < size):
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        start, end = map(int, match.groups())
        stream = file.open('rb')
        stream.seek(start)
        self.remaining = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(file)))
        self.send_header('Content-Length', str(self.remaining))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        self.log_message('RANGE %s %d-%d bytes=%d', self.path, start, end, self.remaining)
        return stream

    def copyfile(self, source, outputfile):
        if self.remaining is None:
            return super().copyfile(source, outputfile)
        while self.remaining:
            chunk = source.read(min(65536, self.remaining))
            if not chunk:
                raise OSError('file truncated during range response')
            outputfile.write(chunk)
            self.remaining -= len(chunk)

if __name__ == '__main__':
    os.chdir(os.environ.get('UT_HTTP_ROOT', Path(__file__).resolve().parents[1]))
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('UT_HTTP_PORT', '8765'))), Handler).serve_forever()
