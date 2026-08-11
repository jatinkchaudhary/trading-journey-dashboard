$ErrorActionPreference = 'Stop'

function Convert-Money([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return [decimal]0 }
    $negative = $value.Trim().StartsWith('(')
    $number = [decimal](($value -replace '[$,()]', ''))
    if ($negative) { return -$number }
    return $number
}

$source = Join-Path $PSScriptRoot 'Till August 10th, 2026.csv'
$raw = @(Import-Csv -LiteralPath $source | Where-Object { -not [string]::IsNullOrWhiteSpace($_.'Activity Date') })
$records = for ($i = 0; $i -lt $raw.Count; $i++) {
    $r = $raw[$i]
    [pscustomobject]@{
        Index      = $i
        Date       = [datetime]$r.'Activity Date'
        Instrument = $r.Instrument
        Code       = $r.'Trans Code'
        Quantity   = Convert-Money $r.Quantity
        Price      = Convert-Money $r.Price
        Amount     = Convert-Money $r.Amount
    }
}

# The export is reverse chronological, including execution order within each day.
$chronological = @($records | Sort-Object Date, @{ Expression = 'Index'; Descending = $true })
$positions = @{}
$realizedByTrade = [System.Collections.Generic.List[object]]::new()
$cash = [decimal]0
$lastPrice = @{}
$daily = [System.Collections.Generic.List[object]]::new()

foreach ($dayGroup in ($chronological | Group-Object { $_.Date.ToString('yyyy-MM-dd') })) {
    foreach ($r in $dayGroup.Group) {
        $cash += $r.Amount
        if ($r.Code -notin @('Buy', 'Sell')) { continue }
        $symbol = $r.Instrument
        $q = [decimal]$r.Quantity
        $p = [decimal]$r.Price
        $lastPrice[$symbol] = $p
        if (-not $positions.ContainsKey($symbol)) {
            $positions[$symbol] = [pscustomobject]@{ Qty = [decimal]0; Avg = [decimal]0 }
        }
        $s = $positions[$symbol]
        $signed = if ($r.Code -eq 'Buy') { $q } else { -$q }
        $realized = [decimal]0
        if ($s.Qty -eq 0 -or [math]::Sign([double]$s.Qty) -eq [math]::Sign([double]$signed)) {
            $newQty = $s.Qty + $signed
            $s.Avg = (($s.Avg * [math]::Abs($s.Qty)) + ($p * [math]::Abs($signed))) / [math]::Abs($newQty)
            $s.Qty = $newQty
        } else {
            $closing = [math]::Min([math]::Abs($s.Qty), [math]::Abs($signed))
            if ($s.Qty -gt 0) { $realized = ($p - $s.Avg) * $closing }
            else { $realized = ($s.Avg - $p) * $closing }
            $newQty = $s.Qty + $signed
            if ($newQty -eq 0) { $s.Qty = 0; $s.Avg = 0 }
            elseif ([math]::Sign([double]$newQty) -ne [math]::Sign([double]$s.Qty)) { $s.Qty = $newQty; $s.Avg = $p }
            else { $s.Qty = $newQty }
        }
        if ($realized -ne 0) {
            $realizedByTrade.Add([pscustomobject]@{ Date=$r.Date; Symbol=$symbol; PnL=$realized })
        }
    }
    $marketValue = [decimal]0
    foreach ($symbol in $positions.Keys) {
        if ($lastPrice.ContainsKey($symbol)) { $marketValue += $positions[$symbol].Qty * $lastPrice[$symbol] }
    }
    $daily.Add([pscustomobject]@{Date=[datetime]$dayGroup.Name; Cash=$cash; MarketValue=$marketValue; Equity=$cash+$marketValue})
}

$open = foreach ($symbol in $positions.Keys) {
    $s = $positions[$symbol]
    if ([math]::Abs($s.Qty) -gt 0.000001) {
        $mark = if ($lastPrice.ContainsKey($symbol)) { [decimal]$lastPrice[$symbol] } else { [decimal]0 }
        [pscustomobject]@{ Symbol=$symbol; Qty=$s.Qty; AvgCost=$s.Avg; LastTradePrice=$mark; MarketValue=$s.Qty*$mark; Unrealized=($mark-$s.Avg)*$s.Qty }
    }
}

$externalCodes = @('DCF','ACH','RTP')
$external = ($records | Where-Object Code -in $externalCodes | Measure-Object Amount -Sum).Sum
$end = $daily[-1]
$realizedTotal = ($realizedByTrade | Measure-Object PnL -Sum).Sum
$fees = ($records | Where-Object Code -in @('SS','BFEE','GOLD','MINT') | Measure-Object Amount -Sum).Sum
$income = ($records | Where-Object Code -in @('CDIV','INT','MISC','SLIP') | Measure-Object Amount -Sum).Sum
$monthly = $realizedByTrade | Group-Object { $_.Date.ToString('yyyy-MM') } | ForEach-Object { [pscustomobject]@{Month=$_.Name; Realized=($_.Group.PnL|Measure-Object -Sum).Sum} }
$symbolPnL = $realizedByTrade | Group-Object Symbol | ForEach-Object { [pscustomobject]@{Symbol=$_.Name; Realized=($_.Group.PnL|Measure-Object -Sum).Sum; Closings=$_.Count} }
$dayPnL = $realizedByTrade | Group-Object { $_.Date.ToString('yyyy-MM-dd') } | ForEach-Object { [pscustomobject]@{Date=$_.Name; PnL=($_.Group.PnL|Measure-Object -Sum).Sum} }
$positiveDays = @($dayPnL | Where-Object PnL -gt 0)
$negativeDays = @($dayPnL | Where-Object PnL -lt 0)
$grossWins = ($positiveDays.PnL | Measure-Object -Sum).Sum
$grossLosses = -($negativeDays.PnL | Measure-Object -Sum).Sum
$grossPurchases = -($records | Where-Object Code -eq 'Buy' | Measure-Object Amount -Sum).Sum
$top5Exposure = ($open | Sort-Object { [math]::Abs([double]$_.MarketValue) } -Descending | Select-Object -First 5 | ForEach-Object { [math]::Abs([decimal]$_.MarketValue) } | Measure-Object -Sum).Sum
$top10Exposure = ($open | Sort-Object { [math]::Abs([double]$_.MarketValue) } -Descending | Select-Object -First 10 | ForEach-Object { [math]::Abs([decimal]$_.MarketValue) } | Measure-Object -Sum).Sum

[pscustomobject]@{
    Rows=$records.Count; Start=($records.Date|Measure-Object -Minimum).Minimum.ToString('yyyy-MM-dd'); End=($records.Date|Measure-Object -Maximum).Maximum.ToString('yyyy-MM-dd')
    ExternalFunding=$external; EndingCash=$end.Cash; MarkedHoldings=$end.MarketValue; EstimatedEquity=$end.Equity
    EstimatedGainVsFunding=$end.Equity-$external; ReturnPct=if($external){100*($end.Equity-$external)/$external}else{0}
    RealizedTradingPnL=$realizedTotal; OpenUnrealized=($open.Unrealized|Measure-Object -Sum).Sum
    Fees=$fees; Income=$income; EventTransfers=($records|Where-Object Code -eq 'FUTSWP'|Measure-Object Amount -Sum).Sum; EventMTM=($records|Where-Object Code -eq 'MTM'|Measure-Object Amount -Sum).Sum
    TradeRows=($records|Where-Object Code -in @('Buy','Sell')).Count; Symbols=($records|Where-Object Code -in @('Buy','Sell')|Select-Object -ExpandProperty Instrument -Unique).Count; OpenPositions=$open.Count
    GreenDays=($dayPnL|Where-Object PnL -gt 0).Count; RedDays=($dayPnL|Where-Object PnL -lt 0).Count; FlatDays=($dayPnL|Where-Object PnL -eq 0).Count
    AvgGreenDay=if($positiveDays.Count){$grossWins/$positiveDays.Count}else{0}; AvgRedDay=if($negativeDays.Count){-$grossLosses/$negativeDays.Count}else{0}; ProfitFactor=if($grossLosses){$grossWins/$grossLosses}else{0}
    GrossPurchases=$grossPurchases; PurchaseTurnoverVsFunding=$grossPurchases/$external
    GrossExposureToEquity=if($end.Equity){$end.MarketValue/$end.Equity}else{0}; Top5ExposurePct=if($end.MarketValue){100*$top5Exposure/$end.MarketValue}else{0}; Top10ExposurePct=if($end.MarketValue){100*$top10Exposure/$end.MarketValue}else{0}
} | Format-List

'MONTHLY_REALIZED'; $monthly | Format-Table -AutoSize
'TOP_WINNERS'; $symbolPnL | Sort-Object Realized -Descending | Select-Object -First 10 | Format-Table -AutoSize
'TOP_LOSERS'; $symbolPnL | Sort-Object Realized | Select-Object -First 10 | Format-Table -AutoSize
'BEST_DAYS'; $dayPnL | Sort-Object PnL -Descending | Select-Object -First 10 | Format-Table -AutoSize
'WORST_DAYS'; $dayPnL | Sort-Object PnL | Select-Object -First 10 | Format-Table -AutoSize
'OPEN_POSITIONS'; $open | Sort-Object MarketValue -Descending | Format-Table -AutoSize
