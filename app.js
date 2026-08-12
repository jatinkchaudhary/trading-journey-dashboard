const money = (n, compact=false) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:compact?'compact':'standard',maximumFractionDigits:compact?1:0}).format(n);
const pct = n => `${n>=0?'+':''}${n.toFixed(1)}%`;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C={cyan:css('--cyan'),green:css('--green'),red:css('--red'),orange:css('--orange'),purple:css('--purple'),muted:css('--muted'),line:css('--line'),text:css('--text')};
let D, charts={}, tableLimit=12, sortState={key:'marketValue',dir:-1};
let activityWindow=1, activityLimit=12, activitySort={key:'date',dir:-1};
const ACTION_CODES={Buy:'buy',Sell:'sell'};

Chart.defaults.color=C.muted; Chart.defaults.borderColor='rgba(28,43,54,.14)'; Chart.defaults.font.family='DM Mono'; Chart.defaults.font.size=9;
const tooltip={backgroundColor:'#ffffff',borderColor:C.line,borderWidth:1,titleColor:C.text,bodyColor:C.muted,padding:12,displayColors:true};
const baseScales={x:{grid:{display:false},ticks:{maxRotation:0}},y:{grid:{color:'rgba(28,43,54,.10)'},border:{display:false}}};

async function init(){
  try{D=await fetch('dashboard-data.json').then(r=>{if(!r.ok)throw Error(r.statusText);return r.json()});hydrate();buildCharts();buildActivityCharts();updateActivity(activityWindow);renderMarket();renderMacro();renderCalendar();renderWatch();bind();reveal();}
  catch(e){document.querySelector('main').innerHTML=`<section class="hero"><div><p class="eyebrow">DATA CONNECTION</p><h1>Dashboard data<br><span>couldn't load.</span></h1><p class="hero-copy">Run this site through a local web server, or regenerate dashboard-data.json. ${e.message}</p></div></section>`}
}
function hydrate(){const s=D.summary;
  document.querySelector('#asOf').textContent=`Data through ${new Date(D.sourceThrough+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
  set('#heroReturn',pct(s.returnPct));set('#heroGain',`${money(s.netGain)} net gain`);set('#equity',money(s.equity));set('#fundingNote',`${money(s.funding)} contributed`);
  set('#realized',money(s.realized));set('#unrealized',money(s.unrealized));document.querySelector('#unrealized').classList.toggle('negative',s.unrealized<0);
  const give=Math.abs(s.unrealized/s.realized*100);set('#giveback',`${give.toFixed(0)}% of realized gains offset`);set('#winRate',`${s.winRate}%`);set('#dayRecord',`${s.winDays} green / ${s.lossDays} red days`);
  document.querySelector('#realizedMeter').style.width='100%';document.querySelector('#openMeter').style.width=`${Math.min(give,100)}%`;
  document.querySelector('#dayDots').innerHTML='<i></i>'.repeat(s.winDays)+'<i class="red"></i>'.repeat(s.lossDays);
  set('#focusHeadline',give>50?'Open losses are masking strong realized execution.':'Exposure is the clearest improvement lever.');
  set('#focusDetail',`${money(Math.abs(s.unrealized))} of open losses currently offsets ${give.toFixed(0)}% of realized profit. Review invalidation points before adding risk.`);
  set('#donutNet',money(s.realized+s.unrealized,true));set('#splitRealized',money(s.realized));set('#splitOpen',money(s.unrealized));set('#avgDay',`${money(s.avgWinDay)} avg green day`);
  set('#leverage',`${s.leverage.toFixed(2)}×`);set('#top5',`${s.top5Pct}%`);set('#positionCount',s.openPositions);set('#givebackPct',`${give.toFixed(0)}%`);
  set('#exposureText',`${money(s.exposure)} invested against ${money(s.equity)} estimated equity.`);set('#concentrationText',`Top 10 positions account for ${s.top10Pct}% of exposure.`);
  ring('#leverageRing',Math.min(s.leverage/2*100,100));ring('#concentrationRing',s.top5Pct);ring('#positionsRing',Math.min(s.openPositions/75*100,100));
  set('#methodology',D.methodology+' Raw brokerage details are not included in this public dataset.');renderTable();
}
function buildCharts(){
  const labels=D.series.map(x=>x.date),equity=D.series.map(x=>x.equity),funding=D.series.map(x=>x.funding);
  const ctx=document.querySelector('#sparkEquity').getContext('2d'),grad=ctx.createLinearGradient(0,0,0,60);grad.addColorStop(0,'rgba(14,138,166,.35)');grad.addColorStop(1,'rgba(14,138,166,0)');
  charts.spark=new Chart(ctx,{type:'line',data:{labels,datasets:[{data:equity,borderColor:C.cyan,backgroundColor:grad,fill:true,borderWidth:1.5,pointRadius:0,tension:.3}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false}},layout:{padding:0}}});
  charts.equity=new Chart(document.querySelector('#equityChart'),{type:'line',data:{labels,datasets:[{label:'Estimated equity',data:equity,borderColor:C.cyan,backgroundColor:'rgba(14,138,166,.07)',fill:true,borderWidth:2,pointRadius:0,tension:.25},{label:'Cumulative funding',data:funding,borderColor:'#93aebd',borderDash:[5,5],borderWidth:1.5,pointRadius:0,tension:0}]},options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>`${c.dataset.label}: ${money(c.raw)}`}}},scales:{...baseScales,y:{...baseScales.y,ticks:{callback:v=>money(v,true)}}}}});
  charts.composition=new Chart(document.querySelector('#compositionChart'),{type:'doughnut',data:{labels:['Realized profit','Open losses'],datasets:[{data:[Math.abs(D.summary.realized),Math.abs(D.summary.unrealized)],backgroundColor:[C.green,C.red],borderWidth:0,spacing:3}]},options:{cutout:'78%',plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>`${c.label}: ${money(c.raw)}`}}}}});
  charts.daily=new Chart(document.querySelector('#dailyChart'),{type:'bar',data:{labels,data:D.series.map(x=>x.dailyRealized),datasets:[{data:D.series.map(x=>x.dailyRealized),backgroundColor:c=>c.raw>=0?'rgba(43,158,74,.8)':'rgba(217,72,72,.8)',borderRadius:2}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>`Realized: ${money(c.raw)}`}}},scales:{...baseScales,y:{...baseScales.y,ticks:{callback:v=>money(v,true)}}}}});
  charts.monthly=new Chart(document.querySelector('#monthlyChart'),{type:'bar',data:{labels:D.monthly.map(x=>x.month),datasets:[{data:D.monthly.map(x=>x.realized),backgroundColor:[C.purple,C.cyan,C.green],borderRadius:3}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>money(c.raw)}}},scales:{...baseScales,y:{...baseScales.y,ticks:{callback:v=>money(v,true)}}}}});
  const sym=[...D.symbols].sort((a,b)=>Math.abs(b.realized)-Math.abs(a.realized)).slice(0,16).sort((a,b)=>a.realized-b.realized);
  charts.symbol=new Chart(document.querySelector('#symbolChart'),{type:'bar',data:{labels:sym.map(x=>x.symbol),datasets:[{data:sym.map(x=>x.realized),backgroundColor:sym.map(x=>x.realized>=0?C.green:C.red),borderRadius:2}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>money(c.raw)}}},scales:{x:{...baseScales.y,ticks:{callback:v=>money(v,true)}},y:{grid:{display:false}}}}});
  const bubbles=D.positions.map((p,i)=>({x:p.marketValue,y:p.returnPct,r:Math.max(4,Math.min(24,Math.sqrt(Math.abs(p.marketValue))/3.3)),symbol:p.symbol,pnl:p.unrealized}));
  charts.risk=new Chart(document.querySelector('#riskMap'),{type:'bubble',data:{datasets:[{data:bubbles,backgroundColor:bubbles.map(x=>x.pnl>=0?'rgba(43,158,74,.65)':'rgba(217,72,72,.65)'),borderColor:bubbles.map(x=>x.pnl>=0?C.green:C.red),borderWidth:1}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>`${c.raw.symbol} · ${money(c.raw.x)} · ${pct(c.raw.y)}`}}},scales:{x:{title:{display:true,text:'POSITION SIZE'},ticks:{callback:v=>money(v,true)},grid:{color:'rgba(28,43,54,.10)'}},y:{title:{display:true,text:'OPEN RETURN'},ticks:{callback:v=>`${v}%`},grid:{color:'rgba(28,43,54,.10)'}}}}});
  const top=D.positions.slice(0,9),other=D.positions.slice(9).reduce((a,x)=>a+x.marketValue,0);charts.allocation=new Chart(document.querySelector('#allocationChart'),{type:'doughnut',data:{labels:[...top.map(x=>x.symbol),'OTHER'],datasets:[{data:[...top.map(x=>x.marketValue),other],backgroundColor:[C.cyan,C.purple,C.orange,C.green,'#64a7c2','#9484cf','#c9a06b','#6fb597','#90aab8','#b9cedb'],borderColor:css('--panel'),borderWidth:3}]},options:{cutout:'62%',plugins:{legend:{position:'bottom',labels:{boxWidth:7,boxHeight:7,padding:13}},tooltip:{...tooltip,callbacks:{label:c=>`${c.label}: ${money(c.raw)}`}}}}});
}
function activityWindowDates(n){return new Set(D.series.slice(-n).map(x=>x.date))}
function getActivityData(n){
  const dateSet=activityWindowDates(n),dates=[...dateSet].sort();
  const all=D.transactions.filter(t=>dateSet.has(t.date));
  const trades=all.filter(t=>t.code==='Buy'||t.code==='Sell');
  const buyVolume=trades.filter(t=>t.code==='Buy').reduce((a,t)=>a+Math.abs(t.amount),0);
  const sellVolume=trades.filter(t=>t.code==='Sell').reduce((a,t)=>a+Math.abs(t.amount),0);
  const symbols=new Set(trades.map(t=>t.symbol).filter(Boolean));
  const bySymbol={};trades.forEach(t=>{bySymbol[t.symbol]=(bySymbol[t.symbol]||0)+t.amount});
  const perDaySeries=D.series.filter(x=>dateSet.has(x.date));
  const realized=perDaySeries.reduce((a,x)=>a+x.dailyRealized,0);
  const tradeCounts={};trades.forEach(t=>{tradeCounts[t.date]=(tradeCounts[t.date]||0)+1});
  return{dates,all,trades,buyVolume,sellVolume,symbols,bySymbol,perDaySeries,realized,tradeCounts};
}
function buildActivityCharts(){
  charts.activityDaily=new Chart(document.querySelector('#activityDailyChart'),{type:'bar',data:{labels:[],datasets:[{data:[],backgroundColor:c=>c.raw>=0?'rgba(43,158,74,.8)':'rgba(217,72,72,.8)',borderRadius:2}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>`Realized: ${money(c.raw)}`}}},scales:{...baseScales,y:{...baseScales.y,ticks:{callback:v=>money(v,true)}}}}});
  charts.activityComposition=new Chart(document.querySelector('#activityCompositionChart'),{type:'doughnut',data:{labels:['Buys','Sells'],datasets:[{data:[0,0],backgroundColor:[C.cyan,C.purple],borderWidth:0,spacing:3}]},options:{cutout:'78%',plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>`${c.label}: ${money(c.raw)}`}}}}});
  charts.activitySymbol=new Chart(document.querySelector('#activitySymbolChart'),{type:'bar',data:{labels:[],datasets:[{data:[],backgroundColor:[],borderRadius:2}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>money(c.raw)}}},scales:{x:{...baseScales.y,ticks:{callback:v=>money(v,true)}},y:{grid:{display:false}}}}});
  charts.activityCount=new Chart(document.querySelector('#activityCountChart'),{type:'bar',data:{labels:[],datasets:[{data:[],backgroundColor:[],borderRadius:2}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>{const p=(c.dataset.pnl||{})[c.label]??0;return `${c.raw} trade${c.raw===1?'':'s'} · realized ${money(p)}`}}}},scales:{...baseScales,y:{...baseScales.y,ticks:{precision:0}}}}});
}
function updateActivity(n){
  activityWindow=n;const a=getActivityData(n);
  set('#actTxCount',a.trades.length);set('#actTxWindow',`${a.dates.length} trading day${a.dates.length===1?'':'s'} · ${n}D window`);
  set('#actSymbols',a.symbols.size);set('#actSymbolNote',a.symbols.size?`incl. ${[...a.symbols].slice(0,3).join(', ')}${a.symbols.size>3?'…':''}`:'No symbols traded');
  set('#actVolume',money(a.buyVolume+a.sellVolume,true));set('#actVolumeNote',`${money(a.buyVolume,true)} bought · ${money(a.sellVolume,true)} sold`);
  set('#actRealized',money(a.realized));document.querySelector('#actRealized').classList.toggle('negative',a.realized<0);set('#actRealizedNote',`Across ${a.dates.length} day${a.dates.length===1?'':'s'} in window`);
  charts.activityDaily.data.labels=a.perDaySeries.map(x=>x.date);charts.activityDaily.data.datasets[0].data=a.perDaySeries.map(x=>x.dailyRealized);charts.activityDaily.update();
  charts.activityComposition.data.datasets[0].data=[a.buyVolume,a.sellVolume];charts.activityComposition.update();
  set('#actDonutNet',money(a.sellVolume-a.buyVolume,true));set('#actSplitBuy',money(a.buyVolume));set('#actSplitSell',money(a.sellVolume));
  const symRows=Object.entries(a.bySymbol).sort((x,y)=>Math.abs(y[1])-Math.abs(x[1])).slice(0,16).sort((x,y)=>x[1]-y[1]);
  charts.activitySymbol.data.labels=symRows.map(x=>x[0]);charts.activitySymbol.data.datasets[0].data=symRows.map(x=>x[1]);charts.activitySymbol.data.datasets[0].backgroundColor=symRows.map(x=>x[1]>=0?C.green:C.red);charts.activitySymbol.update();
  const pnlByDate=Object.fromEntries(a.perDaySeries.map(x=>[x.date,x.dailyRealized]));
  charts.activityCount.data.labels=a.dates;charts.activityCount.data.datasets[0].data=a.dates.map(d=>a.tradeCounts[d]||0);
  charts.activityCount.data.datasets[0].backgroundColor=a.dates.map(d=>(pnlByDate[d]??0)>=0?C.green:C.red);
  charts.activityCount.data.datasets[0].pnl=pnlByDate;charts.activityCount.update();
  renderActivityTable();
}
function renderActivityTable(){
  const dateSet=activityWindowDates(activityWindow),q=document.querySelector('#activitySearch')?.value.toUpperCase()||'';
  let rows=D.transactions.filter(t=>dateSet.has(t.date)&&(t.symbol||'').toUpperCase().includes(q));
  rows.sort((x,y)=>typeof x[activitySort.key]==='string'?x[activitySort.key].localeCompare(y[activitySort.key])*activitySort.dir:(x[activitySort.key]-y[activitySort.key])*activitySort.dir);
  const body=document.querySelector('#activityRows');
  if(!rows.length){body.innerHTML='<tr class="empty-row"><td colspan="6">No transactions in this window.</td></tr>';document.querySelector('#activityShowAll').style.display='none';return}
  body.innerHTML=rows.slice(0,activityLimit).map(t=>{const kind=ACTION_CODES[t.code]||'other';return `<tr><td class="price-pair">${t.date}</td><td>${t.symbol||'—'}</td><td><span class="action-pill ${kind}">${t.code}</span></td><td>${t.quantity||'—'}</td><td>${t.price?money(t.price):'—'}</td><td class="${t.amount<0?'negative':'positive'}">${money(t.amount)}</td></tr>`}).join('');
  document.querySelector('#activityShowAll').style.display=rows.length>activityLimit?'block':'none';
}
function bind(){
  document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-range]').forEach(x=>x.classList.remove('active'));b.classList.add('active');range(b.dataset.range)});
  document.querySelector('#positionSearch').oninput=renderTable;document.querySelector('#showAll').onclick=()=>{tableLimit=999;renderTable()};
  document.querySelectorAll('th[data-sort]').forEach(th=>th.onclick=()=>{sortState.dir=sortState.key===th.dataset.sort?-sortState.dir:-1;sortState.key=th.dataset.sort;renderTable()});
  document.querySelector('#downloadSnapshot').onclick=downloadSnapshot;
  document.querySelectorAll('.info').forEach(el=>{el.onmouseenter=e=>showTip(e,el.dataset.tip);el.onmouseleave=hideTip});
  document.querySelectorAll('[data-activity-range]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-activity-range]').forEach(x=>x.classList.remove('active'));b.classList.add('active');activityLimit=12;updateActivity(+b.dataset.activityRange)});
  document.querySelector('#activitySearch').oninput=renderActivityTable;
  document.querySelector('#activityShowAll').onclick=()=>{activityLimit=999;renderActivityTable()};
  document.querySelectorAll('th[data-asort]').forEach(th=>th.onclick=()=>{activitySort.dir=activitySort.key===th.dataset.asort?-activitySort.dir:-1;activitySort.key=th.dataset.asort;renderActivityTable()});
}
function range(value){const n=value==='all'?D.series.length:+value,start=Math.max(0,D.series.length-n),slice=D.series.slice(start);['equity','daily'].forEach(k=>{charts[k].data.labels=slice.map(x=>x.date)});charts.equity.data.datasets[0].data=slice.map(x=>x.equity);charts.equity.data.datasets[1].data=slice.map(x=>x.funding);charts.daily.data.datasets[0].data=slice.map(x=>x.dailyRealized);charts.equity.update();charts.daily.update()}
function renderTable(){const q=document.querySelector('#positionSearch')?.value.toUpperCase()||'';let rows=D.positions.filter(x=>x.symbol.includes(q));rows.sort((a,b)=>typeof a[sortState.key]==='string'?a[sortState.key].localeCompare(b[sortState.key])*sortState.dir:(a[sortState.key]-b[sortState.key])*sortState.dir);document.querySelector('#positionRows').innerHTML=rows.slice(0,tableLimit).map(p=>`<tr><td>${p.symbol}</td><td>${money(p.marketValue)}</td><td class="${p.unrealized<0?'negative':'positive'}">${money(p.unrealized)}</td><td><span class="return-pill ${p.returnPct<0?'red':''}">${pct(p.returnPct)}</span></td><td><span class="price-pair">${money(p.avgCost)} / ${money(p.mark)}</span></td></tr>`).join('');document.querySelector('#showAll').style.display=rows.length>tableLimit?'block':'none'}
function downloadSnapshot(){const s=D.summary,text=`TRADING JOURNEY — ADVISOR SNAPSHOT\nData through ${D.sourceThrough}\n\nEstimated equity: ${money(s.equity)}\nContributions: ${money(s.funding)}\nEstimated net gain: ${money(s.netGain)} (${pct(s.returnPct)})\nRealized P&L: ${money(s.realized)}\nOpen P&L: ${money(s.unrealized)}\nGross exposure: ${money(s.exposure)} (${s.leverage}x equity)\nOpen positions: ${s.openPositions}\nTop 5 concentration: ${s.top5Pct}%\n\nMethodology: ${D.methodology}\n`;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=`trading-journey-${D.sourceThrough}.txt`;a.click();URL.revokeObjectURL(a.href)}
let marketLimit=12, marketSort={key:'marketValue',dir:-1};
const compactNum=n=>n==null?'—':new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
function renderMarket(){
  const M=D.market;if(!M||!M.stocks?.length)return;
  document.querySelector('#market').hidden=false;
  set('#marketAsOf',`Quotes as of ${new Date(M.asOf+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}`);
  const [spx,ndx]=['SPX','NDX'].map(s=>M.indexes.find(i=>i.symbol===s));
  set('#mktSpx',spx?spx.value.toLocaleString():'—');if(spx?.changePct!=null){set('#mktSpxNote',pct(spx.changePct)+' vs prior update')}
  set('#mktNdx',ndx?ndx.value.toLocaleString():'—');if(ndx?.changePct!=null){set('#mktNdxNote',pct(ndx.changePct)+' vs prior update')}
  const S=M.stocks,dayPnl=S.reduce((a,s)=>a+(s.dayPnl||0),0);
  const el=document.querySelector('#mktDayPnl');el.textContent=money(dayPnl);el.classList.toggle('negative',dayPnl<0);
  const movers=[...S].filter(s=>s.changePct!=null);
  const up=movers.filter(s=>s.changePct>0).length;
  set('#mktDayPnlNote',`${up} of ${movers.length} holdings up today`);
  const best=[...movers].sort((a,b)=>b.changePct-a.changePct)[0],worst=[...movers].sort((a,b)=>a.changePct-b.changePct)[0];
  if(best&&worst){set('#mktBestWorst',`${best.symbol} / ${worst.symbol}`);set('#mktBestWorstNote',`${pct(best.changePct)} / ${pct(worst.changePct)}`)}
  const mv=[...movers].sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct)).slice(0,16).sort((a,b)=>a.changePct-b.changePct);
  charts.movers=new Chart(document.querySelector('#moversChart'),{type:'bar',data:{labels:mv.map(s=>s.symbol),datasets:[{data:mv.map(s=>s.changePct),backgroundColor:mv.map(s=>s.changePct>=0?C.green:C.red),borderRadius:2}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>{const s=mv[c.dataIndex];return `${pct(c.raw)} · ${money(s.dayPnl||0)} on ${money(s.marketValue)}`}}}},scales:{x:{...baseScales.y,ticks:{callback:v=>`${v}%`}},y:{grid:{display:false}}}}});
  const sectors={};S.forEach(s=>{const k=s.sector||'Funds / Other';sectors[k]=(sectors[k]||0)+(s.marketValue||0)});
  const secRows=Object.entries(sectors).sort((a,b)=>b[1]-a[1]);
  charts.sector=new Chart(document.querySelector('#sectorChart'),{type:'doughnut',data:{labels:secRows.map(x=>x[0]),datasets:[{data:secRows.map(x=>x[1]),backgroundColor:[C.cyan,C.purple,C.orange,C.green,'#64a7c2','#9484cf','#c9a06b','#6fb597','#90aab8','#b9cedb'],borderColor:css('--panel'),borderWidth:3}]},options:{cutout:'62%',plugins:{legend:{position:'bottom',labels:{boxWidth:7,boxHeight:7,padding:10}},tooltip:{...tooltip,callbacks:{label:c=>`${c.label}: ${money(c.raw)}`}}}}});
  const rng=[...S].filter(s=>s.rangePct!=null).sort((a,b)=>b.marketValue-a.marketValue).slice(0,14);
  charts.range=new Chart(document.querySelector('#rangeChart'),{type:'bar',data:{labels:rng.map(s=>s.symbol),datasets:[{data:rng.map(s=>s.rangePct),backgroundColor:rng.map(s=>s.rangePct>=80?C.orange:s.rangePct>=40?C.cyan:C.red),borderRadius:2}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>{const s=rng[c.dataIndex];return `${c.raw}% of range · ${money(s.low52)} – ${money(s.high52)}`}}}},scales:{x:{...baseScales.y,min:0,max:100,ticks:{callback:v=>`${v}%`}},y:{grid:{display:false}}}}});
  const vol=[...S].filter(s=>s.volumeRatio!=null&&s.changePct!=null).sort((a,b)=>b.volumeRatio-a.volumeRatio).slice(0,12)
    .map(s=>({...s,signed:s.changePct<0?-s.volumeRatio:s.volumeRatio})).sort((a,b)=>a.signed-b.signed);
  charts.volume=new Chart(document.querySelector('#volumeChart'),{type:'bar',data:{labels:vol.map(s=>s.symbol),datasets:[{data:vol.map(s=>s.signed),backgroundColor:vol.map(s=>s.signed<0?C.red:C.green),borderRadius:2}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tooltip,callbacks:{label:c=>{const s=vol[c.dataIndex];return `${s.volumeRatio}× avg volume · price ${pct(s.changePct)} ${s.signed<0?'— selling pressure':'— buying interest'}`}}}},scales:{x:{...baseScales.y,ticks:{callback:v=>`${Math.abs(v)}×`}},y:{grid:{display:false}}}}});
  renderMarketTable();
  document.querySelector('#marketSearch').oninput=renderMarketTable;
  document.querySelector('#marketShowAll').onclick=()=>{marketLimit=999;renderMarketTable()};
  document.querySelectorAll('th[data-msort]').forEach(th=>th.onclick=()=>{marketSort.dir=marketSort.key===th.dataset.msort?-marketSort.dir:-1;marketSort.key=th.dataset.msort;renderMarketTable()});
}
function renderMarketTable(){
  const q=document.querySelector('#marketSearch')?.value.toUpperCase()||'';
  let rows=D.market.stocks.filter(s=>s.symbol.includes(q));
  rows.sort((a,b)=>{const k=marketSort.key,x=a[k],y=b[k];if(x==null)return 1;if(y==null)return -1;return (typeof x==='string'?x.localeCompare(y):x-y)*marketSort.dir});
  document.querySelector('#marketRows').innerHTML=rows.slice(0,marketLimit).map(s=>{
    const e=s.earningsDate?`${new Date(s.earningsDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}${s.earningsTiming?` ${s.earningsTiming.toUpperCase()}`:''}`:'—';
    return `<tr><td><b>${s.symbol}</b><small class="sub">${s.sector||''}</small></td><td>${s.last!=null?money(s.last):'—'}</td><td><span class="return-pill ${s.changePct<0?'red':''}">${s.changePct!=null?pct(s.changePct):'—'}</span></td><td class="${(s.dayPnl||0)<0?'negative':'positive'}">${s.dayPnl!=null?money(s.dayPnl):'—'}</td><td>${s.peRatio!=null?s.peRatio.toFixed(1):'—'}</td><td>${s.marketCap!=null?'$'+compactNum(s.marketCap):'—'}</td><td><span class="range-track"><i style="left:${s.rangePct??50}%"></i></span></td><td class="${s.earningsDate?'earnings-soon':''}">${e}</td></tr>`}).join('');
  document.querySelector('#marketShowAll').style.display=rows.length>marketLimit?'block':'none';
}
function renderCalendar(){
  const cal=D.calendar;if(!cal?.length)return;
  document.querySelector('#calendar').hidden=false;
  const today=D.market?.asOf||D.sourceThrough;
  const qty=Object.fromEntries(D.positions.map(p=>[p.symbol,p.quantity]));
  const earn=cal.filter(e=>e.type==='earnings');
  const next=earn.find(e=>e.date>=today);
  if(next){set('#calNextEarnings',next.symbol);set('#calNextEarningsNote',`${new Date(next.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} · ${next.detail}`)}
  const week=new Date(today+'T12:00:00');week.setDate(week.getDate()+7);const weekEnd=week.toISOString().slice(0,10);
  set('#calWeekCount',cal.filter(e=>e.date<=weekEnd).length);
  const pays=cal.filter(e=>e.type==='dividend-pay');
  const income=pays.reduce((a,e)=>{const m=e.detail.match(/\$([\d.]+)\/share/);return a+(m?+m[1]*(qty[e.symbol]||0):0)},0);
  set('#calDivIncome',money(income));set('#calDivIncomeNote',`across ${pays.length} payout${pays.length===1?'':'s'} scheduled`);
  const monthEnd=today.slice(0,7)+'-31';const monthEarn=earn.filter(e=>e.date<=monthEnd);
  set('#calMonthEarnings',monthEarn.length);set('#calMonthEarningsNote',monthEarn.length?monthEarn.map(e=>e.symbol).join(', '):'None scheduled');
  const byDate={};cal.forEach(e=>{(byDate[e.date]=byDate[e.date]||[]).push(e)});
  document.querySelector('#eventTimeline').innerHTML=Object.entries(byDate).map(([date,events])=>{
    const dt=new Date(date+'T12:00:00');
    return `<div class="timeline-day${date===today?' today':''}"><div class="timeline-date"><strong>${dt.toLocaleDateString('en-US',{day:'numeric'})}</strong><span>${dt.toLocaleDateString('en-US',{month:'short'})}</span><small>${dt.toLocaleDateString('en-US',{weekday:'short'})}</small></div><div class="timeline-events">${events.map(e=>`<div class="event-card ${e.type}"><span class="event-pill">${e.type==='gold'?'⬤ GOLD':e.type==='earnings'?'EARNINGS':e.type==='ex-dividend'?'EX-DIV':'PAYOUT'}</span><b>${e.symbol}</b><p>${e.detail}</p></div>`).join('')}</div></div>`}).join('');
}
function renderMacro(){
  const B=D.macroBoard;if(!B||!B.items?.length)return;
  document.querySelector('#macro').hidden=false;
  set('#macroAsOf',`As of ${new Date(B.asOf+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}`);
  const R=B.regime,banner=document.querySelector('#regimeBanner'),icon=document.querySelector('#regimeIcon');
  set('#regimeLabel',R.label==='RISK-ON'?'Risk-on — money is chasing growth':R.label==='RISK-OFF'?'Risk-off — money is hiding':'Mixed — no clear direction');
  set('#regimeDetail',R.detail+(R.vixBand?` A ${R.vixBand} VIX means ${{calm:'hedging is cheap and markets are relaxed',normal:'nothing unusual in hedging demand',nervous:'traders are paying up for protection',panic:'fear is elevated — expect wild swings'}[R.vixBand]}.`:''));
  const col=R.label==='RISK-ON'?'var(--green)':R.label==='RISK-OFF'?'var(--red)':'var(--orange)';
  icon.style.background=col;banner.style.borderColor=col;
  const ORDER=['VIX','SPX','NDX','DJX','IWM','HYG','TLT','UUP','GLD','SLV','USO','BRTI'];
  const items=[...B.items].sort((a,b)=>ORDER.indexOf(a.symbol)-ORDER.indexOf(b.symbol));
  document.querySelector('#macroGrid').innerHTML=items.map(it=>{
    const chg=it.changePct;
    const fmt=it.symbol==='BRTI'?money(it.value):it.kind==='index'?it.value.toLocaleString():money(it.value);
    return `<article class="macro-card${it.symbol==='GLD'||it.symbol==='SLV'?' gold-card':''}">
      <span class="macro-label">${it.label}</span>
      <div class="macro-row"><strong>${fmt}</strong>${chg!=null?`<span class="return-pill ${chg<0?'red':''}">${pct(chg)}</span>`:'<span class="macro-new">tracking</span>'}</div>
      <small>${it.desc}</small></article>`}).join('');
  const hist=B.history||[];
  if(hist.length>=2){
    const TRACK=[['SPX',C.cyan],['GLD','#d9a521'],['TLT',C.purple],['UUP','#5d7486'],['IWM',C.green],['USO',C.red]];
    const labels=hist.map(h=>h.date);
    const ds=TRACK.filter(([s])=>hist[0].values[s]!=null).map(([s,color])=>({label:(D.macroBoard.items.find(i=>i.symbol===s)||{}).label||s,data:hist.map(h=>h.values[s]!=null?+(((h.values[s]-hist[0].values[s])/hist[0].values[s])*100).toFixed(2):null),borderColor:color,borderWidth:2,pointRadius:0,tension:.3,fill:false}));
    charts.macroTrend=new Chart(document.querySelector('#macroTrendChart'),{type:'line',data:{labels,datasets:ds},options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:8,boxHeight:8,padding:12}},tooltip:{...tooltip,callbacks:{label:c=>`${c.dataset.label}: ${pct(c.raw)}`}}},scales:{...baseScales,y:{...baseScales.y,ticks:{callback:v=>`${v}%`}}}}});
  }else{set('#macroTrendNote','Tracking started today — the trend line appears from tomorrow\'s update onward.');document.querySelector('#macroTrendChart').parentElement.innerHTML='<p style="color:var(--muted);padding:30px 0">Day 1 of tracking. Each daily update adds a point; the trend takes shape over the coming sessions.</p>'}
}
function renderWatch(){
  const M=D.market;if(!M||!M.stocks?.length)return;
  document.querySelector('#watch').hidden=false;
  const today=M.asOf,posBySym=Object.fromEntries(D.positions.map(p=>[p.symbol,p]));
  const soon=d=>{if(!d)return 1e9;return Math.round((new Date(d+'T12:00:00')-new Date(today+'T12:00:00'))/864e5)};
  const nextGold=(D.calendar||[]).find(e=>e.type==='gold'&&e.date>today&&soon(e.date)<=5);
  if(nextGold){document.querySelector('#watchMacro').hidden=false;
    set('#watchMacroTitle',`${nextGold.symbol} — ${new Date(nextGold.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}`);
    set('#watchMacroDetail',nextGold.detail+' Expect volatility across the whole book, not just gold-linked names.')}
  const rows=[];
  M.stocks.forEach(s=>{
    const sig=[];let score=0;
    const days=soon(s.earningsDate);
    if(days<=3){sig.push({t:`Earnings ${days===0?'today':days===1?'tomorrow':`in ${days}d`}${s.earningsTiming?` (${s.earningsTiming.toUpperCase()})`:''}`,c:'gold'});score+=days<=1?5:3}
    if(s.volumeRatio>=1.5&&s.changePct<0){sig.push({t:`${s.volumeRatio}× volume on ${pct(s.changePct)} — sellers active, review exit`,c:'bear'});score+=4}
    else if(s.volumeRatio>=1.8&&s.changePct>0){sig.push({t:`${s.volumeRatio}× volume on ${pct(s.changePct)} — strong buying interest`,c:'bull'});score+=2}
    if(s.changePct<=-5){sig.push({t:`Fell ${pct(s.changePct)} today`,c:'bear'});score+=3}
    else if(s.changePct>=7){sig.push({t:`Jumped ${pct(s.changePct)} today — extended`,c:'warn'});score+=2}
    if(s.rangePct!=null&&s.rangePct>=94){sig.push({t:`At 52-week high zone (${s.rangePct}%)`,c:'warn'});score+=1}
    if(s.rangePct!=null&&s.rangePct<=8){sig.push({t:`Near 52-week low (${s.rangePct}%)`,c:'bear'});score+=2}
    const p=posBySym[s.symbol];
    if(p&&p.returnPct<=-12){sig.push({t:`Open position ${pct(p.returnPct)} underwater`,c:'bear'});score+=2}
    if(sig.length)rows.push({s,sig,score});
  });
  rows.sort((a,b)=>b.score-a.score);
  document.querySelector('#watchGrid').innerHTML=rows.slice(0,9).map(({s,sig})=>`
    <article class="watch-card${sig.some(x=>x.c==='bear')?' bearish':''}">
      <div class="watch-head"><div><b>${s.symbol}</b><small class="sub">${s.name||s.sector||''}</small></div>
      <div class="watch-quote"><strong>${s.last!=null?money(s.last):'—'}</strong><span class="return-pill ${s.changePct<0?'red':''}">${s.changePct!=null?pct(s.changePct):'—'}</span></div></div>
      <div class="watch-signals">${sig.map(x=>`<span class="signal-chip ${x.c}">${x.t}</span>`).join('')}</div>
    </article>`).join('')||'<p style="color:var(--muted)">No notable signals today — quiet book.</p>';
}
function reveal(){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.08});document.querySelectorAll('.reveal').forEach(x=>io.observe(x))}
function ring(sel,n){document.querySelector(sel).style.setProperty('--pct',n)}function set(sel,v){document.querySelector(sel).textContent=v}function showTip(e,t){const x=document.querySelector('#tooltip');x.textContent=t;x.style.display='block';x.style.left=`${e.clientX+12}px`;x.style.top=`${e.clientY+12}px`}function hideTip(){document.querySelector('#tooltip').style.display='none'}
init();
