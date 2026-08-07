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
}

function pickMatchday(matches){
  // Priorité : la prochaine journée qui contient des matchs programmés (pas encore joués).
  // À défaut (rien à venir dans la fenêtre récupérée) : la dernière journée jouée disponible,
  // pour toujours avoir un aperçu à montrer plutôt qu'un écran vide.
  const scheduled = matches.filter(m=>m.status==="scheduled");
  const pool = scheduled.length ? scheduled : matches;
  if(!pool.length) return null;
  const rounds = {};
  pool.forEach(m=>{
    const r = m.round || "?";
    (rounds[r]=rounds[r]||[]).push(m);
  });
  const roundKeys = Object.keys(rounds).sort((a,b)=>Number(a)-Number(b));
  const chosen = scheduled.length ? roundKeys[0] : roundKeys[roundKeys.length-1];
  return {round: chosen, matches: rounds[chosen]};
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
  return Object.entries(groups).map(([day, items])=>({day, items}));
}

function loadImage(src){return new Promise(resolve=>{if(!src){resolve(null);return}const img=new Image();img.crossOrigin="anonymous";img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src})}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}

const INK="#20304A", CORAL="#D9705C", GREIGE="#E6DED2", MUTED="#A3A9B2", WHITE="#FFFFFF", HLBG="#FBF1EC";

async function generate(){
  const compId = document.querySelector("#compSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const matches = MATCHES_BY_COMP[compId] || [];
  const picked = pickMatchday(matches);
  const canvas = document.querySelector("#c"), ctx = canvas.getContext("2d");
  ctx.fillStyle = WHITE; ctx.fillRect(0,0,800,800);

  if(!comp || !picked){
    document.querySelector("#genNote").textContent = "Aucun match disponible pour cette compétition dans la fenêtre de données actuelle.";
    document.querySelector("#dlBtn").disabled = true;
    return;
  }
  document.querySelector("#genNote").textContent = `Journée ${picked.round} · ${picked.matches.length} match(s)`;

  const positions = await getStandingsMap(compId);
  const groups = groupByDay(picked.matches).sort((a,b)=>new Date(a.items[0].kickoff)-new Date(b.items[0].kickoff));

  // précharge les écussons
  const logos = {};
  for(const g of groups) for(const m of g.items){
    if(m.home.image_path && !logos[m.home.image_path]) logos[m.home.image_path] = await loadImage(m.home.image_path);
    if(m.away.image_path && !logos[m.away.image_path]) logos[m.away.image_path] = await loadImage(m.away.image_path);
  }

  // en-tête
  const compLogo = comp.logo_url ? await loadImage(comp.logo_url) : null;
  if(compLogo){ ctx.drawImage(compLogo, 40, 38, 52, 52); }
  else { ctx.fillStyle=GREIGE; roundRect(ctx,40,38,52,52,12); ctx.fill(); ctx.fillStyle=INK; ctx.font="900 15px Arial"; ctx.textAlign="center"; ctx.fillText(comp.name.slice(0,2).toUpperCase(),66,70); ctx.textAlign="left"; }
  ctx.fillStyle=CORAL; ctx.font="900 13px Arial"; ctx.fillText(comp.name.toUpperCase(), 106, 56);
  ctx.fillStyle=INK; ctx.font="400 26px Georgia"; ctx.fillText(`Journée ${picked.round}`, 106, 80);

  let y = 122;
  const colW = 340, gap = 24, leftX = 40, rightX = leftX + colW + gap;

  for(const group of groups){
    ctx.fillStyle=CORAL; ctx.font="900 11px Arial";
    ctx.fillText(group.day.toUpperCase(), leftX, y);
    y += 14;
    let colY = [y, y];
    group.items.forEach((m,i)=>{
      const col = i % 2, x = col===0 ? leftX : rightX;
      let cy = colY[col];
      const hPos = positions[m.home.name], aPos = positions[m.away.name];
      const hImg = m.home.image_path && logos[m.home.image_path];
      const aImg = m.away.image_path && logos[m.away.image_path];

      // Heure : petit badge distinct au-dessus du match, pas une ligne orpheline.
      const t = new Date(m.kickoff).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
      ctx.fillStyle=GREIGE; roundRect(ctx,x,cy,38,14,4); ctx.fill();
      ctx.fillStyle=INK; ctx.font="800 8.5px Arial"; ctx.textAlign="center"; ctx.fillText(t, x+19, cy+10); ctx.textAlign="left";
      cy += 20;

      if(hImg) ctx.drawImage(hImg, x, cy, 17, 17); else {ctx.fillStyle=GREIGE; ctx.fillRect(x,cy,17,17);}
      ctx.fillStyle=INK; ctx.font="700 13px Arial"; ctx.fillText(m.home.name, x+24, cy+13);
      ctx.fillStyle=MUTED; ctx.font="800 9px Arial"; ctx.textAlign="right"; ctx.fillText(hPos?`${hPos}e`:"—", x+colW-4, cy+13); ctx.textAlign="left";
      cy += 22;

      if(aImg) ctx.drawImage(aImg, x, cy, 17, 17); else {ctx.fillStyle=GREIGE; ctx.fillRect(x,cy,17,17);}
      ctx.fillStyle=INK; ctx.font="700 13px Arial"; ctx.fillText(m.away.name, x+24, cy+13);
      ctx.fillStyle=MUTED; ctx.font="800 9px Arial"; ctx.textAlign="right"; ctx.fillText(aPos?`${aPos}e`:"—", x+colW-4, cy+13); ctx.textAlign="left";
      cy += 24;

      colY[col] = cy + 10;
    });
    y = Math.max(colY[0], colY[1]) + 18;
  }

  ctx.fillStyle=MUTED; ctx.font="700 9px Arial";
  ctx.fillText("Positions au classement avant la journée.", leftX, 770);
  const brandLogo = await loadImage("logo-factxi.png");
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
