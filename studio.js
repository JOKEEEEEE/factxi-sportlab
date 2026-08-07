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
  const canvas = document.querySelector("#c"), ctx = canvas.getContext("2d");
  ctx.fillStyle = IVORY; ctx.fillRect(0,0,800,800);

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

  // Bandeau d'en-tête coloré : ink plein, plus de relief que du texte sur blanc.
  ctx.fillStyle = INK; roundRect(ctx,0,0,800,168,0); ctx.fill();
  ctx.globalAlpha=.06; ctx.fillStyle=WHITE;
  for(let x=0;x<800;x+=46) ctx.fillRect(x,0,22,168);
  ctx.globalAlpha=1;
  if(compLogo){ ctx.fillStyle=WHITE; roundRect(ctx,40,32,56,56,14); ctx.fill(); ctx.drawImage(compLogo,46,38,44,44); }
  else { ctx.fillStyle="#ffffff22"; roundRect(ctx,40,32,56,56,14); ctx.fill(); }
  ctx.fillStyle=CORAL; ctx.font="900 12px Arial"; ctx.fillText(comp.name.toUpperCase(), 110, 52);
  ctx.fillStyle=WHITE; ctx.font="400 32px Georgia"; ctx.fillText(`Journée ${roundSel}`, 110, 84);
  ctx.fillStyle="#ffffffaa"; ctx.font="700 11px Arial"; ctx.fillText(`${matches.length} match${matches.length>1?"s":""}`, 110, 106);

  let y = 200;
  const colW = 340, gap = 24, leftX = 40, rightX = leftX + colW + gap;

  groups.forEach(group=>{
    // bandeau de jour coloré, pas juste du texte
    ctx.fillStyle=CORAL; roundRect(ctx,leftX,y-16,180,22,6); ctx.fill();
    ctx.fillStyle=WHITE; ctx.font="900 10px Arial"; ctx.fillText(group.day.toUpperCase(), leftX+10, y);
    y += 24;
    let colY = [y, y];
    group.items.forEach((m,i)=>{
      const col = i % 2, x = col===0 ? leftX : rightX;
      let cy = colY[col];
      const hPos = positions[m.home.name], aPos = positions[m.away.name];
      const hImg = m.home.logo_url && logos[m.home.logo_url];
      const aImg = m.away.logo_url && logos[m.away.logo_url];

      // carte blanche par match, un peu de relief (ombre légère simulée par un fond gris clair décalé)
      ctx.fillStyle="#00000008"; roundRect(ctx,x+1,cy+1,colW,68,12); ctx.fill();
      ctx.fillStyle=WHITE; roundRect(ctx,x,cy,colW,68,12); ctx.fill();

      // heure : pilule corail bien visible en haut à droite de la carte
      const t = new Date(m.kickoff).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
      ctx.fillStyle=CORAL; roundRect(ctx,x+colW-58,cy+9,48,18,9); ctx.fill();
      ctx.fillStyle=WHITE; ctx.font="900 10px Arial"; ctx.textAlign="center"; ctx.fillText(t, x+colW-34, cy+21); ctx.textAlign="left";

      const iy = cy+10;
      if(hImg) ctx.drawImage(hImg, x+12, iy, 22, 22); else {ctx.fillStyle=GREIGE; roundRect(ctx,x+12,iy,22,22,6); ctx.fill();}
      ctx.fillStyle=INK; ctx.font="800 13px Arial"; ctx.fillText(m.home.name, x+42, iy+16);
      ctx.fillStyle=MUTED; ctx.font="800 9px Arial"; ctx.fillText(hPos?`${hPos}e au classement`:"", x+42, iy+28);

      const iy2 = cy+38;
      if(aImg) ctx.drawImage(aImg, x+12, iy2, 22, 22); else {ctx.fillStyle=GREIGE; roundRect(ctx,x+12,iy2,22,22,6); ctx.fill();}
      ctx.fillStyle=INK; ctx.font="800 13px Arial"; ctx.fillText(m.away.name, x+42, iy2+16);
      ctx.fillStyle=MUTED; ctx.font="800 9px Arial"; ctx.fillText(aPos?`${aPos}e au classement`:"", x+42, iy2+28);

      colY[col] = cy + 78;
    });
    y = Math.max(colY[0], colY[1]) + 14;
  });

  ctx.fillStyle=MUTED; ctx.font="700 9px Arial";
  ctx.fillText("Positions au classement avant la journée.", leftX, 770);
  if(brandLogo){ ctx.drawImage(brandLogo, 724, 754, 36, 36); }
  else { ctx.fillStyle=INK; roundRect(ctx,724,764,30,30,7); ctx.fill(); ctx.fillStyle=WHITE; ctx.font="900 12px Arial"; ctx.textAlign="center"; ctx.fillText("S", 739, 783); ctx.textAlign="left"; }

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
