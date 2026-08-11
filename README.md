# Trading Journey Dashboard

A privacy-conscious, visual-first dashboard generated from a brokerage activity export.

## Refresh the dashboard

1. Replace the local CSV with the latest export and update its filename in `trading_analysis.ps1` if needed.
2. Run `powershell -ExecutionPolicy Bypass -File .\build_dashboard_data.ps1`.
3. Review the generated `dashboard-data.json` and open the site through a local web server.

The raw brokerage CSV is deliberately excluded from Git. The public dashboard contains sanitized, derived figures only.

## Methodology limitation

Open positions are valued at the latest transaction price in the export. For exact account returns and drawdown, use official daily closing equity data from the broker.
