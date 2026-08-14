#!/bin/bash
# ────────────────────────────────────────────────────────────────
#  Trading Journey Dashboard — one-click refresh & view (macOS)
#  Double-click to fetch the latest dashboard and open it.
#  No server, no installs — downloads one HTML file and opens it.
# ────────────────────────────────────────────────────────────────
DIR="$HOME/TradingJourney"
URL="https://raw.githubusercontent.com/jatinkchaudhary/trading-journey-dashboard/main/advisor.html"

mkdir -p "$DIR"
echo "Fetching the latest Trading Journey dashboard..."
if curl -fsSL "$URL" -o "$DIR/dashboard.html"; then
  open "$DIR/dashboard.html"
  echo "✓ Opened the latest dashboard. Run this again any time for fresh data."
else
  if [ -f "$DIR/dashboard.html" ]; then
    open "$DIR/dashboard.html"
    echo "! Couldn't reach GitHub — opened the last downloaded copy instead."
  else
    echo "✗ Could not reach GitHub. Check your internet connection and try again."
  fi
fi
