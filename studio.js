let COMPETITIONS = [];
let MATCHES_BY_COMP = {};
let STANDINGS_CACHE = {};

async function fetchJson(url){
  try{
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) return null;
    return await res.json();
  }catch(e){ return null; }
}

function leagueNumericId(id){ return (id||"").split(":").pop(); }

async function init(){
  const payload = await fetchJson("data/matches.json");
  if(!payload || !Array.isArray(payload.competitions)){
    document.querySelector("#genNote").textContent = "data/matches.json indisponible pour l'instant.";
    return;
  }
  payload.competitions.forEach(entry=>{
    const c = entry.competition;
    if(!c) return;
    COMPETITIONS.push(c);
    MATCHES_BY_COMP[c.id] = entry.matches || [];
  });
  const select = document.querySelector("#compSelect");
  select.innerHTML = COMPETITIONS.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
  select.onchange = populateRounds;
  populateRounds();
}

function roundsForComp(compId){
  const matches = MATCHES_BY_COMP[compId] || [];
  const rounds = [...new Set(matches.map(m=>m.round).filter(Boolean))]
    .sort((a,b)=>Number(a)-Number(b));
  return rounds;
}

function defaultRound(compId){
  const matches = MATCHES_BY_COMP[compId] || [];
  const scheduled = matches.filter(m=>m.status==="scheduled");
  const pool = scheduled.length ? scheduled : matches;
  const rounds = [...new Set(pool.map(m=>m.round).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  if(!rounds.length) return null;
  return scheduled.length ? rounds[0] : rounds[rounds.length-1];
}

function populateRounds(){
  const compId = document.querySelector("#compSelect").value;
  const rounds = roundsForComp(compId);
  const sel = document.querySelector("#roundSelect");
  if(!rounds.length){ sel.innerHTML = `<option>Aucune journée</option>`; return; }
  sel.innerHTML = rounds.map(r=>`<option value="${r}">Journée ${r}</option>`).join("");
  const def = defaultRound(compId);
  if(def) sel.value = def;
}

async function getStandingsMap(compId){
  if(STANDINGS_CACHE[compId]) return STANDINGS_CACHE[compId];
  const numId = leagueNumericId(compId);
  const payload = await fetchJson(`data/standings-${numId}.json`);
  const map = {};
  if(payload && Array.isArray(payload.standings)){
    payload.standings.forEach(s=>{
      const name = s.participant && s.participant.name;
      if(name) map[name] = s.position;
    });
  }
  STANDINGS_CACHE[compId] = map;
  return map;
}

function groupByDay(matches){
  const groups = {};
  matches.forEach(m=>{
    const d = new Date(m.kickoff);
    const key = d.toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"});
    (groups[key]=groups[key]||[]).push(m);
  });
  return Object.entries(groups).map(([day, items])=>({day, items, sortKey:new Date(items[0].kickoff)}))
    .sort((a,b)=>a.sortKey-b.sortKey);
}

function loadImage(src){return new Promise(resolve=>{if(!src){resolve(null);return}const img=new Image();img.crossOrigin="anonymous";img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src})}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}

const INK="#20304A", CORAL="#D9705C", GREIGE="#E6DED2", MUTED="#A3A9B2", WHITE="#FFFFFF", IVORY="#FAF7F0";

async function generate(){
  const compId = document.querySelector("#compSelect").value;
  const roundSel = document.querySelector("#roundSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const allMatches = MATCHES_BY_COMP[compId] || [];
  const matches = allMatches.filter(m=>m.round===roundSel);
  const canvas = document.querySelector("#c");

  if(!comp || !matches.length){
    document.querySelector("#genNote").textContent = "Aucun match pour cette sélection.";
    document.querySelector("#dlBtn").disabled = true;
    return;
  }
  document.querySelector("#genNote").textContent = `Journée ${roundSel} · ${matches.length} match(s)`;

  const positions = await getStandingsMap(compId);
  const groups = groupByDay(matches);

  const logos = {};
  for(const g of groups) for(const m of g.items){
    if(m.home.logo_url && !logos[m.home.logo_url]) logos[m.home.logo_url] = await loadImage(m.home.logo_url);
    if(m.away.logo_url && !logos[m.away.logo_url]) logos[m.away.logo_url] = await loadImage(m.away.logo_url);
  }
  const compLogo = comp.logo_url ? await loadImage(comp.logo_url) : null;
  const brandLogo = await loadImage("logo-factxi.png");

  const colW = 340, gap = 24, leftX = 40, rightX = leftX + colW + gap;
  const cardH = 58, cardGap = 10, dayGap = 30;
  const headerH = 130;

  // Hauteur calculée à l'avance : plus de coupure en bas selon le nombre de matchs/jours.
  let totalH = headerH;
  groups.forEach(group=>{
    totalH += dayGap;
    const rows = Math.ceil(group.items.length/2);
    totalH += rows*(cardH+cardGap);
  });
  totalH += 60; // pied de page
  canvas.width = 800; canvas.height = Math.max(500, totalH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = WHITE; ctx.fillRect(0,0,800,canvas.height);

  ctx.fillStyle=CORAL; ctx.font="900 11px Arial"; ctx.fillText(comp.name.toUpperCase(), 40, 44);
  ctx.fillStyle=INK; ctx.font="400 30px Georgia"; ctx.fillText(`Journée ${roundSel}`, 40, 76);
  if(compLogo){ ctx.fillStyle=WHITE; roundRect(ctx,700,26,54,54,16); ctx.fill(); ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,700,26,54,54,16); ctx.stroke(); ctx.drawImage(compLogo,708,34,38,38); }

  let y = headerH;
  const short=n=>n; // les noms restent complets, cf. retour précédent sur la lisibilité

  groups.forEach(group=>{
    ctx.fillStyle=CORAL; roundRect(ctx,leftX,y-16,190,24,8); ctx.fill();
    ctx.fillStyle=WHITE; ctx.font="900 10px Arial"; ctx.fillText(group.day.toUpperCase(), leftX+12, y);
    y += dayGap;
    let colY = [y, y];
    group.items.forEach((m,i)=>{
      const col = i % 2, x = col===0 ? leftX : rightX;
      let cy = colY[col];
      const hPos = positions[m.home.name], aPos = positions[m.away.name];
      const hImg = m.home.logo_url && logos[m.home.logo_url];
      const aImg = m.away.logo_url && logos[m.away.logo_url];

      ctx.fillStyle=WHITE; roundRect(ctx,x,cy,colW,cardH,14); ctx.fill();
      ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,x,cy,colW,cardH,14); ctx.stroke();

      const t = new Date(m.kickoff).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
      ctx.fillStyle=CORAL; roundRect(ctx,x+colW-62,cy+8,50,20,10); ctx.fill();
      ctx.fillStyle=WHITE; ctx.font="900 10px Arial"; ctx.textAlign="center"; ctx.fillText(t, x+colW-37, cy+21); ctx.textAlign="left";

      const iy = cy+8;
      if(hImg) ctx.drawImage(hImg, x+14, iy, 20, 20); else {ctx.fillStyle=GREIGE; roundRect(ctx,x+14,iy,20,20,6); ctx.fill();}
      ctx.fillStyle=INK; ctx.font="800 13px Arial";
      const hLabel = hPos? `${short(m.home.name)} (${hPos})` : short(m.home.name);
      ctx.fillText(hLabel, x+42, iy+15);

      const iy2 = cy+32;
      if(aImg) ctx.drawImage(aImg, x+14, iy2, 20, 20); else {ctx.fillStyle=GREIGE; roundRect(ctx,x+14,iy2,20,20,6); ctx.fill();}
      ctx.fillStyle=INK; ctx.font="800 13px Arial";
      const aLabel = aPos? `${short(m.away.name)} (${aPos})` : short(m.away.name);
      ctx.fillText(aLabel, x+42, iy2+15);

      colY[col] = cy + cardH + cardGap;
    });
    y = Math.max(colY[0], colY[1]) + 14;
  });

  const footerY = canvas.height - 30;
  ctx.fillStyle=MUTED; ctx.font="700 9px Arial";
  ctx.fillText("Positions au classement avant la journée.", leftX, footerY);
  if(brandLogo){ ctx.drawImage(brandLogo, 724, footerY-16, 36, 36); }
  else { ctx.fillStyle=INK; roundRect(ctx,724,footerY-6,30,30,7); ctx.fill(); ctx.fillStyle=WHITE; ctx.font="900 12px Arial"; ctx.textAlign="center"; ctx.fillText("S", 739, footerY+13); ctx.textAlign="left"; }

  document.querySelector("#dlBtn").disabled = false;
}

document.querySelector("#genBtn").onclick = generate;
document.querySelector("#dlBtn").onclick = ()=>{
  const a=document.createElement("a");
  a.download="FACT-XI_calendrier.png";
  a.href=document.querySelector("#c").toDataURL("image/png");
  a.click();
};

init();

// ===================== Buteurs & passeurs =====================

function scorerValue(entry){
  return entry.total ?? entry.value ?? (entry.data && entry.data.value) ?? null;
}
function isGoalEntry(entry){
  const code = (entry.type && (entry.type.code||entry.type.name||"")).toLowerCase();
  return code.includes("goal") && !code.includes("assist") && !code.includes("card") && !code.includes("expected") && !code.includes("xg");
}
function isAssistEntry(entry){
  const code = (entry.type && (entry.type.code||entry.type.name||"")).toLowerCase();
  return code.includes("assist") && !code.includes("expected") && !code.includes("xa");
}
function isXgEntry(entry){
  const code = (entry.type && (entry.type.code||entry.type.name||"")).toLowerCase();
  return code.includes("expected") && code.includes("goal") && !code.includes("assist");
}
function isXaEntry(entry){
  const code = (entry.type && (entry.type.code||entry.type.name||"")).toLowerCase();
  return (code.includes("expected") && code.includes("assist")) || code.includes("xa");
}
function playerKeyOf(entry){ return entry.player_id || (entry.player && entry.player.id) || (entry.player && entry.player.name); }

async function initScorersSelect(){
  const sel = document.querySelector("#scorersCompSelect");
  sel.innerHTML = COMPETITIONS.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
}
function drawScorerRow(ctx,x,y,rank,entry,expectedVal,expectedLabel,logos){
  ctx.fillStyle=WHITE; roundRect(ctx,x,y,720,60,10); ctx.fill();
  ctx.fillStyle=MUTED; ctx.font="900 12px Arial"; ctx.fillText(String(rank), x+14, y+36);
  const player=entry.player||{}, team=entry.participant||{};
  const img = player.image_path && logos[player.image_path];
  if(img) ctx.drawImage(img, x+38, y+9, 42, 42);
  else { ctx.fillStyle=GREIGE; ctx.beginPath(); ctx.arc(x+59,y+30,21,0,7); ctx.fill(); }
  ctx.fillStyle=INK; ctx.font="800 14px Arial"; ctx.fillText(player.display_name||player.name||"—", x+92, y+27);
  ctx.fillStyle=MUTED; ctx.font="700 10px Arial"; ctx.fillText(team.name||"", x+92, y+44);
  const val = scorerValue(entry);
  ctx.fillStyle=CORAL; ctx.font="900 22px Arial"; ctx.textAlign="right"; ctx.fillText(String(val??"—"), x+700, y+34); ctx.textAlign="left";
  if(expectedVal!=null){
    ctx.fillStyle=MUTED; ctx.font="700 9px Arial"; ctx.textAlign="right";
    ctx.fillText(`${expectedLabel} ${Number(expectedVal).toFixed(2)}`, x+700, y+48); ctx.textAlign="left";
  }
}
async function generateScorers(){
  const compId = document.querySelector("#scorersCompSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const canvas = document.querySelector("#cScorers"), ctx = canvas.getContext("2d");
  ctx.fillStyle=WHITE; ctx.fillRect(0,0,800,800);
  if(!comp){ document.querySelector("#scorersGenNote").textContent="Compétition introuvable."; return; }
  const numId = leagueNumericId(compId);
  const payload = await fetchJson(`data/topscorers-${numId}.json`);
  const entries = payload && Array.isArray(payload.topscorers) ? payload.topscorers : [];
  const goals = entries.filter(isGoalEntry).sort((a,b)=>(scorerValue(b)||0)-(scorerValue(a)||0)).slice(0,5);
  const assists = entries.filter(isAssistEntry).sort((a,b)=>(scorerValue(b)||0)-(scorerValue(a)||0)).slice(0,5);
  const xgByPlayer={}, xaByPlayer={};
  entries.filter(isXgEntry).forEach(e=>xgByPlayer[playerKeyOf(e)]=scorerValue(e));
  entries.filter(isXaEntry).forEach(e=>xaByPlayer[playerKeyOf(e)]=scorerValue(e));

  if(!goals.length && !assists.length){
    document.querySelector("#scorersGenNote").textContent="Aucun but ni passe décisive enregistrés pour l'instant cette saison.";
  } else {
    document.querySelector("#scorersGenNote").textContent=`${goals.length} buteur(s) · ${assists.length} passeur(s)`;
  }

  const logos={};
  for(const e of [...goals,...assists]){
    const p=(e.player&&e.player.image_path);
    if(p && !logos[p]) logos[p]=await loadImage(p);
  }
  const brandLogo = await loadImage("logo-factxi.png");

  ctx.fillStyle=CORAL; ctx.font="900 11px Arial"; ctx.fillText(comp.name.toUpperCase(), 40, 44);
  ctx.fillStyle=INK; ctx.font="400 30px Georgia"; ctx.fillText("Buteurs & passeurs", 40, 76);
  if(comp.logo_url){ const cl=await loadImage(comp.logo_url); if(cl){ ctx.fillStyle=WHITE; roundRect(ctx,700,20,54,54,16); ctx.fill(); ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,700,20,54,54,16); ctx.stroke(); ctx.drawImage(cl,708,28,38,38);} }

  let y=134;
  ctx.fillStyle=CORAL; ctx.font="900 11px Arial"; ctx.fillText("MEILLEURS BUTEURS", 40, y); y+=14;
  if(!goals.length){ ctx.fillStyle=MUTED; ctx.font="700 11px Arial"; ctx.fillText("Aucun but marqué pour l'instant.", 40, y+20); y+=50; }
  else { goals.forEach((e,i)=>{ drawScorerRow(ctx,40,y,i+1,e,xgByPlayer[playerKeyOf(e)],"xG",logos); y+=68; }); }

  y+=16;
  ctx.fillStyle=CORAL; ctx.font="900 11px Arial"; ctx.fillText("MEILLEURS PASSEURS", 40, y); y+=14;
  if(!assists.length){ ctx.fillStyle=MUTED; ctx.font="700 11px Arial"; ctx.fillText("Aucune passe décisive pour l'instant.", 40, y+20); }
  else { assists.forEach((e,i)=>{ drawScorerRow(ctx,40,y,i+1,e,xaByPlayer[playerKeyOf(e)],"xA",logos); y+=68; }); }

  if(brandLogo) ctx.drawImage(brandLogo, 724, 754, 36, 36);
  document.querySelector("#scorersDlBtn").disabled=false;
}
document.querySelector("#scorersGenBtn").onclick=generateScorers;
document.querySelector("#scorersDlBtn").onclick=()=>{
  const a=document.createElement("a"); a.download="FACT-XI_buteurs-passeurs.png";
  a.href=document.querySelector("#cScorers").toDataURL("image/png"); a.click();
};

// ===================== Séries en cours =====================

const STREAK_THRESHOLD = 3;

function teamStreaks(teamName, compId){
  const matches = (MATCHES_BY_COMP[compId]||[])
    .filter(m=>m.status==="finished" && (m.home.name===teamName || m.away.name===teamName))
    .sort((a,b)=>new Date(b.kickoff)-new Date(a.kickoff));
  let win=0, unbeaten=0, loss=0, cleanSheet=0;
  let stopWin=false, stopUnbeaten=false, stopLoss=false, stopClean=false;
  for(const m of matches){
    const isHome = m.home.name===teamName;
    const gf = isHome?m.home_score:m.away_score, ga = isHome?m.away_score:m.home_score;
    if(gf==null||ga==null) continue;
    const result = gf>ga?"w":gf<ga?"l":"d";
    if(!stopWin){ if(result==="w") win++; else stopWin=true; }
    if(!stopUnbeaten){ if(result!=="l") unbeaten++; else stopUnbeaten=true; }
    if(!stopLoss){ if(result==="l") loss++; else stopLoss=true; }
    if(!stopClean){ if(ga===0) cleanSheet++; else stopClean=true; }
  }
  return {win,unbeaten,loss,cleanSheet};
}

async function initStreaksSelect(){
  document.querySelector("#streaksCompSelect").innerHTML = COMPETITIONS.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
}
function bestStreak(compId, key){
  const matches = MATCHES_BY_COMP[compId]||[];
  const teams = [...new Set(matches.flatMap(m=>[m.home.name, m.away.name]))];
  let best=null;
  teams.forEach(t=>{
    const s = teamStreaks(t, compId);
    if(s[key] >= STREAK_THRESHOLD && (!best || s[key] > best.value)) best = {team:t, value:s[key]};
  });
  return best;
}
async function generateStreaks(){
  const compId = document.querySelector("#streaksCompSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const canvas = document.querySelector("#cStreaks"), ctx = canvas.getContext("2d");
  ctx.fillStyle=WHITE; ctx.fillRect(0,0,800,800);
  if(!comp){ document.querySelector("#streaksGenNote").textContent="Compétition introuvable."; return; }

  const categories = [
    {key:"win", label:"Série de victoires", suffix:"victoires consécutives"},
    {key:"unbeaten", label:"Série d'invincibilité", suffix:"matchs sans défaite"},
    {key:"loss", label:"Série de défaites", suffix:"défaites consécutives"},
    {key:"cleanSheet", label:"Clean sheets", suffix:"matchs sans encaisser"}
  ];
  const results = categories.map(c=>({...c, best:bestStreak(compId,c.key)}));

  const anyFound = results.some(r=>r.best);
  document.querySelector("#streaksGenNote").textContent = anyFound
    ? "Séries calculées sur l'historique de matchs disponible."
    : "Aucune série ne dépasse le seuil de 3 pour l'instant — normal en tout début de saison.";

  const teamLogosNeeded = results.map(r=>r.best && r.best.team).filter(Boolean);
  const logos={};
  for(const t of teamLogosNeeded){
    const matches = MATCHES_BY_COMP[compId]||[];
    const m = matches.find(x=>x.home.name===t || x.away.name===t);
    const url = m ? (m.home.name===t ? m.home.logo_url : m.away.logo_url) : null;
    if(url) logos[t]=await loadImage(url);
  }
  const compLogo = comp.logo_url ? await loadImage(comp.logo_url) : null;
  const brandLogo = await loadImage("logo-factxi.png");

  ctx.fillStyle=CORAL; ctx.font="900 11px Arial"; ctx.fillText(comp.name.toUpperCase(), 40, 44);
  ctx.fillStyle=INK; ctx.font="400 30px Georgia"; ctx.fillText("Séries en cours", 40, 76);
  if(compLogo){ ctx.fillStyle=WHITE; roundRect(ctx,700,20,54,54,16); ctx.fill(); ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,700,20,54,54,16); ctx.stroke(); ctx.drawImage(compLogo,708,28,38,38); }

  let y=134;
  results.forEach(r=>{
    ctx.fillStyle=WHITE; roundRect(ctx,40,y,720,120,14); ctx.fill();
    ctx.fillStyle=CORAL; ctx.font="900 10px Arial"; ctx.fillText(r.label.toUpperCase(), 64, y+30);
    if(r.best){
      const logo=logos[r.best.team];
      if(logo) ctx.drawImage(logo, 64, y+44, 46, 46);
      else { ctx.fillStyle=GREIGE; roundRect(ctx,64,y+44,46,46,10); ctx.fill(); }
      ctx.fillStyle=INK; ctx.font="800 18px Arial"; ctx.fillText(r.best.team, 122, y+65);
      ctx.fillStyle=MUTED; ctx.font="700 11px Arial"; ctx.fillText(`${r.best.value} ${r.suffix}`, 122, y+85);
      ctx.fillStyle=CORAL; ctx.font="900 34px Arial"; ctx.textAlign="right"; ctx.fillText(String(r.best.value), 730, y+80); ctx.textAlign="left";
    } else {
      ctx.fillStyle=MUTED; ctx.font="700 11px Arial"; ctx.fillText("Aucune équipe n'atteint le seuil de 3 pour l'instant.", 64, y+65);
    }
    y+=134;
  });

  if(brandLogo) ctx.drawImage(brandLogo, 724, 754, 36, 36);
  document.querySelector("#streaksDlBtn").disabled=false;
}
document.querySelector("#streaksGenBtn").onclick=generateStreaks;
document.querySelector("#streaksDlBtn").onclick=()=>{
  const a=document.createElement("a"); a.download="FACT-XI_series.png";
  a.href=document.querySelector("#cStreaks").toDataURL("image/png"); a.click();
};

const _origInit = init;
init = async function(){
  await _origInit();
  await initScorersSelect();
  await initStreaksSelect();
};
init();
