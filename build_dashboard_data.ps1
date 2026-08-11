$ErrorActionPreference = 'Stop'

# Reuse the audited ledger reconstruction. Its formatted output is intentionally suppressed.
. (Join-Path $PSScriptRoot 'trading_analysis.ps1') | Out-Null

$cumulativeFunding = [decimal]0
$cumulativeRealized = [decimal]0
$peakAdjusted = [decimal]0
$maxDrawdown = [decimal]0
$series = @()

foreach ($day in $daily) {
    $dateKey = $day.Date.ToString('yyyy-MM-dd')
    $fundingToday = ($records | Where-Object { $_.Date.Date -eq $day.Date.Date -and $_.Code -in @('DCF','ACH','RTP') } | Measure-Object Amount -Sum).Sum
    if ($null -eq $fundingToday) { $fundingToday = 0 }
    $cumulativeFunding += $fundingToday
    $realizedToday = ($realizedByTrade | Where-Object { $_.Date.Date -eq $day.Date.Date } | Measure-Object PnL -Sum).Sum
    if ($null -eq $realizedToday) { $realizedToday = 0 }
    $cumulativeRealized += $realizedToday
    $adjusted = [decimal]$day.Equity - $cumulativeFunding
    if ($adjusted -gt $peakAdjusted) { $peakAdjusted = $adjusted }
    $drawdown = $adjusted - $peakAdjusted
    if ($drawdown -lt $maxDrawdown) { $maxDrawdown = $drawdown }
    $series += [ordered]@{
        date = $dateKey
        equity = [math]::Round([double]$day.Equity, 2)
        funding = [math]::Round([double]$cumulativeFunding, 2)
        netPnl = [math]::Round([double]$adjusted, 2)
        dailyRealized = [math]::Round([double]$realizedToday, 2)
        cumulativeRealized = [math]::Round([double]$cumulativeRealized, 2)
    }
}

$positionData = @($open | ForEach-Object {
    [ordered]@{
        symbol = $_.Symbol
        quantity = [math]::Round([double]$_.Qty, 6)
        avgCost = [math]::Round([double]$_.AvgCost, 2)
        mark = [math]::Round([double]$_.LastTradePrice, 2)
        marketValue = [math]::Round([double]$_.MarketValue, 2)
        unrealized = [math]::Round([double]$_.Unrealized, 2)
        returnPct = if ($_.AvgCost) { [math]::Round(100 * ([double]$_.LastTradePrice - [double]$_.AvgCost) / [double]$_.AvgCost, 2) } else { 0 }
    }
} | Sort-Object marketValue -Descending)

$symbolData = @($symbolPnL | ForEach-Object {
    [ordered]@{ symbol=$_.Symbol; realized=[math]::Round([double]$_.Realized,2); closingEvents=$_.Closings }
} | Sort-Object realized -Descending)

$monthlyData = @($monthly | ForEach-Object { [ordered]@{ month=$_.Month; realized=[math]::Round([double]$_.Realized,2) } })
$tradeCountByDay = $records | Where-Object Code -in @('Buy','Sell') | Group-Object { $_.Date.ToString('yyyy-MM-dd') }
$activity = @($tradeCountByDay | ForEach-Object { [ordered]@{date=$_.Name; trades=$_.Count} } | Sort-Object date)

# Full ledger, newest first, so the dashboard can power 1D / 5D style transaction
# and activity views without needing a second data source.
$transactionLog = @($records | Sort-Object Date, Index -Descending | ForEach-Object {
    [ordered]@{
        date     = $_.Date.ToString('yyyy-MM-dd')
        symbol   = $_.Instrument
        code     = $_.Code
        quantity = [math]::Round([double]$_.Quantity, 4)
        price    = [math]::Round([double]$_.Price, 4)
        amount   = [math]::Round([double]$_.Amount, 2)
    }
})

$dashboard = [ordered]@{
    generatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
    sourceThrough = $end.Date.ToString('yyyy-MM-dd')
    methodology = 'Average-cost reconstruction. Open positions use the latest transaction price available in the source export, not an official closing quote.'
    summary = [ordered]@{
        funding = [math]::Round([double]$external,2)
        equity = [math]::Round([double]$end.Equity,2)
        netGain = [math]::Round([double]($end.Equity-$external),2)
        returnPct = [math]::Round(100*[double]($end.Equity-$external)/[double]$external,2)
        realized = [math]::Round([double]$realizedTotal,2)
        unrealized = [math]::Round([double](($open.Unrealized|Measure-Object -Sum).Sum),2)
        cash = [math]::Round([double]$end.Cash,2)
        exposure = [math]::Round([double]$end.MarketValue,2)
        leverage = [math]::Round([double]$end.MarketValue/[double]$end.Equity,2)
        winDays = $positiveDays.Count
        lossDays = $negativeDays.Count
        winRate = [math]::Round(100*$positiveDays.Count/($positiveDays.Count+$negativeDays.Count),1)
        avgWinDay = [math]::Round([double]($grossWins/$positiveDays.Count),2)
        avgLossDay = [math]::Round([double](-$grossLosses/$negativeDays.Count),2)
        maxEstimatedDrawdown = [math]::Round([double]$maxDrawdown,2)
        openPositions = $open.Count
        symbolsTraded = ($records|Where-Object Code -in @('Buy','Sell')|Select-Object -ExpandProperty Instrument -Unique).Count
        tradeRows = ($records|Where-Object Code -in @('Buy','Sell')).Count
        turnover = [math]::Round([double]$grossPurchases,2)
        costs = [math]::Round([double](-$fees),2)
        top5Pct = [math]::Round(100*[double]$top5Exposure/[double]$end.MarketValue,1)
        top10Pct = [math]::Round(100*[double]$top10Exposure/[double]$end.MarketValue,1)
    }
    series = $series
    monthly = $monthlyData
    symbols = $symbolData
    positions = $positionData
    activity = $activity
    transactions = $transactionLog
}

$json = $dashboard | ConvertTo-Json -Depth 8
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'dashboard-data.json') -Value $json -Encoding utf8
Write-Host 'Created dashboard-data.json with sanitized derived data.'
