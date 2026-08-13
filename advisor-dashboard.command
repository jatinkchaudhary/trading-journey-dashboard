#!/bin/bash
# ────────────────────────────────────────────────────────────────
#  Trading Journey Dashboard — one-click refresh & view (macOS)
#  Double-click this file (or run: bash advisor-dashboard.command)
#  It downloads the latest dashboard and opens it in your browser.
# ────────────────────────────────────────────────────────────────
set -e
DIR="$HOME/TradingJourney"
ZIP_URL="https://github.com/jatinkchaudhary/trading-journey-dashboard/archive/refs/heads/main.zip"
PORT=4173

echo "Fetching the latest Trading Journey dashboard..."
rm -rf "$DIR"
mkdir -p "$DIR"
curl -fsSL "$ZIP_URL" -o "$DIR/site.zip"
unzip -q "$DIR/site.zip" -d "$DIR"
rm "$DIR/site.zip"
SITE=$(find "$DIR" -maxdepth 1 -type d -name "trading-journey-dashboard-*" | head -1)

# Stop any previous copy of the dashboard server, then start a fresh one
lsof -ti tcp:$PORT | xargs kill 2>/dev/null || true
cd "$SITE"
nohup python3 -m http.server $PORT >/dev/null 2>&1 &
sleep 1
open "http://localhost:$PORT"
echo ""
echo "✓ Dashboard is live at http://localhost:$PORT"
echo "  Run this file again any time to pull the newest data."
