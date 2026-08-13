# Trading Journey Dashboard

A privacy-conscious, visual-first dashboard of a personal trading journey.
Auto-updated every weekday at ~1 PM Pacific from read-only brokerage data.

## View it (advisor / any Mac)

1. Get `advisor-dashboard.command` (in this repo) and run once in Terminal:
   `chmod +x advisor-dashboard.command`
2. From then on, just double-click it. It downloads the latest copy of this
   repo and opens the dashboard at http://localhost:4173 — nothing is
   installed, nothing leaves your machine.

## View it (owner, Windows)

Double-click `start-dashboard.bat` — serves this folder at http://localhost:4173.

## How updates work

A scheduled Claude task pulls filled orders, realized P&L, positions, quotes,
fundamentals, the earnings calendar, index levels, and gold/silver spot prices
(read-only), merges them into `dashboard-data.json` via `update_from_robinhood.py`,
commits, and pushes here. Raw brokerage exports and API payloads are git-ignored
and never published — the public JSON contains sanitized, derived figures only.

## Methodology limitation

Open positions are valued at the latest available quote at update time. For
exact account returns and drawdown, use official daily closing equity data
from the broker.
