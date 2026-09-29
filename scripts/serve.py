"""Static server for local play, with caching turned off.

The stock http.server hands out cached JS, so edits to creatures.js or game.js
appear not to take effect - which cost a debugging round.
"""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

with socketserver.TCPServer(("127.0.0.1", PORT), NoCache) as httpd:
    print(f"serving on http://127.0.0.1:{PORT}")
    httpd.serve_forever()
