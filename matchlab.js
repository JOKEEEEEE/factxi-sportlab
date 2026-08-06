const params = new URLSearchParams(location.search);
const fixtureId = params.get("id") || "19134564";

const STAT_GROUP_LABELS = {offensive:"Attaque", defensive:"Discipline et défense", overall:"Ensemble"};
const colors = ["#d9705c","#d6a443","#76a9c0"], seriesKeys = ["ars","draw","mci"];

const STAT_NAME_FR = {
  "ball-possession":"Possession","shots-total":"Tirs","shots-on-target":"Tirs cadrés","shots-off-target":"Tirs non cadrés",
  "shots-insidebox":"Tirs dans la surface","shots-outsidebox":"Tirs hors surface","shots-blocked":"Tirs contrés",
  "corners":"Corners","fouls":"Fautes","offsides":"Hors-jeu","yellowcards":"Cartons jaunes","redcards":"Cartons rouges",
  "passes":"Passes","successful-passes":"Passes réussies","successful-passes-percentage":"Passes réussies (%)",
  "long-passes":"Passes longues","successful-long-passes":"Passes longues réussies","successful-long-passes-percentage":"Passes longues réussies (%)",
  "saves":"Arrêts","goal-kicks":"Dégagements du gardien","free-kicks":"Coups francs","throwins":"Touches",
  "duels-won":"Duels gagnés","dribble-attempts":"Tentatives de dribble","successful-dribbles":"Dribbles réussis","successful-dribbles-percentage":"Dribbles réussis (%)",
  "tackles":"Tacles","interceptions":"Interceptions","assists":"Passes décisives","key-passes":"Passes clés",
  "big-chances-created":"Grosses occasions créées","big-chances-missed":"Grosses occasions manquées",
  "hit-woodwork":"Poteaux touchés","successful-headers":"Duels aériens gagnés","attacks":"Attaques","dangerous-attacks":"Attaques dangereuses",
  "ball-safe":"Ballons sécurisés","total-crosses":"Centres tentés","accurate-crosses":"Centres réussis","goal-attempts":"Tentatives de but",
  "counter-attacks":"Contre-attaques","substitutions":"Remplacements","goals":"Buts"
};
const EVENT_NAME_FR = {
  "goal":"But","owngoal":"But contre son camp","substitution":"Remplacement","yellowcard":"Carton jaune","redcard":"Carton rouge","var":"VAR"
};
function statLabel(t){return STAT_NAME_FR[t.code] || t.name}
function eventLabel(type){return (type && (EVENT_NAME_FR[type.code] || type.name)) || ""}

let RAW=null, HOME_ID=null, AWAY_ID=null, HOME_NAME="", AWAY_NAME="";
let names=["DOM","NUL","EXT"], events=[], points=[], selected=0, series="all";

async function load(){
  try{
    const res = await fetch(`data/match-detail-${fixtureId}.json`, {cache:"no-store"});
    if(!res.ok) throw new Error("introuvable");
    const payload = await res.json();
    RAW = payload.raw;
    if(!RAW || !RAW.participants) throw new Error("format inattendu");
  }catch(err){
    document.querySelector("#loadingState").hidden=true;
    document.querySelector("#errorState").hidden=false;
    return;
  }
  init();
}

function initials(name){return (name||"").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
function currentScore(participantId){
  const entry=(RAW.scores||[]).find(s=>s.participant_id===participantId && s.description==="CURRENT");
  return entry ? entry.score.goals : null;
}
function fmtMinute(e){return e.extra_minute?`90+${e.extra_minute}’`:`${e.minute}’`}
function flagImg(player){
  if(player && player.country && player.country.image_path) return `<img class="flag" src="${player.country.image_path}" alt="" width="14" height="10">`;
  return "";
}

function init(){
  const home = RAW.participants.find(p=>p.meta.location==="home");
  const away = RAW.participants.find(p=>p.meta.location==="away");
  HOME_ID=home.id; AWAY_ID=away.id; HOME_NAME=home.name; AWAY_NAME=away.name;
  names=[home.short_code||initials(home.name), "NUL", away.short_code||initials(away.name)];

  renderScoreCard(home,away);
  buildProbabilityModel();
  renderStats();
  renderChart();
  select(events.length?0:-1);
  renderSquads();
  renderStudio();

  document.querySelector("#loadingState").hidden=true;
  document.querySelector("#matchContent").hidden=false;
}

function renderScoreCard(home,away){
  const hs=currentScore(home.id), as=currentScore(away.id);
  document.querySelector("#matchScore").innerHTML=`<div class="team"><i class="badge" style="background:#20304a">${initials(home.name)}</i><strong>${home.name}</strong></div><div class="score"><strong>${hs!=null?hs:"—"}–${as!=null?as:"—"}</strong><span>${(RAW.state&&RAW.state.name)||""}</span></div><div class="team away"><strong>${away.name}</strong><i class="badge" style="background:#20304a">${initials(away.name)}</i></div>`;
  let dateTxt="", timeTxt="";
  if(RAW.starting_at){
    const kickoff=new Date(RAW.starting_at.replace(" ","T")+"Z");
    dateTxt=kickoff.toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
    timeTxt=kickoff.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  }
  document.querySelector("#matchMeta").innerHTML=`${dateTxt?`<span>${dateTxt} · ${timeTxt}</span>`:""}${RAW.venue?`<span>${RAW.venue.name}</span>`:""}${RAW.round?`<span>Journée ${RAW.round.name}</span>`:""}<span>Données SportMonks</span>`;
  document.querySelector("#navRight").innerHTML=`<b>${home.name} vs ${away.name}</b>`;
  document.querySelector("#crumb").textContent = RAW.round ? `Journée ${RAW.round.name}` : "";
  document.title=`SportLab — ${home.name} vs ${away.name}`;
  document.querySelector("#legHome").textContent=names[0];
  document.querySelector("#legAway").textContent=names[2];
}

function buildProbabilityModel(){
  const major=(RAW.events||[]).filter(e=>e.type && ["goal","owngoal","redcard"].includes(e.type.code))
    .sort((a,b)=>(a.minute+((a.extra_minute||0)/10))-(b.minute+((b.extra_minute||0)/10)));
  events=major;
  let diff=0, red=0;
  points=[{t:0,diff:0,red:0}];
  major.forEach(e=>{
    const t=e.minute+((e.extra_minute||0)/10);
    if(e.type.code==="goal") diff += e.participant_id===HOME_ID?1:-1;
    if(e.type.code==="owngoal") diff += e.participant_id===HOME_ID?-1:1;
    if(e.type.code==="redcard") red += e.participant_id===HOME_ID?-1:1;
    points.push({t,diff,red});
  });
  const lastT = major.length ? Math.max(95,points[points.length-1].t+1) : 95;
  points.push({t:lastT,diff,red});
}
function probsAtState(diff,red,minute){
  const strength=(diff+red*0.4)*(1+(minute/95)*1.3);
  const eh=Math.exp(strength), ea=Math.exp(-strength), ed=Math.exp(0.25-Math.abs(strength)*0.35);
  const tot=eh+ea+ed;
  return [eh/tot, ed/tot, ea/tot];
}
function probsAt(t){
  let cur=points[0];
  for(const p of points) if(p.t<=t) cur=p;
  return probsAtState(cur.diff,cur.red,t);
}

const x=t=>48+t/95*830, y=p=>24+(1-p)*270;
function curvePoints(){
  return points.map(p=>({t:p.t, p:probsAtState(p.diff,p.red,p.t)}));
}
function path(idx){
  const pts=curvePoints().map(d=>[x(d.t),y(d.p[idx])]);
  let d=`M${pts[0][0]},${pts[0][1]}`;
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],mx=(a[0]+b[0])/2;d+=` C${mx},${a[1]} ${mx},${b[1]} ${b[0]},${b[1]}`}
  return d;
}
function icon(code){return code==="goal"||code==="owngoal"?"⚽":code==="redcard"?'<span class="red-card-icon"></span>':code==="substitution"?'<span class="sub-icon"><i>↗</i><b>↙</b></span>':`<span class="var-badge">${(code||"?").slice(0,3).toUpperCase()}</span>`}

function renderChart(){
  let svg="";
  [0,.25,.5,.75,1].forEach(v=>svg+=`<line class="grid" x1="48" y1="${y(v)}" x2="878" y2="${y(v)}"/><text x="5" y="${y(v)+3}">${v*100}%</text>`);
  [0,15,30,45,60,75,90].forEach(v=>svg+=`<text x="${x(v)}" y="320" text-anchor="middle">${v}’</text>`);
  colors.forEach((c,i)=>svg+=`<path class="curve ${series===seriesKeys[i]?"focus":""}" stroke="${c}" d="${path(i)}"/>`);
  document.querySelector("#chart").innerHTML=svg;
  document.querySelector("#chart").classList.toggle("dim",series!=="all");
  document.querySelector("#chartEvents").innerHTML=events.map((e,i)=>{
    const t=e.minute+((e.extra_minute||0)/10);
    return `<button class="chart-event ${i===selected?"active":""}" data-i="${i}" style="--x:${5.3+t/95*92.2}%;--y:${12+(i%3)*10}%" title="${fmtMinute(e)} · ${e.player_name||""}">${icon(e.type.code)}</button>`;
  }).join("");
  document.querySelectorAll(".chart-event").forEach(b=>b.onclick=()=>select(+b.dataset.i));
}

function boxes(p,old){return `<div class="probs">${p.map((v,i)=>`<div class="prob"><b>${Math.round(v*100)} %</b><span>${names[i]}</span>${old?`<em>${Math.round((v-old[i])*100)>0?"+":""}${Math.round((v-old[i])*100)} pts</em>`:""}</div>`).join("")}</div>`}
function scoreAtOrBefore(t,inclusive){
  const goals=events.filter(e=>e.result);
  let sc="0–0";
  for(const g of goals){
    const gt=g.minute+((g.extra_minute||0)/10);
    if(inclusive ? gt<=t : gt<t) sc=g.result.replace("-","–");
  }
  return sc;
}
function renderCompare(){
  if(selected<0 || !events.length){
    document.querySelector("#before").innerHTML="";
    document.querySelector("#after").innerHTML="";
    return;
  }
  const e=events[selected];
  const t=e.minute+((e.extra_minute||0)/10);
  const beforeScore=scoreAtOrBefore(t,false);
  const afterScore=e.result?e.result.replace("-","–"):beforeScore;
  const bp=probsAt(Math.max(0,t-0.15)), ap=probsAt(t);
  document.querySelector("#before").innerHTML=`<small>Juste avant · ${fmtMinute(e)}</small><h3>État avant l’événement</h3><div class="state-score">${beforeScore}</div>${boxes(bp)}`;
  document.querySelector("#after").innerHTML=`<small>Juste après · ${fmtMinute(e)}</small><h3>${icon(e.type.code)} ${e.player_name||eventLabel(e.type)}</h3><div class="state-score">${afterScore}</div>${boxes(ap,bp)}`;
}

function renderFeed(){
  const all=(RAW.events||[]).slice().sort((a,b)=>(a.minute+((a.extra_minute||0)/10))-(b.minute+((b.extra_minute||0)/10)));
  const first=all.filter(e=>!e.period || e.period.description!=="2nd-half");
  const second=all.filter(e=>e.period && e.period.description==="2nd-half");
  const row=e=>{
    const majorIndex=events.indexOf(e);
    const detail = e.type.code==="substitution" ? `${e.player_name||""}${e.related_player_name?` ↔ ${e.related_player_name}`:""}` : (e.info||e.addition||"");
    return `<button class="feed-event ${majorIndex===selected?"active":""}" data-major="${majorIndex}"><time>${fmtMinute(e)}</time><span class="symbol">${icon(e.type.code)}</span><b>${e.player_name||eventLabel(e.type)}<small> · ${detail}</small></b>${e.result?`<strong>${e.result.replace("-","–")}</strong>`:""}</button>`;
  };
  document.querySelector("#feed").innerHTML=
    `<div class="period"><span>1re mi-temps</span></div>${first.map(row).join("")}<div class="period"><span>2e mi-temps</span></div>${second.map(row).join("")}`;
  document.querySelectorAll(".feed-event").forEach(b=>{if(+b.dataset.major>-1) b.onclick=()=>select(+b.dataset.major)});
}

function select(i){selected=i;renderChart();renderCompare();renderFeed()}

function renderStats(){
  const byType={};
  (RAW.statistics||[]).forEach(s=>{
    const key=s.type.id;
    if(!byType[key]) byType[key]={name:s.type.name, code:s.type.code, group:s.type.stat_group||"overall", home:null, away:null};
    if(s.location==="home") byType[key].home=s.data.value; else byType[key].away=s.data.value;
  });
  const xg=(RAW.xgfixture||[]).filter(x=>x.type_id===5304);
  if(xg.length){
    const h=xg.find(x=>x.location==="home"), a=xg.find(x=>x.location==="away");
    byType["xg"]={name:"xG", code:"xg", group:"offensive", home:h?Number(h.data.value).toFixed(2):null, away:a?Number(a.data.value).toFixed(2):null};
  }
  const groups={};
  Object.values(byType).forEach(t=>{
    const g=STAT_GROUP_LABELS[t.group]||"Autres";
    (groups[g]=groups[g]||[]).push(t);
  });
  document.querySelector("#teamLabels").innerHTML=`<b class="ars-label">${HOME_NAME}</b><b class="mci-label">${AWAY_NAME}</b>`;
  const root=document.querySelector("#statBody");
  const order=["Attaque","Ensemble","Discipline et défense","Autres"];
  const keys=Object.keys(groups).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  root.innerHTML = keys.length
    ? keys.map(g=>`<div class="stat-group"><h4>${g}</h4>${groups[g].map(statRow).join("")}</div>`).join("")
    : `<div class="stats-empty"><strong>En attente de l’API</strong><span>Aucune statistique disponible pour ce match.</span></div>`;
}
function statRow(t){
  if(t.home==null || t.away==null) return `<div class="stat-row pending-row"><span>${statLabel(t)}</span><em>Non disponible</em></div>`;
  const isPct = t.code && t.code.includes("percentage");
  if(isPct){
    const a=Number(t.home);
    return `<div class="stat-row"><div class="stat-label"><span>${t.home}%</span><b>${statLabel(t)}</b><span>${t.away}%</span></div><div class="stat-bar"><i class="home" style="width:${a}%"></i><i class="away" style="width:${100-a}%"></i></div></div>`;
  }
  const a=Number(t.home), b=Number(t.away), total=(a+b)||1, pa=Math.round(a/total*100);
  return `<div class="stat-row"><div class="stat-label"><span>${t.home}</span><b>${statLabel(t)}</b><span>${t.away}</span></div><div class="stat-bar"><i class="home" style="width:${pa}%"></i><i class="away" style="width:${100-pa}%"></i></div></div>`;
}

function isCaptain(l){return (l.details||[]).some(d=>d.type_id===40 && d.data && d.data.value===true)}
function ratingBadge(l){
  const rating=(l.details||[]).find(d=>d.type_id===118);
  if(!rating) return "";
  const v=Number(rating.data.value).toFixed(1);
  const cls = v>=7.5?"great":v>=6.5?"good":v>=5.5?"mid":"low";
  return `<em class="rating ${cls}">${v}</em>`;
}
function avatarImg(l){
  const photo=l.player && l.player.image_path;
  const initialsTxt=initials(l.player_name);
  return photo?`<img class="p-avatar" src="${photo}" alt="${l.player_name}" loading="lazy" onerror="this.outerHTML='&lt;i class=&quot;p-avatar&quot;&gt;${initialsTxt}&lt;/i&gt;'">`:`<i class="p-avatar">${initialsTxt}</i>`;
}
function renderSquads(){
  const lineups=RAW.lineups||[];
  const teams=[{id:HOME_ID,name:HOME_NAME,cls:"ars-pitch"},{id:AWAY_ID,name:AWAY_NAME,cls:"city-pitch"}];
  document.querySelector("#squads").innerHTML=teams.map(team=>{
    const teamLineups=lineups.filter(l=>l.team_id===team.id);
    const starters=teamLineups.filter(l=>l.type_id===11 && l.formation_field);
    const subsUsed=teamLineups.filter(l=>l.type_id===12 && (l.details||[]).length>0);
    const subsUnused=teamLineups.filter(l=>l.type_id===12 && (l.details||[]).length===0);
    const coach=(RAW.coaches||[]).find(c=>c.meta && c.meta.participant_id===team.id);
    const rowsByRow={};
    starters.forEach(s=>{const [r,c]=s.formation_field.split(":").map(Number);(rowsByRow[r]=rowsByRow[r]||[]).push(c)});
    const maxRow=Math.max(...Object.keys(rowsByRow).map(Number),1);
    const pitchIcons=starters.map(s=>{
      const [r,c]=s.formation_field.split(":").map(Number);
      const colsInRow=rowsByRow[r].length;
      const xPct=colsInRow===1?50:((c-0.5)/colsInRow*100);
      const yPct=maxRow<=1?90:(90-(r-1)/(maxRow-1)*77);
      return `<i style="--x:${xPct}%;--y:${yPct}%">${s.jersey_number||""}<small>${s.player_name}${isCaptain(s)?" (C)":""}</small></i>`;
    }).join("");
    const listRow=s=>`<div class="squad-row">${avatarImg(s)}<em>${s.jersey_number||"—"}</em><span>${flagImg(s.player)}${s.player_name}${isCaptain(s)?'<b class="captain-tag">C</b>':""}</span>${ratingBadge(s)}</div>`;
    const subInRow=s=>{const mins=(s.details||[]).find(d=>d.type_id===119);return `<div class="squad-row sub-in">${avatarImg(s)}<em>↗</em><span>${flagImg(s.player)}${s.player_name}<small>entré${mins?` ${mins.data.value}’`:""}</small></span>${ratingBadge(s)}</div>`};
    const subOutRow=s=>`<div class="squad-row sub-unused">${avatarImg(s)}<em>—</em><span>${flagImg(s.player)}${s.player_name}</span></div>`;
    return `<article><div class="squad-title"><b>${team.name}</b></div>
      <div class="pitch ${team.cls}">${pitchIcons}</div>
      <div class="squad-zone"><h4>Titulaires</h4><div class="squad-list">${starters.map(listRow).join("")}</div></div>
      <div class="squad-zone subs"><h4>Remplaçants</h4><div class="squad-list">${subsUsed.map(subInRow).join("")}${subsUnused.map(subOutRow).join("")}</div></div>
      <div class="squad-zone coach"><h4>Entraîneur</h4><div class="squad-list"><div class="squad-row">${flagImg(coach)}<span>${coach?(coach.display_name||coach.name):"Non communiqué"}</span></div></div></div>
    </article>`;
  }).join("");
}

async function copyText(text,button){try{await navigator.clipboard.writeText(text);let old=button.textContent;button.textContent="Copié ✓";setTimeout(()=>button.textContent=old,1500)}catch{button.textContent="Sélectionnez le texte"}}

function renderStudio(){
  const hs=currentScore(HOME_ID), as=currentScore(AWAY_ID);
  const winner = hs>as?HOME_NAME:as>hs?AWAY_NAME:null;
  const xg=(RAW.xgfixture||[]).filter(x=>x.type_id===5304);
  const hxg=xg.find(x=>x.location==="home"), axg=xg.find(x=>x.location==="away");
  const possession=(RAW.statistics||[]).find(s=>s.type.code==="ball-possession" && s.location==="home");
  const shotsHome=(RAW.statistics||[]).find(s=>s.type.code==="shots-total" && s.location==="home");
  const shotsAway=(RAW.statistics||[]).find(s=>s.type.code==="shots-total" && s.location==="away");

  document.querySelector("#storyAngle").innerHTML=`<div><span>L’ANGLE FACT XI</span><h3>${HOME_NAME} ${hs}–${as} ${AWAY_NAME}${winner?` : victoire ${winner}.`:" : match nul."}</h3></div><dl>${possession?`<div><dt>Possession</dt><dd>${possession.data.value} % – ${100-possession.data.value} %</dd></div>`:""}${hxg&&axg?`<div><dt>xG</dt><dd>${Number(hxg.data.value).toFixed(2)}–${Number(axg.data.value).toFixed(2)}</dd></div>`:""}</dl>`;

  const xpostLines=[`${HOME_NAME} ${hs}–${as} ${AWAY_NAME}.`,""];
  if(shotsHome && shotsAway) xpostLines.push(`${shotsHome.data.value} tirs contre ${shotsAway.data.value}.`);
  if(hxg && axg) xpostLines.push(`xG : ${Number(hxg.data.value).toFixed(2)}–${Number(axg.data.value).toFixed(2)}.`);
  xpostLines.push("","Source : SportMonks");
  document.querySelector("#xpost-copy").textContent=xpostLines.join("\n");

  const goals=events.filter(e=>e.type.code==="goal"||e.type.code==="owngoal");
  document.querySelector("#phases").innerHTML = goals.length
    ? goals.map((g,i)=>`<article><span>BUT ${i+1} · ${fmtMinute(g)}</span><b>${g.player_name||eventLabel(g.type)}</b><p>${g.info||""}${g.related_player_name?` (passe de ${g.related_player_name})`:""}</p><footer><strong>${g.result?g.result.replace("-","–"):""}</strong></footer></article>`).join("")
    : `<p style="font-size:9px;color:var(--muted)">Aucun but marqué dans ce match.</p>`;
  document.querySelector("#thread-copy").innerHTML = goals.map((g,i)=>`<p><b>${i+1}/${goals.length}</b> ${g.player_name||eventLabel(g.type)} marque à la ${fmtMinute(g)}${g.related_player_name?` (passe de ${g.related_player_name})`:""}. Score : ${g.result?g.result.replace("-","–"):""}.</p>`).join("");

  document.querySelector("#copySource").onclick=()=>copyText(`${HOME_NAME} ${hs}–${as} ${AWAY_NAME} · Source : SportMonks (fixture ${fixtureId})`,document.querySelector("#copySource"));
}

function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function wrap(ctx,text,x,y,max,line){const words=(text||"").split(" ");let row="",cy=y;for(const word of words){const test=row+word+" ";if(ctx.measureText(test).width>max&&row){ctx.fillText(row.trim(),x,cy);row=word+" ";cy+=line}else row=test}ctx.fillText(row.trim(),x,cy)}
function loadImage(src,crossOrigin=false){return new Promise(resolve=>{const img=new Image();if(crossOrigin)img.crossOrigin="anonymous";img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src})}

function buildCarouselSlides(){
  const hs=currentScore(HOME_ID), as=currentScore(AWAY_ID);
  let dateTxt="";
  if(RAW.starting_at) dateTxt=new Date(RAW.starting_at.replace(" ","T")+"Z").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
  const possession=(RAW.statistics||[]).find(s=>s.type.code==="ball-possession" && s.location==="home");
  const xg=(RAW.xgfixture||[]).filter(x=>x.type_id===5304);
  const hxg=xg.find(x=>x.location==="home"), axg=xg.find(x=>x.location==="away");
  const shotsHome=(RAW.statistics||[]).find(s=>s.type.code==="shots-total" && s.location==="home");
  const shotsAway=(RAW.statistics||[]).find(s=>s.type.code==="shots-total" && s.location==="away");
  const firstGoal=events.find(e=>e.type.code==="goal");
  return [
    {k:(RAW.round?`J${RAW.round.name}`:"MATCH"),title:`${HOME_NAME}\n${hs}–${as} ${AWAY_NAME}`,body:`${dateTxt}${RAW.venue?" · "+RAW.venue.name:""}`,cover:true},
    {k:"LA POSSESSION",title:possession?`${possession.data.value} %`:"—",body:`Possession de ${HOME_NAME}.`},
    {k:"LE PREMIER BUT",title:firstGoal?fmtMinute(firstGoal):"—",body:firstGoal?`${firstGoal.player_name} ouvre le score.`:"Aucun but marqué."},
    {k:"LE SCORE FINAL",title:`${hs}–${as}`,body:`${HOME_NAME} — ${AWAY_NAME}.`,accent:true},
    {k:"LES TIRS",title:shotsHome&&shotsAway?`${shotsHome.data.value}–${shotsAway.data.value}`:"—",body:"Tirs tentés par équipe."},
    {k:"LA LECTURE",title:hxg&&axg?`xG ${Number(hxg.data.value).toFixed(2)}–${Number(axg.data.value).toFixed(2)}`:"Lecture FACT XI",body:"Données SportMonks."}
  ];
}
function drawSlide(canvas,slide,index,assets,total){
  const c=canvas.getContext("2d"),ink="#20304A",ivory="#FAF7F0",coral="#D9705C",greige="#E6DED2",white="#FFFDF9";
  c.fillStyle=slide.accent?coral:ivory;c.fillRect(0,0,800,800);
  c.fillStyle=slide.accent?"rgba(255,255,255,.13)":greige;rounded(c,30,30,740,740,28);
  c.fillStyle=slide.accent?"rgba(32,48,74,.2)":ink;rounded(c,46,46,708,190,23);
  if(slide.cover){
    c.globalAlpha=.12;c.fillStyle=white;for(let x=45;x<755;x+=55)c.fillRect(x,46,26,190);c.globalAlpha=1;
    if(assets.home&&assets.home.complete)c.drawImage(assets.home,85,78,110,110);else{c.fillStyle=coral;rounded(c,85,78,110,110,22);c.fillStyle=white;c.font="800 45px Arial";c.fillText(initials(HOME_NAME),100,148)}
    if(assets.away&&assets.away.complete)c.drawImage(assets.away,605,78,110,110);else{c.fillStyle="#78abc2";rounded(c,605,78,110,110,22);c.fillStyle=white;c.font="800 45px Arial";c.fillText(initials(AWAY_NAME),620,148)}
    c.fillStyle=white;c.textAlign="center";c.font="800 60px Arial";c.fillText(slide.title.split("\n")[1]||"",400,150);c.textAlign="left";
  }
  c.fillStyle=slide.accent?white:coral;c.font="800 18px Arial";c.fillText(slide.k,70,285);c.fillRect(70,307,82,5);
  c.fillStyle=slide.accent?white:ink;c.font=slide.cover?"700 44px Georgia":"700 76px Georgia";
  (slide.cover?[slide.title.split("\n")[0]]:slide.title.split("\n")).forEach((t,i)=>c.fillText(t,70,400+i*88));
  c.font="500 28px Arial";wrap(c,slide.body,70,590,600,38);
  c.fillStyle=slide.accent?"rgba(255,255,255,.75)":"#6f7887";c.font="700 15px Arial";
  c.fillText(`${initials(HOME_NAME)} — ${initials(AWAY_NAME)} · ${String(index+1).padStart(2,"0")}/${String(total).padStart(2,"0")}`,70,713);
  if(assets.logo&&assets.logo.complete){c.globalAlpha=.96;c.drawImage(assets.logo,675,665,72,72);c.globalAlpha=1}else{c.fillStyle=slide.accent?white:ink;c.font="900 17px Arial";c.fillText("FACT XI",680,710)}
}
async function generateCarousel(){
  const root=document.querySelector("#carouselExports");
  root.innerHTML="<p>Génération des images…</p>";
  const home=RAW.participants.find(p=>p.id===HOME_ID), away=RAW.participants.find(p=>p.id===AWAY_ID);
  const [logo,homeImg,awayImg]=await Promise.all([
    loadImage("Logo%20Transparent.png"),
    loadImage(home.image_path,true),
    loadImage(away.image_path,true)
  ]);
  const slides=buildCarouselSlides();
  root.innerHTML="";
  slides.forEach((slide,i)=>{
    const item=document.createElement("article"),canvas=document.createElement("canvas"),download=document.createElement("button");
    canvas.width=800;canvas.height=800;
    drawSlide(canvas,slide,i,{logo,home:homeImg,away:awayImg},slides.length);
    download.textContent=`Télécharger ${i+1}/${slides.length} · PNG`;
    download.onclick=()=>{const a=document.createElement("a");a.download=`FACT-XI_${initials(HOME_NAME)}-${initials(AWAY_NAME)}_${i+1}-${slides.length}_800x800.png`;try{a.href=canvas.toDataURL("image/png");a.click()}catch{alert("Export bloqué par le chargement distant des écussons. Rechargez puis réessayez.")}};
    item.append(canvas,download);root.append(item);
  });
}

document.querySelectorAll(".page-tabs button").forEach(button=>button.onclick=()=>{document.querySelectorAll(".page-tabs button").forEach(b=>b.classList.toggle("active",b===button));document.querySelectorAll(".page-tab-panel").forEach(panel=>panel.classList.toggle("active",panel.id===`tab-${button.dataset.tab}`))});
document.querySelectorAll(".studio-tabs button").forEach(button=>button.onclick=()=>{document.querySelectorAll(".studio-tabs button").forEach(b=>b.classList.toggle("active",b===button));document.querySelectorAll(".output").forEach(panel=>panel.classList.toggle("active",panel.id===button.dataset.output))});
document.querySelectorAll(".legend button").forEach(b=>b.onclick=()=>{series=b.dataset.series;document.querySelectorAll(".legend button").forEach(x=>x.classList.toggle("active",x===b));renderChart()});
document.addEventListener("click",e=>{const btn=e.target.closest(".copy-button[data-copy]");if(btn){const el=document.querySelector(`#${btn.dataset.copy}`);if(el)copyText(el.innerText,btn)}});
document.addEventListener("click",e=>{if(e.target.id==="generateCarousel")generateCarousel()});

load();
