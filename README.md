# Trading Journey Dashboard

A privacy-conscious, visual-first dashboard generated from a brokerage activity export.

Live dashboard: <https://jatinkchaudhary.github.io/trading-journey-dashboard/>

## Refresh the dashboard (one click)

Robinhood has no official read-only API, so this stays a manual, credential-free export — your login is never touched by anything in this repo.

1. In Robinhood: **Account → Statements & History → Export**, and save the CSV.
2. Drop the CSV into this project folder (or the `Data/` subfolder) — the filename doesn't matter, the newest CSV present is always used.
3. Double-click **update-dashboard.bat**. It will:
   - Rebuild `dashboard-data.json` from the CSV
   - Commit and push just that sanitized JSON file to GitHub
   - Leave your raw CSV untouched on disk and **never upload it** (it's git-ignored)
4. Give the live link a minute or two to redeploy, then refresh the page.

### Manual/advanced refresh

If you'd rather run it yourself: `powershell -ExecutionPolicy Bypass -File .\build_dashboard_data.ps1`, review `dashboard-data.json`, then commit/push it.

The raw brokerage CSV is deliberately excluded from Git. The public dashboard contains sanitized, derived figures only.

## Methodology limitation

Open positions are valued at the latest transaction price in the export. For exact account returns and drawdown, use official daily closing equity data from the broker.

