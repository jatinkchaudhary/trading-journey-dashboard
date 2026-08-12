# Trading Journey Dashboard

A privacy-conscious, visual-first dashboard of my Robinhood trading journey — hosted locally.

## View the dashboard

Double-click **start-dashboard.bat**, or open <http://localhost:4173> if the server is already running.

Optional: run **install-autostart.bat** once to have the server start automatically at login.

## How it stays up to date

A scheduled Claude task ("trading-dashboard-daily-update") runs weekdays at 1 PM:

1. Pulls filled orders, realized P&L, positions, and portfolio value from the Robinhood connector (read-only) for all three accounts.
2. Writes the day's raw fetch to `Data/rh_fetch.json` (git-ignored, never published).
3. Runs `update_from_robinhood.py` to merge it into `dashboard-data.json`.
4. Commits locally for history. Nothing is pushed anywhere — the data never leaves this machine.

Just refresh the browser tab after 1 PM to see the day's trades.

Note: the task runs while the Claude desktop app is open; if the app is closed at 1 PM it catches up on next launch. Deposits/withdrawals aren't visible to the connector — if funding changes, ask Claude to adjust the `funding` figure.

## Methodology limitation

Open positions are valued at the latest available quote at update time. For exact account returns and drawdown, use official daily closing equity data from the broker.
