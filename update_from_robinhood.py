#!/usr/bin/env python3
"""Merge a daily Robinhood fetch (Data/rh_fetch.json) into dashboard-data.json.

Input file schema (written by the scheduled Claude task from Robinhood MCP data):
{
  "fetchedAt": "2026-08-12T13:00:00-07:00",
  "asOfDate": "2026-08-12",              # trading date, America/Los_Angeles
  "totalEquity": 34000.12,               # market value across all accounts, incl. cash
  "fills": [                              # filled equity orders since sourceThrough
    {"date": "2026-08-12", "symbol": "MRVL", "code": "Buy"|"Sell",
     "quantity": 6, "price": 217.41, "amount": -1304.46}
  ],                                      # amount: negative for buys, positive for sells
  "realized": [                           # realized P&L trades since sourceThrough
    {"date": "2026-08-12", "symbol": "MRVL", "gain": -37.95}
  ],
  "positions": [                          # full snapshot of open positions
    {"symbol": "MRVL", "quantity": 10, "avgCost": 211.78, "mark": 215.0}
  ]
}

Only fills/realized rows dated AFTER dashboard-data.json's sourceThrough are merged,
so overlapping fetches are safe. Positions and summary are rebuilt from the snapshot.
"""
import json, sys, os
from datetime import datetime, timezone, timedelta
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, 'dashboard-data.json')
FETCH = os.path.join(HERE, 'Data', 'rh_fetch.json')

def r2(x): return round(x + 1e-9, 2)

FUND = os.path.join(HERE, 'Data', 'fundamentals_fetch.json')
MKTQ = os.path.join(HERE, 'Data', 'market_quotes_fetch.json')
EARN = os.path.join(HERE, 'Data', 'earnings_fetch.json')

def load(path):
    try:
        return json.load(open(path, encoding='utf-8-sig'))
    except (OSError, ValueError):
        return None

def build_market(d):
    """Build d['market'] and d['calendar'] from the optional fetch files.
    Safe no-op when the fetch files are absent."""
    fund, mktq = load(FUND), load(MKTQ)
    earn = load(EARN) or []
    if not fund or not mktq:
        return False
    today = d['sourceThrough']
    prev_idx = {i['symbol']: i.get('value') for i in d.get('market', {}).get('indexes', [])}
    idx_names = {'SPX': 'S&P 500', 'NDX': 'Nasdaq 100'}
    indexes = []
    for i in mktq.get('indexes', []):
        prev = prev_idx.get(i['symbol'])
        indexes.append({'symbol': i['symbol'], 'name': idx_names.get(i['symbol'], i['symbol']),
                        'value': r2(float(i['value'])), 'prevValue': prev,
                        'changePct': r2((float(i['value']) - prev) / prev * 100) if prev else None})
    earn_by_sym = {}
    for e in sorted(earn, key=lambda e: e['date']):
        if e['date'] >= today and e['symbol'] not in earn_by_sym:
            earn_by_sym[e['symbol']] = e
    pos_by_sym = {p['symbol']: p for p in d['positions']}
    quotes = mktq.get('quotes', {})
    stocks = []
    for sym, p in pos_by_sym.items():
        fu, q = fund.get(sym, {}), quotes.get(sym, {})
        last = q.get('last') or p.get('mark')
        prev_close = q.get('prevClose')
        hi, lo = fu.get('high52'), fu.get('low52')
        rng = r2((last - lo) / (hi - lo) * 100) if hi and lo and hi != lo else None
        av, tv = fu.get('avgVolume30d'), fu.get('todayVolume')
        e = earn_by_sym.get(sym)
        stocks.append({
            'symbol': sym, 'name': fu.get('name'), 'sector': fu.get('sector'),
            'industry': fu.get('industry'), 'last': r2(last) if last else None,
            'prevClose': r2(prev_close) if prev_close else None,
            'changePct': r2((last - prev_close) / prev_close * 100) if last and prev_close else None,
            'dayPnl': r2((last - prev_close) * p['quantity']) if last and prev_close else None,
            'marketValue': p['marketValue'],
            'marketCap': fu.get('marketCap'), 'peRatio': fu.get('peRatio'),
            'dividendYield': fu.get('dividendYield'),
            'high52': hi, 'low52': lo, 'rangePct': rng,
            'volumeRatio': r2(tv / av) if av and tv else None,
            'earningsDate': e['date'] if e else None,
            'earningsTiming': e.get('timing') if e else None,
            'epsEstimate': e.get('epsEstimate') if e else None,
        })
    stocks.sort(key=lambda s: -(s['marketValue'] or 0))
    cal = []
    for sym, e in earn_by_sym.items():
        cal.append({'date': e['date'], 'symbol': sym, 'type': 'earnings',
                    'detail': (f"Q report {'before open' if e.get('timing')=='am' else 'after close' if e.get('timing')=='pm' else ''}"
                               + (f" · est EPS {e['epsEstimate']:+.2f}" if e.get('epsEstimate') is not None else '')).strip()})
    for sym, fu in fund.items():
        if sym not in pos_by_sym:
            continue
        for key, typ, label in (('exDividendDate', 'ex-dividend', 'Ex-dividend'), ('payableDate', 'dividend-pay', 'Dividend paid')):
            dt = fu.get(key)
            if dt and dt >= today:
                dps = fu.get('dividendPerShare')
                cal.append({'date': dt, 'symbol': sym, 'type': typ,
                            'detail': label + (f" · ${dps:.2f}/share" if dps else '')})
    gold = load(os.path.join(HERE, 'Data', 'gold_events.json')) or {}
    for g in gold.get('events', []):
        if g['date'] >= today:
            cal.append({'date': g['date'], 'symbol': g['kind'], 'type': 'gold',
                        'detail': g['detail']})
    cal.sort(key=lambda e: (e['date'], e['symbol']))
    d['market'] = {'asOf': today, 'indexes': indexes, 'stocks': stocks}
    d['calendar'] = cal
    build_macro(d)
    build_rrg(d)
    build_options(d)
    build_caution(d)
    return True

MACRO_META = {
    'VIX':  ('Volatility (VIX)', 'Fear gauge — cost of hedging the S&P 500. Below 15 calm, above 20 nervous'),
    'SPX':  ('S&P 500', 'Broad US market index'),
    'NDX':  ('Nasdaq 100', 'Big-tech index'),
    'DJX':  ('Dow (1/100 scale)', 'Blue-chip industrials index, shown at 1/100 of the Dow'),
    'BRTI': ('Bitcoin', 'Live BTC price — speculative risk appetite'),
    'XAU':  ('Gold — XAU/USD spot', 'Spot gold, $ per troy ounce. Rising = safe-haven demand / inflation hedge'),
    'XAG':  ('Silver — XAG/USD spot', 'Spot silver, $ per troy ounce — part precious metal, part industrial'),
    'USO':  ('Oil — USO ETF', 'ETF tracking crude oil — energy costs & growth expectations'),
    'UUP':  ('US Dollar — UUP ETF', 'ETF that rises when the dollar strengthens vs other currencies. A stronger dollar is a headwind for gold & exporters'),
    'TLT':  ('Long-term rates — TLT ETF', '20yr+ Treasury bond ETF. Price UP = yields DOWN (easier conditions); price down = rates rising'),
    'HYG':  ('Credit health — HYG ETF', 'Junk-bond ETF. Falling = lenders getting scared = risk-off warning'),
    'IWM':  ('Small caps — IWM ETF', 'Russell 2000 ETF — appetite for riskier domestic stocks'),
}

def build_macro(d):
    """Build d['macroBoard'] from Data/macro_fetch.json. Keeps a rolling daily
    history inside dashboard-data.json so trends accumulate run over run."""
    mf = load(os.path.join(HERE, 'Data', 'macro_fetch.json'))
    if not mf:
        return False
    today = d['sourceThrough']
    prior = d.get('macroBoard', {})
    hist = [h for h in prior.get('history', []) if h['date'] != today]
    prev_idx = hist[-1]['values'] if hist else {}
    items, changes = [], {}
    for sym, val in mf.get('indexes', {}).items():
        label, desc = MACRO_META.get(sym, (sym, ''))
        prev = prev_idx.get(sym)
        chg = r2((val - prev) / prev * 100) if prev else None
        changes[sym] = chg
        items.append({'symbol': sym, 'kind': 'index', 'label': label, 'desc': desc,
                      'value': r2(val), 'changePct': chg})
    # Spot metals: primary = gold-api spot; fallback = apply the ETF's daily %
    # move (GLD→XAU, SLV→XAG) to the last stored spot value, so a spot-API
    # outage degrades gracefully instead of breaking the run.
    spot = {s: (v['last'] if isinstance(v, dict) else v)
            for s, v in (mf.get('spot') or {}).items()}
    for sym, etf in (('XAU', 'GLD'), ('XAG', 'SLV')):
        if sym not in spot or not spot[sym]:
            q = (mf.get('proxies') or {}).get(etf)
            prev = prev_idx.get(sym)
            if q and q.get('prevClose') and prev:
                spot[sym] = prev * (q['last'] / q['prevClose'])
    for sym, val in spot.items():
        label, desc = MACRO_META.get(sym, (sym, ''))
        prev = prev_idx.get(sym)
        chg = r2((val - prev) / prev * 100) if prev else None
        changes[sym] = chg
        items.append({'symbol': sym, 'kind': 'spot', 'label': label, 'desc': desc,
                      'value': r2(val), 'changePct': chg})
    for sym, q in mf.get('proxies', {}).items():
        if sym in ('GLD', 'SLV'):
            continue  # replaced by XAU/XAG spot cards
        label, desc = MACRO_META.get(sym, (sym, ''))
        chg = r2((q['last'] - q['prevClose']) / q['prevClose'] * 100) if q.get('prevClose') else None
        changes[sym] = chg
        items.append({'symbol': sym, 'kind': 'proxy', 'label': label, 'desc': desc,
                      'value': r2(q['last']), 'changePct': chg})
    # Risk regime: risk-on assets vs safe havens, tempered by VIX level.
    risk_on = [changes.get(s) for s in ('IWM', 'HYG', 'BRTI', 'NDX') if changes.get(s) is not None]
    havens = [changes.get(s) for s in ('XAU', 'UUP', 'TLT') if changes.get(s) is not None]
    vix = mf.get('indexes', {}).get('VIX')
    score = (sum(risk_on) / len(risk_on) if risk_on else 0) - (sum(havens) / len(havens) if havens else 0)
    if vix is not None:
        score -= max(0, (vix - 20) / 10)
    label = 'RISK-ON' if score > 0.35 else 'RISK-OFF' if score < -0.35 else 'MIXED'
    vix_band = (None if vix is None else
                'calm' if vix < 15 else 'normal' if vix < 20 else 'nervous' if vix < 30 else 'panic')
    detail = (f"Risk assets vs. safe havens score {score:+.2f}. "
              f"VIX at {vix} ({vix_band})." if vix is not None else f"Score {score:+.2f}.")
    values = {**{s: v for s, v in mf.get('indexes', {}).items()},
              **{s: v for s, v in spot.items() if v},
              **{s: q['last'] for s, q in mf.get('proxies', {}).items()}}
    hist.append({'date': today, 'values': {k: r2(v) for k, v in values.items()}})
    d['macroBoard'] = {'asOf': today, 'items': items,
                       'regime': {'score': r2(score), 'label': label, 'vix': vix,
                                  'vixBand': vix_band, 'detail': detail},
                       'history': hist[-90:]}
    # Benchmark: keep a daily SPX series alongside the equity series.
    spx = mf.get('indexes', {}).get('SPX')
    if spx:
        bench = [b for b in d.get('benchmark', []) if b['date'] != today]
        bench.append({'date': today, 'spx': r2(spx)})
        d['benchmark'] = sorted(bench, key=lambda b: b['date'])
    return True

def build_rrg(d):
    """Relative Rotation Graph vs QQQ. Reads Data/rrg_history.json; if
    Data/rrg_quotes_fetch.json exists ({"asOfDate","quotes":{sym:last}}),
    appends that day's closes to the history file first (self-maintaining).
    RS-Ratio = 100 * (price/bench) / SMA50(price/bench)
    RS-Momentum = 100 * RS-Ratio / RS-Ratio 10 sessions ago
    Quadrants split at (100,100). Trail = 4 weekly steps."""
    path = os.path.join(HERE, 'Data', 'rrg_history.json')
    hist = load(path)
    if not hist:
        return False
    closes = hist['closes']
    rq = load(os.path.join(HERE, 'Data', 'rrg_quotes_fetch.json'))
    if rq and rq.get('asOfDate') and rq.get('quotes'):
        day = rq['asOfDate']
        for sym, px in rq['quotes'].items():
            if sym in closes and px:
                closes[sym][day] = round(float(px), 4)
        # trim to the most recent 130 dates per symbol
        for sym in closes:
            keep = sorted(closes[sym])[-130:]
            closes[sym] = {k: closes[sym][k] for k in keep}
        hist['updated'] = day
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(hist, fh)
    bench = closes.get(hist.get('benchmark', 'QQQ'), {})
    if len(bench) < 61:
        return False
    held = {p['symbol'] for p in d['positions']}
    W, M, TRAIL_STEP, TRAIL_N = 50, 10, 5, 4
    points = []
    for sym, px in closes.items():
        if sym == hist.get('benchmark', 'QQQ'):
            continue
        dates = sorted(set(px) & set(bench))
        if len(dates) < W + M + 1:
            continue
        rs = [px[t] / bench[t] for t in dates]
        def rsr(i):
            window = rs[i - W + 1:i + 1]
            return 100 * rs[i] / (sum(window) / W)
        def point(i):
            return [r2(rsr(i)), r2(100 * rsr(i) / rsr(i - M))]
        last = len(dates) - 1
        min_i = W + M - 1
        steps = min(TRAIL_N, (last - min_i) // TRAIL_STEP)
        trail = [point(last - TRAIL_STEP * k) for k in range(steps, 0, -1)]
        x, y = point(last)
        points.append({'symbol': sym, 'x': x, 'y': y,
                       'held': sym in held, 'trail': trail})
    if not points:
        return False
    d['rrg'] = {'asOf': d['sourceThrough'], 'benchmark': hist.get('benchmark', 'QQQ'),
                'window': W, 'points': points}
    return True

def build_options(d):
    """Options trade log. Data/options_fetch.json (daily new filled orders:
    [{id,date,symbol,direction,premium,strategy,effect,qty,strike,otype,exp}])
    is appended to Data/options_ledger.json (dedup by id). A contract
    (symbol,strike,otype,exp) resolves when closed or expired:
    realized = credits - debits."""
    lpath = os.path.join(HERE, 'Data', 'options_ledger.json')
    ledger = load(lpath) or {'orders': []}
    fetched = load(os.path.join(HERE, 'Data', 'options_fetch.json'))
    if fetched:
        seen = {o['id'] for o in ledger['orders']}
        ledger['orders'] += [o for o in fetched if o['id'] not in seen]
        with open(lpath, 'w', encoding='utf-8') as fh:
            json.dump(ledger, fh, indent=1)
    if not ledger['orders']:
        return False
    today = d['sourceThrough']
    groups = {}
    for o in ledger['orders']:
        groups.setdefault((o['symbol'], o['strike'], o['otype'], o['exp']), []).append(o)
    trades = []
    for (sym, strike, otype, exp), orders in groups.items():
        debit = sum(o['premium'] for o in orders if o['direction'] == 'debit')
        credit = sum(o['premium'] for o in orders if o['direction'] == 'credit')
        opened = sum(o['qty'] for o in orders if o['effect'] == 'open')
        closed = sum(o['qty'] for o in orders if o['effect'] == 'close')
        desc = f"${strike:g}{otype[0].upper()} exp {exp[5:]}"
        strat = orders[0].get('strategy') or ''
        if closed >= opened or exp < today:
            done = max(min(exp, today), max(o['date'] for o in orders))
            trades.append({'date': done, 'symbol': sym, 'desc': desc, 'strategy': strat,
                           'pnl': r2(credit - debit), 'status': 'expired' if closed < opened else 'closed'})
        else:
            trades.append({'date': orders[-1]['date'], 'symbol': sym, 'desc': desc, 'strategy': strat,
                           'pnl': None, 'status': 'open', 'cost': r2(debit - credit)})
    trades.sort(key=lambda t: t['date'], reverse=True)
    d['options'] = {'asOf': today, 'trades': trades}
    return True

def build_caution(d):
    """Technical-caution notes for held symbols, computed locally from
    Data/rrg_history.json closes (RSI14, 50d trend, 20d drawdown) plus
    existing market/RRG signals. Zero external calls."""
    hist = load(os.path.join(HERE, 'Data', 'rrg_history.json'))
    if not hist:
        return False
    closes = hist['closes']
    stocks = {s['symbol']: s for s in d.get('market', {}).get('stocks', [])}
    rrg = {p['symbol']: p for p in d.get('rrg', {}).get('points', [])}
    out = []
    for p in d['positions']:
        sym = p['symbol']
        px = closes.get(sym)
        notes, score = [], 0
        if px and len(px) >= 30:
            series = [px[k] for k in sorted(px)]
            deltas = [series[i] - series[i - 1] for i in range(len(series) - 14, len(series))]
            gains = sum(x for x in deltas if x > 0) / 14
            losses = -sum(x for x in deltas if x < 0) / 14
            rsi = 100 - 100 / (1 + gains / losses) if losses else 100.0
            sma50 = sum(series[-50:]) / min(50, len(series))
            vs50 = (series[-1] / sma50 - 1) * 100
            dd20 = (series[-1] / max(series[-20:]) - 1) * 100
            if rsi <= 30: notes.append(f'RSI {rsi:.0f} — oversold, knife still falling'); score += 3
            elif rsi >= 78: notes.append(f'RSI {rsi:.0f} — very extended'); score += 2
            if vs50 <= -4: notes.append(f'{vs50:.0f}% below 50-day trend'); score += 2
            if dd20 <= -12: notes.append(f'{dd20:.0f}% off its 20-day high'); score += 2
        s = stocks.get(sym)
        if s and s.get('volumeRatio') and s['volumeRatio'] >= 1.5 and (s.get('changePct') or 0) < 0:
            notes.append(f"{s['volumeRatio']}× volume on a down day — distribution"); score += 2
        r = rrg.get(sym)
        if r and r['x'] < 100 and r['y'] < 100:
            notes.append('RRG lagging — losing to QQQ and decelerating'); score += 1
        if len(notes) >= 2:
            out.append({'symbol': sym, 'score': score, 'notes': notes})
    out.sort(key=lambda c: -c['score'])
    d['caution'] = {'asOf': d['sourceThrough'], 'items': out[:6]}
    return True

def main():
    d = json.load(open(DASH, encoding='utf-8-sig'))
    f = json.load(open(FETCH, encoding='utf-8-sig'))

    cutoff = d['sourceThrough']
    as_of = f['asOfDate']
    if as_of <= cutoff:
        did_market = build_market(d)
        if did_market:
            with open(DASH, 'w', encoding='utf-8') as fh:
                json.dump(d, fh, indent=2)
        print(f'Core merge skipped (asOfDate {as_of} <= sourceThrough {cutoff}); '
              f'market/calendar {"refreshed" if did_market else "unchanged"}')
        return 0

    fills = sorted((t for t in f['fills'] if t['date'] > cutoff), key=lambda t: t['date'])
    realized = [t for t in f['realized'] if t['date'] > cutoff]

    # --- transactions (stored newest-first) ---
    new_tx = [{'date': t['date'], 'symbol': t['symbol'], 'code': t['code'],
               'quantity': t['quantity'], 'price': t['price'], 'amount': t['amount']}
              for t in fills]
    d['transactions'] = sorted(new_tx, key=lambda t: t['date'], reverse=True) + d['transactions']

    # --- series ---
    daily_gain = defaultdict(float)
    for t in realized:
        daily_gain[t['date']] += float(t['gain'])
    new_dates = sorted(set(list(daily_gain) + [t['date'] for t in fills] + [as_of]))
    new_dates = [x for x in new_dates if x > cutoff]
    last = d['series'][-1]
    funding = last['funding']
    cum = last['cumulativeRealized']
    equity_prev = last['equity']
    for date in new_dates:
        dg = daily_gain.get(date, 0.0)
        cum += dg
        equity = f['totalEquity'] if date == as_of else equity_prev + dg
        d['series'].append({'date': date, 'equity': r2(equity), 'funding': funding,
                            'netPnl': r2(equity - funding), 'dailyRealized': r2(dg),
                            'cumulativeRealized': r2(cum)})
        equity_prev = equity

    # --- monthly (recomputed from series) ---
    monthly = defaultdict(float)
    for x in d['series']:
        monthly[x['date'][:7]] += x['dailyRealized']
    d['monthly'] = [{'month': m, 'realized': r2(v)} for m, v in sorted(monthly.items())]

    # --- symbols ---
    sym = {s['symbol']: s for s in d['symbols']}
    for t in realized:
        s = sym.setdefault(t['symbol'], {'symbol': t['symbol'], 'realized': 0, 'closingEvents': 0})
        s['realized'] = r2(s['realized'] + float(t['gain']))
        s['closingEvents'] += 1
    d['symbols'] = sorted(sym.values(), key=lambda s: s['realized'], reverse=True)

    # --- activity (trades per day) ---
    act = {a['date']: a for a in d['activity']}
    per_day = defaultdict(int)
    for t in fills:
        per_day[t['date']] += 1
    for date, n in per_day.items():
        act[date] = {'date': date, 'trades': act.get(date, {}).get('trades', 0) + n}
    d['activity'] = sorted(act.values(), key=lambda a: a['date'])

    # --- positions snapshot ---
    pos = []
    for p in sorted(f['positions'], key=lambda p: -p['quantity'] * p['mark']):
        q, ac, mk = float(p['quantity']), float(p['avgCost']), float(p['mark'])
        mv = q * mk
        pos.append({'symbol': p['symbol'], 'quantity': q, 'avgCost': r2(ac), 'mark': r2(mk),
                    'marketValue': r2(mv), 'unrealized': r2((mk - ac) * q),
                    'returnPct': r2((mk - ac) / ac * 100) if ac else 0})
    d['positions'] = pos

    # --- summary ---
    su = d['summary']
    series = d['series']
    dr = [x['dailyRealized'] for x in series]
    wins = [x for x in dr if x > 0]; losses = [x for x in dr if x < 0]
    mv_sorted = sorted((p['marketValue'] for p in pos), reverse=True)
    exposure = sum(mv_sorted)
    equity = series[-1]['equity']
    peak, mdd = -1e18, 0.0
    for x in series:
        peak = max(peak, x['netPnl']); mdd = min(mdd, x['netPnl'] - peak)
    su.update({
        'equity': r2(equity),
        'funding': funding,
        'netGain': r2(equity - funding),
        'returnPct': r2((equity - funding) / funding * 100) if funding else 0,
        'realized': r2(series[-1]['cumulativeRealized']),
        'unrealized': r2(sum(p['unrealized'] for p in pos)),
        'cash': r2(equity - exposure),
        'exposure': r2(exposure),
        'leverage': r2(exposure / equity) if equity else 0,
        'winDays': len(wins), 'lossDays': len(losses),
        'winRate': r2(len(wins) / (len(wins) + len(losses)) * 100) if wins or losses else 0,
        'avgWinDay': r2(sum(wins) / len(wins)) if wins else 0,
        'avgLossDay': r2(sum(losses) / len(losses)) if losses else 0,
        'maxEstimatedDrawdown': r2(mdd),
        'openPositions': len(pos),
        'symbolsTraded': len({t['symbol'] for t in d['transactions']
                              if t['symbol'] and t['code'] in ('Buy', 'Sell')}),
        'tradeRows': su['tradeRows'] + len(fills),
        'turnover': r2(su['turnover'] + sum(abs(t['amount']) for t in fills if t['code'] == 'Buy')),
        'top5Pct': r2(sum(mv_sorted[:5]) / exposure * 100) if exposure else 0,
        'top10Pct': r2(sum(mv_sorted[:10]) / exposure * 100) if exposure else 0,
    })

    d['sourceThrough'] = as_of
    build_market(d)

    pdt = timezone(timedelta(hours=-7))
    d['generatedAt'] = datetime.now(pdt).strftime('%Y-%m-%dT%H.%M.%S%z')
    d['sourceThrough'] = as_of
    d['methodology'] = ('Average-cost reconstruction; refreshed daily from Robinhood realized-P&L and '
                        'order-fill data. Open positions use latest available quotes.')

    with open(DASH, 'w', encoding='utf-8') as fh:
        json.dump(d, fh, indent=2)
    print(f'Merged {len(fills)} fills / {len(realized)} realized trades; '
          f'sourceThrough {cutoff} -> {as_of}; equity {equity:.2f}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
