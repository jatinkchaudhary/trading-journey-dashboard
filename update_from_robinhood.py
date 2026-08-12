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
    cal.sort(key=lambda e: (e['date'], e['symbol']))
    d['market'] = {'asOf': today, 'indexes': indexes, 'stocks': stocks}
    d['calendar'] = cal
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
