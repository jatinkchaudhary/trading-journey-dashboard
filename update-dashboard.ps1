$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "=== Trading Journey: One-Click Dashboard Refresh ===" -ForegroundColor Cyan
Write-Host ""

# 1. Confirm a CSV export is present (root folder or Data subfolder).
$searchFolders = @($PSScriptRoot, (Join-Path $PSScriptRoot 'Data')) | Where-Object { Test-Path -LiteralPath $_ }
$csvFiles = @($searchFolders | ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter '*.csv' -File -ErrorAction SilentlyContinue })
if ($csvFiles.Count -eq 0) {
    Write-Host "No CSV file found in this folder or its Data subfolder." -ForegroundColor Red
    Write-Host "Export today's activity from Robinhood (Account > Statements & History > Export)"
    Write-Host "and drop the .csv file into this folder (or the Data folder), then run this script again."
    Read-Host "Press Enter to close"
    exit 1
}
$latestCsv = $csvFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "Using ledger export: $($latestCsv.FullName)" -ForegroundColor DarkGray

# 2. Rebuild the sanitized dashboard data from the CSV.
Write-Host ""
Write-Host "Rebuilding dashboard-data.json..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build_dashboard_data.ps1')

# 3. Check whether anything actually changed (ignore no-op timestamp-only diffs isn't needed; commit only if content changed materially).
$diff = git status --porcelain -- dashboard-data.json
if (-not $diff) {
    Write-Host ""
    Write-Host "dashboard-data.json is already up to date. Nothing to push." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 0
}

# 4. Commit and push the refreshed data. The raw CSV itself is never staged (see .gitignore).
Write-Host ""
Write-Host "Publishing update to GitHub..." -ForegroundColor Cyan
git add dashboard-data.json
$dateStamp = Get-Date -Format 'yyyy-MM-dd'
git commit -m "Refresh dashboard data through $dateStamp"
git push

Write-Host ""
Write-Host "Done! Your live dashboard will update in a minute or two." -ForegroundColor Green
Write-Host "Note: your raw CSV file was NOT uploaded — only sanitized summary figures were pushed." -ForegroundColor DarkGray
Read-Host "Press Enter to close"
