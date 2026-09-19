import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown, CircleHelp, Flag, Info, X } from 'lucide-react';

type View = 'drivers' | 'constructors';
type Metric = 'points' | 'position';
type Driver = { id: string; code: string; name: string; team: string; color: string; points: number[]; finishes: string[] };
type Entity = Driver & { total: number; members?: Driver[] };

const rounds = [
  ['AUS', 'Australian Grand Prix', 'Albert Park', '16 Mar'],
  ['CHN', 'Chinese Grand Prix', 'Shanghai International Circuit', '23 Mar'],
  ['JPN', 'Japanese Grand Prix', 'Suzuka Circuit', '6 Apr'],
  ['BHR', 'Bahrain Grand Prix', 'Bahrain International Circuit', '13 Apr'],
  ['JED', 'Saudi Arabian Grand Prix', 'Jeddah Corniche Circuit', '20 Apr'],
  ['MIA', 'Miami Grand Prix', 'Miami International Autodrome', '4 May'],
  ['EMI', 'Emilia-Romagna Grand Prix', 'Autodromo Enzo e Dino Ferrari', '18 May'],
  ['MON', 'Monaco Grand Prix', 'Circuit de Monaco', '25 May'],
  ['ESP', 'Spanish Grand Prix', 'Circuit de Barcelona-Catalunya', '1 Jun'],
  ['CAN', 'Canadian Grand Prix', 'Circuit Gilles Villeneuve', '15 Jun'],
  ['AUT', 'Austrian Grand Prix', 'Red Bull Ring', '29 Jun'],
  ['GBR', 'British Grand Prix', 'Silverstone Circuit', '6 Jul'],
] as const;

const drivers: Driver[] = [
  { id:'piastri', code:'PIA', name:'Oscar Piastri', team:'McLaren', color:'#ff8700', points:[2,32,25,25,25,32,15,15,25,12,25,18], finishes:['P9','P1','P1','P1','P1','P1','P3','P3','P1','P4','P1','P2'] },
  { id:'norris', code:'NOR', name:'Lando Norris', team:'McLaren', color:'#ff8700', points:[25,19,18,15,18,26,25,25,18,25,18,25], finishes:['P1','P2','P3','P3','P2','P2','P1','P1','P2','P1','P2','P1'] },
  { id:'verstappen', code:'VER', name:'Max Verstappen', team:'Red Bull Racing', color:'#3671c6', points:[18,18,25,8,15,12,18,12,12,18,15,12], finishes:['P2','P4','P1','P6','P3','P4','P2','P4','P4','P2','P3','P4'] },
  { id:'russell', code:'RUS', name:'George Russell', team:'Mercedes', color:'#27f4d2', points:[15,15,15,18,12,10,12,10,15,15,10,10], finishes:['P3','P3','P4','P2','P4','P5','P4','P5','P3','P3','P5','P5'] },
  { id:'leclerc', code:'LEC', name:'Charles Leclerc', team:'Ferrari', color:'#e8002d', points:[4,12,12,12,10,18,10,18,10,8,12,15], finishes:['P8','P5','P5','P4','P5','P3','P5','P2','P5','P6','P4','P3'] },
  { id:'hamilton', code:'HAM', name:'Lewis Hamilton', team:'Ferrari', color:'#e8002d', points:[1,26,8,10,8,8,8,6,8,10,8,8], finishes:['P10','P1 sprint','P6','P5','P6','P6','P6','P7','P6','P5','P6','P6'] },
  { id:'antonelli', code:'ANT', name:'Kimi Antonelli', team:'Mercedes', color:'#27f4d2', points:[12,10,10,6,6,6,6,8,6,0,6,6], finishes:['P4','P6','P5','P7','P7','P7','P7','P6','P7','Retired','P7','P7'] },
  { id:'albon', code:'ALB', name:'Alexander Albon', team:'Williams', color:'#64c4ff', points:[10,8,6,4,4,4,4,4,4,6,4,4], finishes:['P5','P7','P7','P8','P8','P8','P8','P8','P8','P7','P8','P8'] },
];

const teamOrder = ['McLaren','Mercedes','Ferrari','Red Bull Racing','Williams'];
const heat = ['#202229','#29352f','#315941','#397d53','#40a765','#55d982'];

function cumulative(values: number[]) { let sum=0; return values.map(v => sum += v); }
function fmtGap(value:number) { return value === 0 ? 'LEADER' : `−${value}`; }

export default function Gridline() {
  const initial = new URLSearchParams(location.search);
  const [view,setView] = useState<View>(initial.get('view') === 'constructors' ? 'constructors' : 'drivers');
  const [metric,setMetric] = useState<Metric>(initial.get('metric') === 'position' ? 'position' : 'points');
  const [focus,setFocus] = useState<string|null>(initial.get('focus'));
  const [activeRound,setActiveRound] = useState<number|null>(() => Number(initial.get('round')) || null);
  const [hoverRound,setHoverRound] = useState<number|null>(null);
  const [expanded,setExpanded] = useState<string|null>(null);

  const entities = useMemo<Entity[]>(() => {
    if (view === 'drivers') return drivers.map(d => ({...d, total:d.points.slice(0,8).reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total);
    return teamOrder.map(team => {
      const members=drivers.filter(d=>d.team===team); const color=members[0]?.color ?? '#999';
      const points=rounds.map((_,i)=>members.reduce((s,d)=>s+d.points[i],0));
      return { id:team.toLowerCase().replaceAll(' ','-'), code:team.slice(0,3).toUpperCase(), name:team, team, color, points, finishes:points.map(()=>''), total:points.slice(0,8).reduce((a,b)=>a+b,0), members };
    }).sort((a,b)=>b.total-a.total);
  },[view]);
  const maxPoints=Math.max(...entities.flatMap(e=>e.points));
  const positions=rounds.map((_,ri)=>[...entities].sort((a,b)=>cumulative(b.points)[ri]-cumulative(a.points)[ri]).map(e=>e.id));
  const selectedRound=activeRound ? rounds[activeRound-1] : null;
  const pulse=entities.slice(0,5);
  const leader=entities[0]?.total ?? 0;

  useEffect(() => {
    const q=new URLSearchParams(); q.set('view',view); q.set('metric',metric); if(focus) q.set('focus',focus); if(activeRound) q.set('round',String(activeRound));
    history.replaceState(null,'',`${location.pathname}?${q}`);
  },[view,metric,focus,activeRound]);
  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){ if(activeRound)setActiveRound(null); else setFocus(null); }}; addEventListener('keydown',onKey); return()=>removeEventListener('keydown',onKey); },[activeRound]);

  return <div className="gridline-page">
    <header className="gridline-topbar">
      <div className="gridline-brand"><span className="gridline-mark"><i/><i/><i/></span><strong>GRIDLINE</strong><span>Championship heatmap</span></div>
      <div className="gridline-season"><label htmlFor="gridline-season">Season</label><button id="gridline-season">2025 <ChevronDown size={14}/></button></div>
      <div className="gridline-updated"><span/> DATA UPDATED <b>2 MIN AGO</b></div>
    </header>
    <div className="gridline-body">
      <section className="gridline-hero">
        <div><p className="gridline-eyebrow">FORMULA 1 <b>•</b> 2025 SEASON</p><h1>Championship at a glance</h1><p>Round 8 of 24 complete <span>•</span> Monaco, Monte Carlo</p></div>
        <div className="gridline-controls">
          <div className="gridline-segment" aria-label="Championship view">{(['drivers','constructors'] as View[]).map(v=><button key={v} className={view===v?'active':''} onClick={()=>{setView(v);setFocus(null)}}>{v==='drivers'?'WDC':'WCC'}</button>)}</div>
          <div className="gridline-segment" aria-label="Heatmap metric">{(['points','position'] as Metric[]).map(v=><button key={v} className={metric===v?'active':''} onClick={()=>setMetric(v)}>{v==='points'?'Points':'Position'}</button>)}</div>
        </div>
      </section>

      <section className="gridline-summary" aria-label="Championship leaders">
        {entities.slice(0,3).map((e,i)=><button key={e.id} onClick={()=>setFocus(e.id)} className={focus===e.id?'focused':''}>
          <span className="rank">0{i+1}</span><i style={{background:e.color}}/><span className="identity"><b>{e.code}</b><small>{e.name}</small></span><span className="score"><b>{e.total}</b><small>PTS</small></span><span className={i===0?'leader':'gap'}>{fmtGap(leader-e.total)}</span>
        </button>)}
        <div className="summary-context"><small>CHAMPIONSHIP LEAD</small><b>{leader-(entities[1]?.total??0)} <span>PTS</span></b><p>{entities[0]?.code} over {entities[1]?.code}</p></div>
      </section>

      <section className="gridline-panel pulse-panel">
        <div className="panel-heading"><div><p>CHAMPIONSHIP PULSE</p><h2>Cumulative points</h2></div><span><Info size={14}/> Top 5 competitors</span></div>
        <div className="pulse-chart">
          <div className="pulse-y"><span>300</span><span>200</span><span>100</span><span>0</span></div>
          <svg viewBox="0 0 1000 190" preserveAspectRatio="none" role="img" aria-label="Cumulative championship points chart">
            {[0,1,2,3].map(i=><line key={i} x1="0" x2="1000" y1={i*58+8} y2={i*58+8} className="grid"/>)}
            {pulse.map(e=>{const vals=cumulative(e.points); const path=vals.map((v,i)=>`${i?'L':'M'} ${i*(940/(rounds.length-1))+8} ${181-v/Math.max(leader,1)*170}`).join(' ');return <path key={e.id} d={path} fill="none" stroke={e.color} strokeWidth={focus===e.id?4:2.5} opacity={focus&&focus!==e.id?.3:1} className="pulse-line"/>})}
            {(hoverRound||activeRound) && <line x1={(hoverRound||activeRound)!-1>0?((hoverRound||activeRound)!-1)*(940/(rounds.length-1))+8:8} x2={(hoverRound||activeRound)!-1>0?((hoverRound||activeRound)!-1)*(940/(rounds.length-1))+8:8} y1="0" y2="181" className="guide"/>}
          </svg>
          <div className="pulse-labels">{rounds.map((r,i)=><span key={r[0]}>{r[0]}</span>)}</div>
        </div>
      </section>

      <section className="gridline-panel heatmap-panel">
        <div className="heatmap-toolbar"><div><p>SEASON HEATMAP</p><h2>{view==='drivers'?'Drivers':'Constructors'}</h2><span>Each cell shows {metric==='points'?'championship points earned that weekend':'championship position after the round'}.</span></div><div className="heat-legend"><span>LOW</span>{heat.map(c=><i key={c} style={{background:c}}/>)}<span>HIGH</span>{focus&&<button onClick={()=>setFocus(null)}><X size={13}/> Clear focus</button>}</div></div>
        <div className="heatmap-scroll">
          <div className="heatmap-grid" style={{gridTemplateColumns:`230px repeat(${rounds.length}, 58px) 78px`}}>
            <div className="heat-corner">CHAMPIONSHIP ORDER</div>
            {rounds.map((r,i)=><button key={r[0]} className={`round-head ${(hoverRound===i+1||activeRound===i+1)?'active':''}`} onMouseEnter={()=>setHoverRound(i+1)} onMouseLeave={()=>setHoverRound(null)} onClick={()=>setActiveRound(i+1)}><small>R{i+1}</small><b>{r[0]}</b></button>)}
            <div className="total-head">TOTAL</div>
            {entities.map((e,ei)=><div className={`heat-row-wrap ${focus&&focus!==e.id?'dimmed':''}`} key={e.id} style={{display:'contents'}}>
              <button className="entity-head" onClick={()=>{setFocus(focus===e.id?null:e.id); if(view==='constructors')setExpanded(expanded===e.id?null:e.id)}}><span className="rank">{String(ei+1).padStart(2,'0')}</span><i style={{background:e.color}}/><span><b>{e.code}</b><small>{e.name}</small></span>{view==='constructors'&&<ChevronDown size={14}/>}</button>
              {e.points.map((pts,ri)=>{const position=positions[ri].indexOf(e.id)+1;const future=ri>7; const level=Math.min(5,Math.ceil(pts/Math.max(maxPoints,1)*5)); const status=view==='drivers'?e.finishes[ri]:''; return <button key={ri} onFocus={()=>setHoverRound(ri+1)} onBlur={()=>setHoverRound(null)} onMouseEnter={()=>setHoverRound(ri+1)} onMouseLeave={()=>setHoverRound(null)} onClick={()=>{setFocus(e.id);setActiveRound(ri+1)}} className={`heat-cell ${future?'future':''} ${(hoverRound===ri+1||activeRound===ri+1)?'column-active':''} ${status==='Retired'?'retired':''}`} style={!future?{background:pts===0?'#1a1c22':heat[level]}:{}} aria-label={`${e.name}, ${rounds[ri][1]}, ${pts} points, championship position ${position}`} title={`${e.name} · ${rounds[ri][1]}\n${status||'Weekend'} · ${pts} pts\nChampionship P${position}`}>{future?'':metric==='points'?pts:`P${position}`}{status==='Retired'&&<em>DNF</em>}</button>})}
              <div className="entity-total"><b>{e.total}</b><small>PTS</small></div>
              {view==='constructors'&&expanded===e.id&&<div className="constructor-detail" style={{gridColumn:`1 / span ${rounds.length+2}`}}>{(e.members ?? []).map(d=><span key={d.id}><i style={{background:d.color}}/><b>{d.code}</b> {d.name}<strong>{d.points.reduce((a,b)=>a+b,0)} pts</strong></span>)}</div>}
            </div>)}
          </div>
        </div>
        <div className="heatmap-note"><CircleHelp size={14}/> Future rounds use an empty outline. Zero-point finishes remain dark and show a numeric 0.</div>
      </section>
      <footer className="gridline-footer"><span><b>GRIDLINE</b> Fan-made championship visualization</span><span>Data provided by Jolpica • Not affiliated with Formula 1</span></footer>
    </div>
    {selectedRound&&<><button className="drawer-scrim" aria-label="Close race details" onClick={()=>setActiveRound(null)}/><aside className="race-drawer" aria-label="Race detail drawer"><div className="drawer-top"><span>ROUND {activeRound} OF 24</span><button onClick={()=>setActiveRound(null)} aria-label="Close"><X/></button></div><div className="drawer-flag"><Flag size={22}/></div><h2>{selectedRound[1]}</h2><p className="drawer-track">{selectedRound[2]}</p><p className="drawer-date"><CalendarDays size={15}/> {selectedRound[3]} 2025</p><div className="drawer-callouts"><div><small>RACE WINNER</small><b>{drivers.slice().sort((a,b)=>b.points[activeRound!-1]-a.points[activeRound!-1])[0].name}</b></div><div><small>MOST WEEKEND POINTS</small><b>McLaren</b></div></div><h3>Weekend classification</h3><div className="drawer-results">{drivers.slice().sort((a,b)=>b.points[activeRound!-1]-a.points[activeRound!-1]).map((d,i)=><div key={d.id}><span>{String(i+1).padStart(2,'0')}</span><i style={{background:d.color}}/><b>{d.code}</b><small>{d.finishes[activeRound!-1]}</small><strong>{d.points[activeRound!-1]} <em>PTS</em></strong></div>)}</div><button className="drawer-next" onClick={()=>setActiveRound(Math.min(rounds.length,(activeRound||1)+1))}>Next round <ArrowRight size={16}/></button></aside></>}
  </div>;
}
