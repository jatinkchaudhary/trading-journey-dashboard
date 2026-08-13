TRADING JOURNEY DASHBOARD — VIEWING INSTRUCTIONS (macOS)

One-time setup:
1. Save advisor-dashboard.command anywhere (e.g. your Desktop).
2. Open Terminal once and run:
     chmod +x ~/Desktop/advisor-dashboard.command
   (adjust the path if you saved it elsewhere)
3. If macOS asks to install "command line developer tools" the first
   time, click Install — it provides python3, needed for the local server.

Daily use:
- Double-click advisor-dashboard.command.
- It deletes the previous copy, downloads the latest dashboard
  (updated every weekday at ~1 PM Pacific), and opens it at
  http://localhost:4173 in your browser.

Nothing is installed or sent anywhere — the dashboard runs entirely
on your own machine and only you can see it.

If double-clicking is blocked by Gatekeeper the first time:
right-click the file → Open → Open.
