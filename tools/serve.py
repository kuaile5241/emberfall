#!/usr/bin/env python3
"""Offline loopback-only static server for the built game."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import socket
import sys
import threading
import webbrowser

ROOT = Path(__file__).resolve().parents[1] / 'dist'
PORT = 4173
if not (ROOT / 'index.html').is_file():
    sys.exit('缺少已构建版本，请先在工程目录运行 npm install 和 npm run build。')
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, *args):
        pass
try:
    server = ThreadingHTTPServer(('127.0.0.1', PORT), partial(Handler, directory=str(ROOT)))
except OSError:
    # Reuse only if the existing local service is this exact game.
    import urllib.request
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=2) as r:
            existing = r.read(24000).decode('utf-8', 'replace')
        if '余烬地牢 · 钟下墓城' not in existing:
            raise ValueError('该端口上是其他程序')
    except Exception as exc:
        sys.exit(f'端口 {PORT} 已被其他程序占用，未终止任何服务：{exc}')
    webbrowser.open(f'http://127.0.0.1:{PORT}/')
    sys.exit(0)
print(f'余烬地牢已启动：http://127.0.0.1:{PORT}/\n关闭此终端窗口或按 Ctrl+C 停止。')
if '--no-browser' not in sys.argv:
    threading.Timer(.4, lambda: webbrowser.open(f'http://127.0.0.1:{PORT}/')).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
