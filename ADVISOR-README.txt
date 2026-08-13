TRADING JOURNEY DASHBOARD — SETUP FOR YOUR MAC (one time, ~30 seconds)

1. Open Terminal (press Cmd+Space, type "Terminal", press Enter).

2. Paste this single line and press Enter:

curl -fsSL https://raw.githubusercontent.com/jatinkchaudhary/trading-journey-dashboard/main/advisor-dashboard.command -o "$HOME/Desktop/Trading Journey.command" && chmod +x "$HOME/Desktop/Trading Journey.command" && "$HOME/Desktop/Trading Journey.command"

   That downloads a "Trading Journey" icon to your Desktop and opens
   the dashboard right away. If your Mac offers to install
   "command line developer tools", click Install and run the line again.

FROM THEN ON:
Just double-click "Trading Journey.command" on your Desktop whenever
you want to look. It always pulls the newest data (updated every
weekday around 1 PM Pacific) and opens the dashboard in your browser
at http://localhost:4173.

Everything runs on your own machine — nothing is installed permanently
and nothing you view is sent anywhere.
