#!/bin/bash
# ────────────────────────────────────────────────────────────────
#  Trading Journey Dashboard — one-click refresh & view (macOS)
#  Double-click to fetch the latest dashboard and open it.
# ────────────────────────────────────────────────────────────────
DIR="$HOME/TradingJourney"
ZIP_URL="https://github.com/jatinkchaudhary/trading-journey-dashboard/archive/refs/heads/main.zip"
PORT=4173

echo "Fetching the latest Trading Journey dashboard..."
rm -rf "$DIR"
mkdir -p "$DIR"
if ! curl -fsSL "$ZIP_URL" -o "$DIR/site.zip"; then
  echo "✗ Could not reach GitHub. Check your internet connection and try again."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi
unzip -q "$DIR/site.zip" -d "$DIR"
rm -f "$DIR/site.zip"
SITE=$(find "$DIR" -maxdepth 1 -type d -name "trading-journey-dashboard-*" | head -n 1)
if [ -z "$SITE" ]; then
  echo "✗ Download looked wrong (no site folder found). Try again."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is needed to show the dashboard. macOS will now offer to"
  echo "install its developer tools — click Install, then run this file again."
  xcode-select --install 2>/dev/null
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

# Stop any previous copy of the dashboard server, then start fresh
lsof -ti tcp:$PORT 2>/dev/null | xargs kill 2>/dev/null || true
cd "$SITE"
nohup python3 -m http.server $PORT >/dev/null 2>&1 &
sleep 1
open "http://localhost:$PORT"
echo ""
echo "✓ Dashboard is live at http://localhost:$PORT"
echo "  Run this file again any time to pull the newest data."
echo "  (You can close this window.)"
