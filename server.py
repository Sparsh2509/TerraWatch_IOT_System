"""
TerraWatch - Local Development HTTP Server
Runs a local web server to host the dashboard with zero build configuration.
Run with: python server.py
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 3000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and caching control
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    server_address = ("", PORT)
    try:
        httpd = socketserver.ThreadingTCPServer(server_address, Handler)
    except OSError:
        # If port 3000 is occupied, try 3001
        fallback_port = 3001
        httpd = socketserver.ThreadingTCPServer(("", fallback_port), Handler)
        print(f"Port {PORT} in use. Switching to http://localhost:{fallback_port}")
        server_address = ("", fallback_port)

    actual_port = server_address[1]
    url = f"http://localhost:{actual_port}"
    print("=" * 65)
    print(" TERRAWATCH - LANDSLIDE EARLY WARNING SYSTEM DASHBOARD")
    print("=" * 65)
    print(f" Server running at: {url}")
    print(" Press Ctrl+C to terminate.")
    print("=" * 65)

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping TerraWatch server...")
        httpd.server_close()
        sys.exit(0)

if __name__ == "__main__":
    main()
