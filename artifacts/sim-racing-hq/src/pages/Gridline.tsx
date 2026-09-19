import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown, CircleHelp, Flag, Info, X } from 'lucide-react';

type View = 'drivers' | 'constructors';
type Metric = 'points' | 'position';
type Driver = { id: string; code: string; name: string; team: string; color: string; points: number[]; finishes: string[]; currentPoints?: number };
type Entity = Driver & { total: number; members?: Driver[] };
type Round = readonly [string, string, string, string];

const teamColors: Record<string,string> = { mclaren:'#ff8700', mercedes:'#27f4d2', ferrari:'#e8002d', red_bull:'#3671c6', williams:'#64c4ff', aston_martin:'#229971', alpine:'#ff87bc', haas:'#b6babd', rb:'#6692ff', sauber:'#52e252', audi:'#f50537', cadillac:'#c7c7c7' };

const heat = ['#202229','#29352f','#315941','#397d53','#40a765','#55d982'];

function cumulative(values: number[]) { let sum=0; return values.map(v => sum += v); }
function fmtGap(value:number) { return value === 0 ? 'LEADER' : `−${value}`; }
function roundCode(race:any) {
  const country=String(race.Circuit?.Location?.country ?? '').toLowerCase();
  const known:Record<string,string>={australia:'AUS',china:'CHN',japan:'JPN',bahrain:'BHR','saudi arabia':'JED',usa:'USA',italy:'ITA',monaco:'MON',spain:'ESP',canada:'CAN',austria:'AUT',uk:'GBR',belgium:'BEL',hungary:'HUN',netherlands:'NED',azerbaijan:'AZE',singapore:'SIN',mexico:'MEX',brazil:'BRA',qatar:'QAT',uae:'ARE'};
  return known[country] ?? String(race.raceName).replace(/grand prix/i,'').trim().slice(0,3).toUpperCase();
}

// Jolpica caps `limit` well below a full season of result rows, and it pages over
// rows rather than races, so a single race can straddle two pages. Walk every page
// and stitch the split races back together by round.
const PAGE_SIZE=100;
const MAX_PAGES=40;

async function fetchPages(root:string,path:string):Promise<any[]> {
  const pages:any[]=[];
  for(let offset=0;pages.length<MAX_PAGES;offset+=PAGE_SIZE){
    const response=await fetch(`${root}/${path}/?limit=${PAGE_SIZE}&offset=${offset}`);
    if(!response.ok) throw new Error(`Jolpica returned ${response.status}`);
    const payload=await response.json();
    const data=payload.MRData;
    if(!data) break;
    pages.push(data);
    if(offset+PAGE_SIZE>=Number(data.total ?? 0)) break;
  }
  return pages;
}

function mergeRaces(pages:any[],key?:'Results'|'SprintResults') {
  const byRound=new Map<string,any>();
  pages.forEach(page=>(page?.RaceTable?.Races ?? []).forEach((race:any)=>{
    const existing=byRound.get(race.round);
    if(!existing){byRound.set(race.round,key?{...race,[key]:[...(race[key] ?? [])]}:race);return}
    if(key) existing[key]=[...(existing[key] ?? []),...(race[key] ?? [])];
  }));
  return [...byRound.values()].sort((a,b)=>Number(a.round)-Number(b.round));
}

async function loadSeason(season:number): Promise<{rounds:Round[];drivers:Driver[];completed:number;updated:string}> {
  const root=`https://api.jolpi.ca/ergast/f1/${season}`;
  const get=(path:string)=>fetchPages(root,path);
  const [schedulePages,resultPages,sprintPages,standingsPages]=await Promise.all([get('races'),get('results'),get('sprint'),get('driverstandings')]);
  const schedules=mergeRaces(schedulePages);
  const races=mergeRaces(resultPages,'Results');
  const sprints=mergeRaces(sprintPages,'SprintResults');
  if(!schedules.length) throw new Error(`No ${season} season data is available yet.`);
  const roundList:Round[]=schedules.map((race:any)=>[
    roundCode(race), race.raceName,
    race.Circuit?.circuitName ?? 'Circuit unavailable',
    new Date(`${race.date}T${race.time ?? '00:00:00Z'}`).toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
  ]);
  const driverMap=new Map<string,Driver>();
  races.forEach((race:any)=>race.Results?.forEach((result:any)=>{
    const id=result.Driver.driverId; const constructor=result.Constructor;
    if(!driverMap.has(id)) driverMap.set(id,{id,code:result.Driver.code || result.Driver.familyName.slice(0,3).toUpperCase(),name:`${result.Driver.givenName} ${result.Driver.familyName}`,team:constructor.name,color:teamColors[constructor.constructorId] ?? '#8d94a3',points:Array(roundList.length).fill(0),finishes:Array(roundList.length).fill('—')});
    const driver=driverMap.get(id)!; const index=Number(race.round)-1;
    driver.points[index]=Number(result.points)||0; driver.finishes[index]=result.positionText?.startsWith('R') ? result.status : `P${result.position}`;
  }));
  sprints.forEach((race:any)=>race.SprintResults?.forEach((result:any)=>{
    const driver=driverMap.get(result.Driver.driverId); if(driver) driver.points[Number(race.round)-1]+=(Number(result.points)||0);
  }));
  const standings=standingsPages.flatMap(page=>page?.StandingsTable?.StandingsLists?.at(-1)?.DriverStandings ?? []);
  standings.forEach((standing:any)=>{const driver=driverMap.get(standing.Driver.driverId);if(driver)driver.currentPoints=Number(standing.points)});
  return {rounds:roundList,drivers:[...driverMap.values()],completed:races.length,updated:new Date().toISOString()};
}

export default function Gridline() {
  const initial = new URLSearchParams(location.search);
  const currentYear=new Date().getUTCFullYear();
  const [season,setSeason]=useState(()=>Number(initial.get('season')) || currentYear);
  const [seasonData,setSeasonData]=useState<{rounds:Round[];drivers:Driver[];completed:number;updated:string}|null>(null);
  const [loadState,setLoadState]=useState<'loading'|'ready'|'error'>('loading');
  const [loadError,setLoadError]=useState('');
  const [view,setView] = useState<View>(initial.get('view') === 'constructors' ? 'constructors' : 'drivers');
  const [metric,setMetric] = useState<Metric>(initial.get('metric') === 'position' ? 'position' : 'points');
  const [focus,setFocus] = useState<string|null>(initial.get('focus'));
  const [activeRound,setActiveRound] = useState<number|null>(() => Number(initial.get('round')) || null);
  const [hoverRound,setHoverRound] = useState<number|null>(null);
  const [expanded,setExpanded] = useState<string|null>(null);
  const rounds=seasonData?.rounds ?? [];
  const drivers=seasonData?.drivers ?? [];
  const completedRounds=seasonData?.completed ?? 0;

  useEffect(()=>{let active=true;setLoadState('loading');loadSeason(season).then(data=>{if(active){setSeasonData(data);setLoadState('ready')}}).catch(error=>{if(active){setSeasonData(null);setLoadError(error instanceof Error?error.message:'Season data could not be loaded.');setLoadState('error')}});return()=>{active=false}},[season]);

  const entities = useMemo<Entity[]>(() => {
    if (view === 'drivers') return drivers.map(d => ({...d, total:d.currentPoints ?? d.points.slice(0,completedRounds).reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total);
    return [...new Set(drivers.map(driver=>driver.team))].map(team => {
      const members=drivers.filter(d=>d.team===team); const color=members[0]?.color ?? '#999';
      const points=rounds.map((_,i)=>members.reduce((s,d)=>s+d.points[i],0));
      return { id:team.toLowerCase().replaceAll(' ','-'), code:team.slice(0,3).toUpperCase(), name:team, team, color, points, finishes:points.map(()=>''), total:points.slice(0,completedRounds).reduce((a,b)=>a+b,0), members };
    }).sort((a,b)=>b.total-a.total);
  },[view,drivers,rounds,completedRounds]);
  const maxPoints=Math.max(...entities.flatMap(e=>e.points));
  const positions=rounds.map((_,ri)=>[...entities].sort((a,b)=>cumulative(b.points)[ri]-cumulative(a.points)[ri]).map(e=>e.id));
  const selectedRound=activeRound ? rounds[activeRound-1] : null;
  const roundLeader=activeRound ? drivers.slice().sort((a,b)=>b.points[activeRound-1]-a.points[activeRound-1])[0] : null;
  const roundTeamLeader=activeRound ? [...new Set(drivers.map(driver=>driver.team))].map(team=>({team,points:drivers.filter(driver=>driver.team===team).reduce((sum,driver)=>sum+driver.points[activeRound-1],0)})).sort((a,b)=>b.points-a.points)[0] : null;
  const pulse=entities.slice(0,5);
  const leader=entities[0]?.total ?? 0;

  useEffect(() => {
    const q=new URLSearchParams(); q.set('season',String(season)); q.set('view',view); q.set('metric',metric); if(focus) q.set('focus',focus); if(activeRound) q.set('round',String(activeRound));
    history.replaceState(null,'',`${location.pathname}?${q}`);
  },[season,view,metric,focus,activeRound]);
  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){ if(activeRound)setActiveRound(null); else setFocus(null); }}; addEventListener('keydown',onKey); return()=>removeEventListener('keydown',onKey); },[activeRound]);

  return <div className="gridline-page">
    <header className="gridline-topbar">
      <div className="gridline-brand"><span className="gridline-mark"><i/><i/><i/></span><strong>GRIDLINE</strong><span>Championship heatmap</span></div>
      <div className="gridline-season"><label htmlFor="gridline-season">Season</label><span className="season-select-wrap"><select id="gridline-season" value={season} onChange={event=>{setSeason(Number(event.target.value));setFocus(null);setActiveRound(null)}}>{[currentYear,currentYear-1,currentYear-2].map(year=><option key={year} value={year}>{year}</option>)}</select><ChevronDown size={14}/></span></div>
      <div className={`gridline-updated ${loadState}`}><span/> {loadState==='loading'?'UPDATING LIVE DATA':loadState==='error'?'LIVE DATA UNAVAILABLE':'LIVE DATA'} <b>{seasonData?new Date(seasonData.updated).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''}</b></div>
    </header>
    <div className="gridline-body">
      {loadState==='loading'&&<div className="gridline-loading" role="status"><span/><b>Loading the {season} championship</b><small>Fetching the latest classified race and sprint results from Jolpica…</small></div>}
      <section className="gridline-hero">
        <div><p className="gridline-eyebrow">FORMULA 1 <b>•</b> {season} SEASON</p><h1>Championship at a glance</h1><p>Round {completedRounds} of {rounds.length} complete <span>•</span> {completedRounds ? rounds[completedRounds-1]?.[1] : 'Season not started'}</p></div>
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
        <div className="panel-heading"><div><p>CHAMPIONSHIP PULSE</p><h2>Weekend points intensity</h2></div><span><Info size={14}/> Box size shows points scored</span></div>
        <div className="pulse-heatmap" style={{gridTemplateColumns:`150px repeat(${rounds.length}, minmax(44px, 1fr))`}}>
          <div className="pulse-corner">TOP {Math.min(5,pulse.length)}</div>
          {rounds.map((round,index)=><button key={index} className={hoverRound===index+1||activeRound===index+1?'active':''} onClick={()=>setActiveRound(index+1)}><small>R{index+1}</small><b>{round[0]}</b></button>)}
          {pulse.map(entity=><div className={`pulse-entity-row ${focus&&focus!==entity.id?'dimmed':''}`} key={entity.id} style={{display:'contents'}}>
            <button className="pulse-entity" onClick={()=>setFocus(entity.id)}><i style={{background:entity.color}}/><b>{entity.code}</b><span>{entity.name}</span></button>
            {entity.points.map((points,index)=>{const future=index>=completedRounds;const size=future?0:12+Math.round((points/Math.max(maxPoints,1))*28);return <button key={index} className={`pulse-box ${future?'future':''}`} onMouseEnter={()=>setHoverRound(index+1)} onMouseLeave={()=>setHoverRound(null)} onFocus={()=>setHoverRound(index+1)} onBlur={()=>setHoverRound(null)} onClick={()=>{setFocus(entity.id);setActiveRound(index+1)}} aria-label={`${entity.name}, ${rounds[index][1]}, ${points} points`}><i style={!future?{width:size,height:size,background:heat[Math.min(5,Math.ceil(points/Math.max(maxPoints,1)*5))]}:{}}>{future?'':points}</i></button>})}
          </div>)}
        </div>
      </section>

      <section className="gridline-panel heatmap-panel">
        <div className="heatmap-toolbar"><div><p>SEASON HEATMAP</p><h2>{view==='drivers'?'Drivers':'Constructors'}</h2><span>Each cell shows {metric==='points'?'championship points earned that weekend':'championship position after the round'}.</span></div><div className="heat-legend"><span>LOW</span>{heat.map(c=><i key={c} style={{background:c}}/>)}<span>HIGH</span>{focus&&<button onClick={()=>setFocus(null)}><X size={13}/> Clear focus</button>}</div></div>
        <div className="heatmap-scroll">
          <div className="heatmap-grid" style={{gridTemplateColumns:`230px repeat(${rounds.length}, 58px) 78px`}}>
            <div className="heat-corner">CHAMPIONSHIP ORDER</div>
            {rounds.map((r,i)=><button key={i} className={`round-head ${(hoverRound===i+1||activeRound===i+1)?'active':''}`} onMouseEnter={()=>setHoverRound(i+1)} onMouseLeave={()=>setHoverRound(null)} onClick={()=>setActiveRound(i+1)}><small>R{i+1}</small><b>{r[0]}</b></button>)}
            <div className="total-head">TOTAL</div>
            {entities.map((e,ei)=><div className={`heat-row-wrap ${focus&&focus!==e.id?'dimmed':''}`} key={e.id} style={{display:'contents'}}>
              <button className="entity-head" onClick={()=>{setFocus(focus===e.id?null:e.id); if(view==='constructors')setExpanded(expanded===e.id?null:e.id)}}><span className="rank">{String(ei+1).padStart(2,'0')}</span><i style={{background:e.color}}/><span><b>{e.code}</b><small>{e.name}</small></span>{view==='constructors'&&<ChevronDown size={14}/>}</button>
              {e.points.map((pts,ri)=>{const position=positions[ri].indexOf(e.id)+1;const future=ri>=completedRounds; const level=Math.min(5,Math.ceil(pts/Math.max(maxPoints,1)*5)); const status=view==='drivers'?e.finishes[ri]:''; return <button key={ri} onFocus={()=>setHoverRound(ri+1)} onBlur={()=>setHoverRound(null)} onMouseEnter={()=>setHoverRound(ri+1)} onMouseLeave={()=>setHoverRound(null)} onClick={()=>{setFocus(e.id);setActiveRound(ri+1)}} className={`heat-cell ${future?'future':''} ${(hoverRound===ri+1||activeRound===ri+1)?'column-active':''} ${status==='Retired'?'retired':''}`} style={!future?{background:pts===0?'#1a1c22':heat[level]}:{}} aria-label={`${e.name}, ${rounds[ri][1]}, ${pts} points, championship position ${position}`} title={`${e.name} · ${rounds[ri][1]}\n${status||'Weekend'} · ${pts} pts\nChampionship P${position}`}>{future?'':metric==='points'?pts:`P${position}`}{status==='Retired'&&<em>DNF</em>}</button>})}
              <div className="entity-total"><b>{e.total}</b><small>PTS</small></div>
              {view==='constructors'&&expanded===e.id&&<div className="constructor-detail" style={{gridColumn:`1 / span ${rounds.length+2}`}}>{(e.members ?? []).map(d=><span key={d.id}><i style={{background:d.color}}/><b>{d.code}</b> {d.name}<strong>{d.points.reduce((a,b)=>a+b,0)} pts</strong></span>)}</div>}
            </div>)}
          </div>
        </div>
        <div className="heatmap-note"><CircleHelp size={14}/> Future rounds use an empty outline. Zero-point finishes remain dark and show a numeric 0.</div>
      </section>
      <footer className="gridline-footer"><span><b>GRIDLINE</b> Fan-made championship visualization</span><span>Data provided by Jolpica • Not affiliated with Formula 1</span></footer>
    </div>
    {loadState==='error'&&<div className="gridline-data-error"><b>Live championship data could not load.</b><span>{loadError}</span><button onClick={()=>location.reload()}>Retry</button></div>}
    {selectedRound&&<><button className="drawer-scrim" aria-label="Close race details" onClick={()=>setActiveRound(null)}/><aside className="race-drawer" aria-label="Race detail drawer"><div className="drawer-top"><span>ROUND {activeRound} OF {rounds.length}</span><button onClick={()=>setActiveRound(null)} aria-label="Close"><X/></button></div><div className="drawer-flag"><Flag size={22}/></div><h2>{selectedRound[1]}</h2><p className="drawer-track">{selectedRound[2]}</p><p className="drawer-date"><CalendarDays size={15}/> {selectedRound[3]} {season}</p><div className="drawer-callouts"><div><small>RACE WINNER</small><b>{activeRound!<=completedRounds?roundLeader?.name:'Awaiting result'}</b></div><div><small>MOST WEEKEND POINTS</small><b>{activeRound!<=completedRounds?roundTeamLeader?.team:'Awaiting result'}</b></div></div><h3>{activeRound!<=completedRounds?'Weekend classification':'Scheduled round'}</h3><div className="drawer-results">{activeRound!<=completedRounds&&drivers.slice().sort((a,b)=>b.points[activeRound!-1]-a.points[activeRound!-1]).map((d,i)=><div key={d.id}><span>{String(i+1).padStart(2,'0')}</span><i style={{background:d.color}}/><b>{d.code}</b><small>{d.finishes[activeRound!-1]}</small><strong>{d.points[activeRound!-1]} <em>PTS</em></strong></div>)}</div><button className="drawer-next" onClick={()=>setActiveRound(Math.min(rounds.length,(activeRound||1)+1))}>Next round <ArrowRight size={16}/></button></aside></>}
  </div>;
}
