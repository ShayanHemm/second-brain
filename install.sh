#!/bin/zsh
# One-time setup: a private Python environment, the dependencies, the interface build.
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
$PY -m venv .venv
source .venv/bin/activate
pip install --upgrade pip >/dev/null
pip install -e ".[dev]"
python ui/build.py
echo
echo "Installed. Next:"
echo "  source .venv/bin/activate"
echo "  sb key set            # paste your Anthropic API key (or skip and run 'ant auth login')"
echo "  sb serve --open       # start the service and open the app"
echo "  sb autostart install  # optional: start it at login"
