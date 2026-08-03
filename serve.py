import http.server
import socketserver
import webbrowser
import threading
import sys
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def open_browser():
    webbrowser.open(f"http://localhost:{PORT}")

def run_server():
    # Allow port reuse to prevent address already in use errors
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving Dashboard at http://localhost:{PORT}")
        print("Press Ctrl+C to stop.")
        httpd.serve_forever()

if __name__ == "__main__":
    # Change CWD to script directory to ensure path consistency
    os.chdir(DIRECTORY)
    
    # Start the browser open in a separate thread
    threading.Timer(1.0, open_browser).start()
    
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nStopping server...")
        sys.exit(0)
