let COMPETITIONS = [];
let MATCHES_BY_COMP = {};
let STANDINGS_CACHE = {};

// Toutes les images sont dessinées dans un système de coordonnées "logique"
// (ex. 800×800) puis la résolution réelle du canevas est multipliée par ce
// facteur avant export — X recommande un minimum de 1200px de large, et un
// canevas nativement plus grand évite le flou/pixelisation à l'affichage.
const RENDER_SCALE = 2;
function setupCanvas(canvas, logicalW, logicalH){
  canvas.width = logicalW*RENDER_SCALE;
  canvas.height = logicalH*RENDER_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  return ctx;
}

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

  // Backfill historique optionnel (scripts/fetch_season.py) : fusionné sans
  // doublon avec la fenêtre glissante, absent tant qu'il n'a pas été lancé —
  // c'est normal, pas une erreur.
  const history = await fetchJson("data/matches-history.json");
  if(history && Array.isArray(history.competitions)){
    history.competitions.forEach(entry=>{
      const c = entry.competition;
      if(!c) return;
      if(!MATCHES_BY_COMP[c.id]) MATCHES_BY_COMP[c.id] = [];
      const seenIds = new Set(MATCHES_BY_COMP[c.id].map(m=>m.id));
      (entry.matches||[]).forEach(m=>{ if(!seenIds.has(m.id)) MATCHES_BY_COMP[c.id].push(m); });
      if(!COMPETITIONS.find(x=>x.id===c.id)) COMPETITIONS.push(c);
    });
  }

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

const INK="#20304A", CORAL="#D9705C", GREIGE="#E6DED2", MUTED="#A3A9B2", WHITE="#FFFFFF", IVORY="#FAF7F0", CARD_TINT="#FBF9F5";

// Couleurs de marque vérifiées par de vraies sources (pas de couleur devinée).
// Dégradé à 2 teintes par compétition ; repli neutre (ink) si compétition
// non couverte par cette liste.
const COMPETITION_COLORS = {
  "Premier League": ["#3D195B", "#6B2E8F"],
  "Bundesliga": ["#B80912", "#D3010C"],
  "Ligue 1": ["#0057FF", "#E91E8C"],
  "Serie A": ["#0373FF", "#2DE2FF"],
  "La Liga": ["#C40D1E", "#E5122A"],
  "LaLiga": ["#C40D1E", "#E5122A"],
};
function compGradient(ctx, name, x0, y0, x1, y1){
  const colors = COMPETITION_COLORS[name] || [INK, "#3a4d6b"];
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  return g;
}

async function generate(){
  const compId = document.querySelector("#compSelect").value;
  const roundSel = document.querySelector("#roundSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const allMatches = MATCHES_BY_COMP[compId] || [];
  const matches = allMatches.filter(m=>m.round===roundSel);
  const pagesRoot = document.querySelector("#calendarPages");
  pagesRoot.innerHTML = "";

  if(!comp || !matches.length){
    document.querySelector("#genNote").textContent = "Aucun match pour cette sélection.";
    return;
  }

  const positions = await getStandingsMap(compId);
  const groups = groupByDay(matches);

  const logos = {};
  for(const g of groups) for(const m of g.items){
    if(m.home.logo_url && !logos[m.home.logo_url]) logos[m.home.logo_url] = await loadImage(m.home.logo_url);
    if(m.away.logo_url && !logos[m.away.logo_url]) logos[m.away.logo_url] = await loadImage(m.away.logo_url);
  }
  const compLogo = comp.logo_url ? await loadImage(comp.logo_url) : null;
  const brandLogo = await loadImage("logo-factxi.png");

  const colW = 520, gap = 30, leftX = 50, rightX = leftX + colW + gap;
  const cardH = 78, cardGap = 14, dayGap = 46, blockGap = 16;
  const bannerH = 166, headerH = bannerH + 46, footerH = 90;
  const LOGICAL_W = 1200, MAX_LOGICAL_H = 1200;
  const maxContentH = MAX_LOGICAL_H - headerH - footerH;
  const rowH = cardH+cardGap;
  const dayBadgeH = 36;

  // Pagination au niveau de la LIGNE (paire de matchs), pas de la journée
  // entière : une journée de phase de poule peut avoir 15-20 matchs le même
  // jour, qui ne tiendraient jamais sur une seule image sinon. Un jour peut
  // donc être réparti sur plusieurs images, avec un rappel "(suite)".
  const blocks = groups.map(group=>{
    const rows=[];
    for(let i=0;i<group.items.length;i+=2) rows.push(group.items.slice(i,i+2));
    return {day:group.day, rows};
  });
  const blockHeight = (nRows)=> dayBadgeH + dayGap-dayBadgeH + nRows*rowH - cardGap + blockGap;

  const pages = [];
  let current=[], currentH=0;
  blocks.forEach(block=>{
    let remaining = block.rows, firstChunk = true;
    while(remaining.length){
      let avail = maxContentH - currentH;
      let capacity = Math.floor((avail - dayGap - blockGap) / rowH);
      if(capacity <= 0 && current.length){
        pages.push(current); current=[]; currentH=0;
        avail = maxContentH; capacity = Math.floor((avail - dayGap - blockGap) / rowH);
      }
      const take = Math.max(1, Math.min(capacity, remaining.length));
      const chunkRows = remaining.slice(0, take);
      current.push({day:block.day, continued:!firstChunk, rows:chunkRows});
      currentH += blockHeight(chunkRows.length);
      remaining = remaining.slice(take);
      firstChunk = false;
    }
  });
  if(current.length) pages.push(current);

  document.querySelector("#genNote").textContent = `Journée ${roundSel} · ${matches.length} match(s)${pages.length>1?` · réparti sur ${pages.length} images`:""}`;

  pages.forEach((pageChunks,pageIndex)=>{
    // Hauteur réelle nécessaire pour CETTE page, plafonnée à MAX_LOGICAL_H :
    // évite le grand vide en bas sur une journée qui tient largement dans le cadre.
    const contentH = pageChunks.reduce((s,c)=>s+blockHeight(c.rows.length),0);
    const LOGICAL_H = Math.min(MAX_LOGICAL_H, Math.max(500, headerH+contentH+footerH));

    const wrap = document.createElement("div"); wrap.className="st-page";
    const canvas = document.createElement("canvas");
    const ctx = setupCanvas(canvas, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = WHITE; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H);

    // Bandeau d'en-tête plein, arrondi sur les 4 coins, coloré selon la
    // compétition (couleurs de marque vérifiées) + voile sombre uniforme
    // pour garantir un texte blanc lisible même sur des couleurs claires.
    const bx=leftX, by=30, bw=LOGICAL_W-leftX*2;
    ctx.fillStyle=compGradient(ctx, comp.name, bx, by, bx+bw, by+bannerH);
    roundRect(ctx,bx,by,bw,bannerH,32); ctx.fill();
    ctx.fillStyle="rgba(10,15,30,.22)";
    roundRect(ctx,bx,by,bw,bannerH,32); ctx.fill();

    ctx.fillStyle="rgba(255,255,255,.78)"; ctx.font="900 16px Arial";
    ctx.fillText(comp.name.toUpperCase(), bx+38, by+56);
    ctx.fillStyle=WHITE; ctx.font="900 48px Arial";
    ctx.fillText(`Journée ${roundSel}${pages.length>1?` (${pageIndex+1}/${pages.length})`:""}`, bx+38, by+104);

    // Tags pays / saison, façon pilules
    const country = comp.country || "";
    const tagY = by+120;
    let tagX = bx+38;
    [country, "Saison en cours"].filter(Boolean).forEach(txt=>{
      ctx.font="800 12px Arial";
      const w = ctx.measureText(txt).width + 26;
      ctx.fillStyle="rgba(255,255,255,.16)"; roundRect(ctx,tagX,tagY,w,26,13); ctx.fill();
      ctx.fillStyle=WHITE; ctx.fillText(txt, tagX+13, tagY+18);
      tagX += w+8;
    });

    if(compLogo){
      const logoBox=110;
      ctx.fillStyle=WHITE; roundRect(ctx,bx+bw-38-logoBox,by+(bannerH-logoBox)/2,logoBox,logoBox,24); ctx.fill();
      const pad=16;
      ctx.drawImage(compLogo,bx+bw-38-logoBox+pad,by+(bannerH-logoBox)/2+pad,logoBox-pad*2,logoBox-pad*2);
    }

    let y = headerH;
    pageChunks.forEach((chunk,idx)=>{
      const label = chunk.day.toUpperCase() + (chunk.continued ? " (SUITE)" : "");
      ctx.fillStyle=CORAL; roundRect(ctx,leftX,y,Math.min(440,180+label.length*7.5),dayBadgeH,10); ctx.fill();
      ctx.fillStyle=WHITE; ctx.font="900 14px Arial"; ctx.fillText(label, leftX+18, y+24);
      y += dayGap;
      chunk.rows.forEach(pair=>{
        pair.forEach((m,col)=>{
          const x = col===0 ? leftX : rightX;
          const cy = y;
          const hPos = positions[m.home.name], aPos = positions[m.away.name];
          const hImg = m.home.logo_url && logos[m.home.logo_url];
          const aImg = m.away.logo_url && logos[m.away.logo_url];

          ctx.fillStyle=WHITE; roundRect(ctx,x,cy,colW,cardH,18); ctx.fill();
          ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,x,cy,colW,cardH,18); ctx.stroke();

          const t = new Date(m.kickoff).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
          ctx.fillStyle=CORAL; roundRect(ctx,x+colW-88,cy+12,72,28,14); ctx.fill();
          ctx.fillStyle=WHITE; ctx.font="900 14px Arial"; ctx.textAlign="center"; ctx.fillText(t, x+colW-52, cy+31); ctx.textAlign="left";

          const drawTeam=(iy,name,pos,img)=>{
            if(img) ctx.drawImage(img, x+20, iy, 28, 28); else {ctx.fillStyle=GREIGE; roundRect(ctx,x+20,iy,28,28,8); ctx.fill();}
            ctx.fillStyle=INK; ctx.font="800 18px Arial";
            ctx.fillText(name, x+58, iy+21);
            if(pos!=null){
              const w=ctx.measureText(name).width;
              ctx.fillStyle=MUTED; ctx.font="700 12px Arial";
              ctx.fillText(`(${pos})`, x+58+w+3, iy+21);
            }
          };
          drawTeam(cy+12, m.home.name, hPos, hImg);
          drawTeam(cy+44, m.away.name, aPos, aImg);
        });
        y += rowH;
      });
      y += blockGap;
    });

    const footerY = LOGICAL_H - footerH + 24;
    ctx.fillStyle=MUTED; ctx.font="700 13px Arial";
    ctx.fillText("Positions au classement avant la journée.", leftX, footerY+8);

    // Signature façon carte de profil : avatar circulaire + nom + badge + handle,
    // dans une pilule ton sur ton avec les cartes de match.
    const sigW=220, sigH=58, sigX=LOGICAL_W-leftX-sigW, sigY=footerY-38;
    ctx.fillStyle=CARD_TINT; roundRect(ctx,sigX,sigY,sigW,sigH,29); ctx.fill();
    const avR=23, avCx=sigX+29, avCy=sigY+sigH/2;
    if(brandLogo){
      ctx.save();
      ctx.beginPath(); ctx.arc(avCx,avCy,avR,0,Math.PI*2); ctx.clip();
      ctx.drawImage(brandLogo, avCx-avR, avCy-avR, avR*2, avR*2);
      ctx.restore();
    } else {
      ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(avCx,avCy,avR,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=WHITE; ctx.font="900 16px Arial"; ctx.textAlign="center"; ctx.fillText("S",avCx,avCy+6); ctx.textAlign="left";
    }
    const txX=sigX+62;
    ctx.fillStyle=INK; ctx.font="900 15px Arial"; ctx.fillText("Fact XI", txX, sigY+25);
    const nameW=ctx.measureText("Fact XI").width;
    ctx.fillStyle="#1d9bf0"; ctx.beginPath(); ctx.arc(txX+nameW+13,sigY+20,7,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=WHITE; ctx.lineWidth=1.6; ctx.beginPath();
    ctx.moveTo(txX+nameW+9,sigY+20); ctx.lineTo(txX+nameW+12,sigY+23); ctx.lineTo(txX+nameW+18,sigY+16); ctx.stroke();
    ctx.fillStyle=MUTED; ctx.font="700 11px Arial"; ctx.fillText("@FactEleven", txX, sigY+41);

    const dlBtn = document.createElement("button");
    dlBtn.textContent = pages.length>1 ? `Télécharger ${pageIndex+1}/${pages.length}` : "Télécharger le PNG";
    dlBtn.onclick = ()=>{
      const a=document.createElement("a");
      a.download = pages.length>1 ? `FACT-XI_calendrier_${pageIndex+1}-${pages.length}.png` : "FACT-XI_calendrier.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    const label = document.createElement("span"); label.textContent = pages.length>1 ? `Page ${pageIndex+1}/${pages.length}` : "";
    wrap.append(canvas, label, dlBtn);
    pagesRoot.append(wrap);
  });
}

document.querySelector("#genBtn").onclick = generate;
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
  const canvas = document.querySelector("#cScorers"), ctx = setupCanvas(canvas,1200,1200);
  ctx.scale(1.5,1.5); // le contenu ci-dessous est dessiné pour un cadre logique de 800 ; on l'agrandit proportionnellement au nouveau format 1200×1200
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
  const canvas = document.querySelector("#cStreaks"), ctx = setupCanvas(canvas,1200,1200);
  ctx.scale(1.5,1.5);
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
  await initRatedSelect();
};
init();

// ===================== Meilleurs joueurs =====================

// On plafonne le nombre de matchs agrégés pour rester réactif dans le
// navigateur : une saison complète peut faire 380 matchs pour la Premier
// League, inutile de tout charger pour une moyenne représentative.
const RATED_MATCH_CAP = 60;
const RATED_MIN_APPEARANCES = 3;

async function initRatedSelect(){
  document.querySelector("#ratedCompSelect").innerHTML = COMPETITIONS.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
}

async function aggregatePlayerRatings(compId){
  const matches = (MATCHES_BY_COMP[compId]||[])
    .filter(m=>m.status==="finished")
    .sort((a,b)=>new Date(b.kickoff)-new Date(a.kickoff))
    .slice(0, RATED_MATCH_CAP);

  const players = {}; // key -> {name, photo, team, teamLogo, ratings:[{date,value}]}
  let loaded=0;
  for(const m of matches){
    const fixtureId = (m.id||"").split(":").pop();
    const payload = await fetchJson(`data/match-detail-${fixtureId}.json`);
    if(!payload || !payload.raw) continue;
    loaded++;
    const raw = payload.raw;
    const participants = raw.participants||[];
    (raw.lineups||[]).forEach(l=>{
      const rating = (l.details||[]).find(d=>d.type_id===118);
      if(!rating) return;
      const key = l.player_id || l.player_name;
      if(!players[key]){
        const team = participants.find(p=>p.id===l.team_id) || {};
        players[key] = {
          name: (l.player && l.player.display_name) || l.player_name,
          photo: l.player && l.player.image_path,
          team: team.name,
          teamLogo: team.image_path,
          ratings: []
        };
      }
      players[key].ratings.push({date:m.kickoff, value:Number(rating.data.value)});
    });
  }
  return {players, matchesLoaded:loaded, matchesConsidered:matches.length};
}

function drawRatedCard(ctx,x,y,rank,p,seasonAvg,last5Avg,logos){
  ctx.fillStyle=WHITE; roundRect(ctx,x,y,720,84,14); ctx.fill();
  ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,x,y,720,84,14); ctx.stroke();
  ctx.fillStyle=MUTED; ctx.font="900 13px Arial"; ctx.fillText(String(rank), x+16, y+48);
  const img = p.photo && logos[p.photo];
  if(img) ctx.drawImage(img, x+40, y+14, 56, 56);
  else { ctx.fillStyle=GREIGE; ctx.beginPath(); ctx.arc(x+68,y+42,28,0,7); ctx.fill(); }
  const tlogo = p.teamLogo && logos[p.teamLogo];
  if(tlogo) ctx.drawImage(tlogo, x+104, y+16, 20, 20);
  ctx.fillStyle=INK; ctx.font="800 16px Arial"; ctx.fillText(p.name||"—", x+130, y+34);
  ctx.fillStyle=MUTED; ctx.font="700 10px Arial"; ctx.fillText(p.team||"", x+130, y+50);

  const ratingBadge=(val,label,bx)=>{
    const cls = val>=7.5?"#dcebe3":val>=6.5?"#e3edf2":val>=5.5?"#f1e5cc":"#f3dcd5";
    const txt = val>=7.5?"#2d6a4f":val>=6.5?"#3e6c81":val>=5.5?"#805e1f":"#b95845";
    ctx.fillStyle=cls; roundRect(ctx,bx,y+16,84,36,10); ctx.fill();
    ctx.fillStyle=txt; ctx.font="900 17px Arial"; ctx.textAlign="center"; ctx.fillText(val.toFixed(1),bx+42,y+40); ctx.textAlign="left";
    ctx.fillStyle=MUTED; ctx.font="700 8px Arial"; ctx.textAlign="center"; ctx.fillText(label,bx+42,y+62); ctx.textAlign="left";
  };
  ratingBadge(seasonAvg,"SAISON", x+520);
  ratingBadge(last5Avg,"5 DERNIERS", x+616);
}

async function generateRated(){
  const compId = document.querySelector("#ratedCompSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const canvas = document.querySelector("#cRated");
  if(!comp){ document.querySelector("#ratedGenNote").textContent="Compétition introuvable."; return; }

  document.querySelector("#ratedGenNote").textContent="Agrégation des matchs en cours…";
  const {players, matchesLoaded, matchesConsidered} = await aggregatePlayerRatings(compId);

  const ranked = Object.values(players)
    .filter(p=>p.ratings.length>=RATED_MIN_APPEARANCES)
    .map(p=>{
      const sorted=[...p.ratings].sort((a,b)=>new Date(b.date)-new Date(a.date));
      const seasonAvg = sorted.reduce((s,r)=>s+r.value,0)/sorted.length;
      const last5 = sorted.slice(0,5);
      const last5Avg = last5.reduce((s,r)=>s+r.value,0)/last5.length;
      return {...p, seasonAvg, last5Avg};
    })
    .sort((a,b)=>b.seasonAvg-a.seasonAvg)
    .slice(0,5);

  const ctx = setupCanvas(canvas,1200,1170);
  ctx.scale(1.5,1.5);
  ctx.fillStyle=WHITE; ctx.fillRect(0,0,800,780);

  if(!ranked.length){
    document.querySelector("#ratedGenNote").textContent = matchesLoaded
      ? `Aucun joueur avec au moins ${RATED_MIN_APPEARANCES} matchs notés sur les ${matchesLoaded} matchs disponibles.`
      : "Aucun détail de match disponible pour cette compétition — le backfill saison n'a peut-être pas encore été lancé.";
    document.querySelector("#ratedDlBtn").disabled=true;
    return;
  }
  document.querySelector("#ratedGenNote").textContent = `Basé sur ${matchesLoaded} match(s) sur ${matchesConsidered} disponible(s), joueurs avec ≥${RATED_MIN_APPEARANCES} apparitions.`;

  const logos={};
  for(const p of ranked){
    if(p.photo && !logos[p.photo]) logos[p.photo]=await loadImage(p.photo);
    if(p.teamLogo && !logos[p.teamLogo]) logos[p.teamLogo]=await loadImage(p.teamLogo);
  }
  const compLogo = comp.logo_url ? await loadImage(comp.logo_url) : null;
  const brandLogo = await loadImage("logo-factxi.png");

  if(compLogo){ ctx.fillStyle=GREIGE; roundRect(ctx,40,30,50,50,12); ctx.fill(); ctx.drawImage(compLogo,45,35,40,40); }
  ctx.fillStyle=CORAL; ctx.font="900 11px Arial"; ctx.fillText(comp.name.toUpperCase(), 104, 50);
  ctx.fillStyle=INK; ctx.font="400 28px Georgia"; ctx.fillText("Meilleurs joueurs", 104, 78);

  let y=110;
  ranked.forEach((p,i)=>{ drawRatedCard(ctx,40,y,i+1,p,p.seasonAvg,p.last5Avg,logos); y+=98; });

  ctx.fillStyle=MUTED; ctx.font="700 9px Arial";
  ctx.fillText(`Note moyenne sur ${RATED_MATCH_CAP} derniers matchs maximum · minimum ${RATED_MIN_APPEARANCES} apparitions.`, 40, 750);
  if(brandLogo) ctx.drawImage(brandLogo, 724, 730, 36, 36);
  document.querySelector("#ratedDlBtn").disabled=false;
}
document.querySelector("#ratedGenBtn").onclick=generateRated;
document.querySelector("#ratedDlBtn").onclick=()=>{
  const a=document.createElement("a"); a.download="FACT-XI_meilleurs-joueurs.png";
  a.href=document.querySelector("#cRated").toDataURL("image/png"); a.click();
};
