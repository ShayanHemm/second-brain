#!/bin/zsh
# Double-click to start the local Second Brain service and open it in the browser.
cd "$(dirname "$0")"
source .venv/bin/activate 2>/dev/null || { echo "Run ./install.sh first"; read -r; exit 1; }
python -m sb serve --open
