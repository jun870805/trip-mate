"""Serve only disposable sketches on localhost; no application data or credentials."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=5196)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / 'sketches'
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
    print(f'AI preview: http://127.0.0.1:{args.port}/ai-assistant/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
