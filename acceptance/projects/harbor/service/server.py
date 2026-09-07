import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    accepted = 0

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        body = json.dumps({"status": "ok", "accepted": Handler.accepted}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/accept":
            self.send_error(404)
            return
        Handler.accepted += 1
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8765"))), Handler).serve_forever()
