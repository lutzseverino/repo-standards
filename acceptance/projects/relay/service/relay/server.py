import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    deliveries = 0

    def do_GET(self):
        if self.path == "/health":
            body = json.dumps({"status": "ok", "deliveries": self.deliveries}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def log_message(self, format, *args):
        pass


parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8765)
args = parser.parse_args()
ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
