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

let SYNCING = false; // garde-fou anti-boucle infinie pendant la synchronisation

// Synchronise compétition + saison sur les 4 générateurs à la fois — évite
// de re-choisir la même chose quatre fois. Propage uniquement vers les
// sélecteurs où cette compétition/saison existe réellement.
function syncSelectors(compId, seasonVal){
  if(SYNCING) return;
  SYNCING = true;
  const pairs = [
    ["#compSelect","#seasonSelect"],
    ["#scorersCompSelect","#scorersSeasonSelect"],
    ["#streaksCompSelect","#streaksSeasonSelect"],
    ["#ratedCompSelect","#ratedSeasonSelect"],
  ];
  pairs.forEach(([compSelId, seasonSelId])=>{
    const compSel = document.querySelector(compSelId);
    if(!compSel) return;
    const hasComp = Array.from(compSel.options||[]).some(o=>o.value===compId);
    if(hasComp && compSel.value!==compId){
      compSel.value = compId;
      if(compSel.onchange) compSel.onchange();
    }
    if(seasonVal!=null){
      const seasonSel = document.querySelector(seasonSelId);
      if(seasonSel){
        const hasSeason = Array.from(seasonSel.options||[]).some(o=>o.value===String(seasonVal));
        if(hasSeason) seasonSel.value = String(seasonVal);
      }
    }
  });
  SYNCING = false;
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
  select.onchange = ()=>{ populateSeasons(); if(!SYNCING) syncSelectors(select.value, null); };
  populateSeasons();
}

// Codes pays SportMonks -> français, pour les 5 compétitions couvertes.
// Repli sur la valeur brute si non listée (mieux qu'un texte manquant).
const COUNTRY_FR = {"England":"Angleterre","Germany":"Allemagne","France":"France","Italy":"Italie","Spain":"Espagne"};
function countryLabel(c){ return COUNTRY_FR[c] || c || ""; }
function seasonLabel(year){ return `${year}–${String(Number(year)+1)}`; }
// Doit correspondre EXACTEMENT à _season_slug() côté Python (fetch_season.py) :
// tiret simple, pas le tiret cadratin utilisé pour l'affichage.
function seasonSlug(year){ return `${year}-${String(Number(year)+1)}`; }

function seasonsForComp(compId){
  const matches = MATCHES_BY_COMP[compId] || [];
  return [...new Set(matches.map(m=>m.season).filter(s=>s!=null))].sort((a,b)=>b-a);
}
function populateSeasons(){
  const compId = document.querySelector("#compSelect").value;
  const seasons = seasonsForComp(compId);
  const sel = document.querySelector("#seasonSelect");
  if(!seasons.length){ sel.innerHTML = `<option>Aucune saison</option>`; populateRounds(); return; }
  sel.innerHTML = seasons.map(s=>`<option value="${s}">${seasonLabel(s)}</option>`).join("");
  sel.onchange = ()=>{ populateRounds(); if(!SYNCING) syncSelectors(document.querySelector("#compSelect").value, sel.value); };
  populateRounds();
}

function roundsForComp(compId, season){
  const matches = (MATCHES_BY_COMP[compId] || []).filter(m=>String(m.season)===String(season));
  const rounds = [...new Set(matches.map(m=>m.round).filter(Boolean))]
    .sort((a,b)=>Number(a)-Number(b));
  return rounds;
}

function defaultRound(compId, season){
  const matches = (MATCHES_BY_COMP[compId] || []).filter(m=>String(m.season)===String(season));
  const scheduled = matches.filter(m=>m.status==="scheduled");
  const pool = scheduled.length ? scheduled : matches;
  const rounds = [...new Set(pool.map(m=>m.round).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  if(!rounds.length) return null;
  return scheduled.length ? rounds[0] : rounds[rounds.length-1];
}

function populateRounds(){
  const compId = document.querySelector("#compSelect").value;
  const season = document.querySelector("#seasonSelect").value;
  const rounds = roundsForComp(compId, season);
  const sel = document.querySelector("#roundSelect");
  if(!rounds.length){ sel.innerHTML = `<option>Aucune journée</option>`; return; }
  sel.innerHTML = rounds.map(r=>`<option value="${r}">Journée ${r}</option>`).join("");
  const def = defaultRound(compId, season);
  if(def) sel.value = def;
}

async function getStandingsMap(compId){
  if(STANDINGS_CACHE[compId]) return STANDINGS_CACHE[compId];
  const numId = leagueNumericId(compId);
  const payload = await fetchJson(`data/standings-${numId}.json`);
  const map = {};
  let anyPlayed = false;
  if(payload && Array.isArray(payload.standings)){
    payload.standings.forEach(s=>{
      const name = s.participant && s.participant.name;
      const mj = (s.details||[]).find(d=>d.type_id===129);
      if(mj && Number(mj.value)>0) anyPlayed = true;
      if(name) map[name] = s.position;
    });
  }
  // Avant la toute première journée, un "classement" n'a aucun sens (tout le
  // monde à 0 match joué) — l'afficher induirait en erreur plutôt que
  // d'informer. On renvoie une correspondance vide dans ce cas précis.
  const result = anyPlayed ? map : {};
  STANDINGS_CACHE[compId] = result;
  return result;
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

// Centrage calculé à la main plutôt que via ctx.textAlign="center" — les
// emoji ont une largeur de rendu imprévisible selon les navigateurs, ce qui
// peut décaler le centrage automatique. Ici on mesure le texte réel et on
// positionne nous-mêmes, sans dépendre du textAlign ni du maxWidth de
// fillText (dont le comportement de compression n'est pas fiable non plus).
function fillTextCentered(ctx, text, cx, y){
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  const w = ctx.measureText(text).width;
  ctx.fillText(text, cx - w/2, y);
  ctx.textAlign = prevAlign;
}

// Signature commune à tous les générateurs : avatar circulaire + "Fact XI" +
// badge + handle, dans une pilule ton sur ton avec les cartes. (sigX,sigY) =
// coin haut-gauche de la pilule (220×58).
function drawSignature(ctx, brandLogo, sigX, sigY){
  const sigW=220, sigH=58;
  ctx.fillStyle=WHITE; roundRect(ctx,sigX,sigY,sigW,sigH,29); ctx.fill();
  ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,sigX,sigY,sigW,sigH,29); ctx.stroke();
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
}

// Bandeau commun aux 4 générateurs : coloré selon la compétition (couleurs
// vérifiées), arrondi 4 coins, tags pays/saison, gros logo à droite.
// title = ligne principale (ex. "Journée 1", "Buteurs & passeurs").
function drawBanner(ctx, comp, compLogo, title, seasonSel, LOGICAL_W, bannerH, leftX){
  const bx=leftX, by=30, bw=LOGICAL_W-leftX*2;
  ctx.fillStyle=compGradient(ctx, comp.name, bx, by, bx+bw, by+bannerH);
  roundRect(ctx,bx,by,bw,bannerH,32); ctx.fill();
  ctx.fillStyle="rgba(10,15,30,.22)";
  roundRect(ctx,bx,by,bw,bannerH,32); ctx.fill();

  ctx.fillStyle="rgba(255,255,255,.78)"; ctx.font="900 16px Arial";
  ctx.fillText(comp.name.toUpperCase(), bx+38, by+56);
  ctx.fillStyle=WHITE; ctx.font="900 44px Arial";
  ctx.fillText(title, bx+38, by+104);

  const country = countryLabel(comp.country);
  const tagY = by+120;
  let tagX = bx+38;
  [country, seasonSel!=null?seasonLabel(seasonSel):null].filter(Boolean).forEach(txt=>{
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
}

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
  const seasonSel = document.querySelector("#seasonSelect").value;
  const roundSel = document.querySelector("#roundSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const allMatches = MATCHES_BY_COMP[compId] || [];
  const matches = allMatches.filter(m=>String(m.season)===String(seasonSel) && m.round===roundSel);
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

  const gap = 30, leftX = 50;
  const colW = (1200 - leftX*2 - gap) / 2; // les deux colonnes + l'écart occupent exactement la largeur du bandeau
  const rightX = leftX + colW + gap;
  const cardH = 78, cardGap = 14, dayGap = 46, blockGap = 16;
  const bannerH = 166, headerH = bannerH + 46, footerH = 110;
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
    // Format toujours fixe 1200×1200, quel que soit le nombre de matchs —
    // la pagination (calculée plus haut à partir de maxContentH) garantit
    // déjà que le contenu tient dans ce cadre sans jamais chevaucher le pied
    // de page ; les journées légères laissent juste plus de blanc en bas.
    const LOGICAL_H = MAX_LOGICAL_H;

    const wrap = document.createElement("div"); wrap.className="st-page";
    const canvas = document.createElement("canvas");
    const ctx = setupCanvas(canvas, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = WHITE; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H);

    drawBanner(ctx, comp, compLogo, `Journée ${roundSel}${pages.length>1?` (${pageIndex+1}/${pages.length})`:""}`, seasonSel, LOGICAL_W, bannerH, leftX);

    let y = headerH;
    pageChunks.forEach((chunk,idx)=>{
      const label = chunk.day.toUpperCase() + (chunk.continued ? " (SUITE)" : "");
      ctx.fillStyle=CORAL; ctx.font="900 14px Arial"; ctx.fillText(label, leftX, y+14);
      ctx.strokeStyle=GREIGE; ctx.lineWidth=2; ctx.beginPath();
      ctx.moveTo(leftX, y+26); ctx.lineTo(rightX+colW, y+26); ctx.stroke();
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
          ctx.fillStyle=WHITE; roundRect(ctx,x+colW-88,cy+12,72,28,14); ctx.fill();
          ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,x+colW-88,cy+12,72,28,14); ctx.stroke();
          ctx.fillStyle=INK; ctx.font="900 14px Arial"; ctx.textAlign="center"; ctx.fillText(t, x+colW-52, cy+31); ctx.textAlign="left";

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

    const footerY = LOGICAL_H - footerH + 34;
    ctx.fillStyle=MUTED; ctx.font="700 13px Arial";
    ctx.fillText("Positions au classement avant la journée.", leftX, footerY+3);
    drawSignature(ctx, brandLogo, LOGICAL_W-leftX-220, footerY-26);

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
// xG/xA retirés : vérifié auprès de la doc officielle SportMonks, l'endpoint
// Topscorers ne gère que 3 types (Goals, Cards, Assists) — pas d'expected
// goals/assists ici. Si on veut du xG/xA par joueur un jour, il faudra une
// source différente (statistiques de saison par joueur), pas cet endpoint.
function playerKeyOf(entry){ return entry.player_id || (entry.player && entry.player.id) || (entry.player && entry.player.name); }

// Peuple un couple (sélecteur compétition, sélecteur saison) de façon
// générique — même logique que le calendrier, réutilisée par les 3 autres
// générateurs pour éviter que chacun reparte de zéro sur les saisons.
function populateCompAndSeason(compSelId, seasonSelId){
  const compSel = document.querySelector(compSelId);
  compSel.innerHTML = COMPETITIONS.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
  const refreshSeasons = ()=>{
    const seasons = seasonsForComp(compSel.value);
    const seasonSel = document.querySelector(seasonSelId);
    if(!seasons.length){ seasonSel.innerHTML = `<option>Aucune saison</option>`; return; }
    seasonSel.innerHTML = seasons.map(s=>`<option value="${s}">${seasonLabel(s)}</option>`).join("");
    const def = bestSeasonForStreaks(compSel.value);
    if(def!=null) seasonSel.value = def;
    seasonSel.onchange = ()=>{ if(!SYNCING) syncSelectors(compSel.value, seasonSel.value); };
  };
  compSel.onchange = ()=>{ refreshSeasons(); if(!SYNCING) syncSelectors(compSel.value, null); };
  refreshSeasons();
}

async function initScorersSelect(){
  populateCompAndSeason("#scorersCompSelect", "#scorersSeasonSelect");
}
function drawScorerCardMini(ctx,x,y,w,h,rank,goalsEntry,assistsEntry,position,minutes,logos){
  ctx.fillStyle=WHITE; roundRect(ctx,x,y,w,h,18); ctx.fill();
  ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,x,y,w,h,18); ctx.stroke();

  ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(x+26,y+26,16,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=WHITE; ctx.font="900 14px Arial"; fillTextCentered(ctx, String(rank), x+26, y+31);

  const entry = goalsEntry || assistsEntry;
  const player = entry.player||{}, team = entry.participant||{};
  const cx=x+w/2, photoY=y+38, photoR=42;
  const img = player.image_path && logos[player.image_path];
  if(img){ ctx.save(); ctx.beginPath(); ctx.arc(cx,photoY+photoR,photoR,0,Math.PI*2); ctx.clip(); ctx.drawImage(img,cx-photoR,photoY,photoR*2,photoR*2); ctx.restore(); }
  else { ctx.fillStyle=GREIGE; ctx.beginPath(); ctx.arc(cx,photoY+photoR,photoR,0,Math.PI*2); ctx.fill(); }

  const tlogo = team.image_path && logos[team.image_path];
  if(tlogo) ctx.drawImage(tlogo, cx+photoR-16, photoY+photoR*2-16, 24, 24);

  // Même empilement vertical que "Meilleurs joueurs", tout centré sur le
  // même axe cx : photo, nom, club, poste. Rien d'autre entre le club et la
  // pilule finale — plus de ligne de stats séparée.
  ctx.fillStyle=INK; ctx.font="800 15px Arial";
  fillTextCentered(ctx, player.display_name||player.name||"—", cx, photoY+photoR*2+30);
  ctx.fillStyle=MUTED; ctx.font="700 11px Arial";
  fillTextCentered(ctx, team.name||"", cx, photoY+photoR*2+47);

  if(position){
    ctx.font="800 10px Arial";
    const posLabel = position.toUpperCase();
    const pillW = ctx.measureText(posLabel).width + 22;
    const pillY = photoY+photoR*2+56;
    ctx.fillStyle=GREIGE; roundRect(ctx,cx-pillW/2,pillY,pillW,20,10); ctx.fill();
    ctx.fillStyle=INK; fillTextCentered(ctx, posLabel, cx, pillY+14);
  }

  // Les trois stats (buts, passes, minutes) regroupées dans une seule grande
  // pilule en bas, à la place d'un simple chiffre isolé. Les minutes ne
  // viennent pas de Topscorers (confirmé absent, seulement Goals/Cards/
  // Assists) mais de l'agrégation des détails de match, même source que la
  // carte "Meilleurs joueurs". Police alignée sur celle de "Meilleurs
  // joueurs" (11px, pas 13px) : à 13px le texte débordait de la largeur de
  // carte — c'est ce qui coupait "2995\u2019" en "29" sur les cartes larges.
  // Couleur neutre (grège/encre) plutôt que corail, qui suggérait une alerte.
  const goalsVal = goalsEntry?scorerValue(goalsEntry):0, assistsVal = assistsEntry?scorerValue(assistsEntry):0;
  const combo = `\u26bd ${goalsVal??0} \u00b7 \ud83c\udd70\ufe0f ${assistsVal??0} \u00b7 \u23f1\ufe0f ${minutes!=null?Math.round(minutes):"—"}${minutes!=null?"\u2019":""}`;
  ctx.font="700 11px Arial";
  const naturalW = ctx.measureText(combo).width + 24;
  const badgeW = Math.min(naturalW, w-8); // ne dépasse jamais la largeur de la carte
  const badgeY=y+h-48;
  ctx.fillStyle=GREIGE; roundRect(ctx,cx-badgeW/2,badgeY,badgeW,32,16); ctx.fill();
  ctx.fillStyle=INK; fillTextCentered(ctx, combo, cx, badgeY+21);
}

async function generateScorers(){
  const compId = document.querySelector("#scorersCompSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const canvas = document.querySelector("#cScorers");
  if(!comp){ document.querySelector("#scorersGenNote").textContent="Compétition introuvable."; return; }
  const numId = leagueNumericId(compId);
  const seasonSelVal = document.querySelector("#scorersSeasonSelect").value;
  const hasSeasonVal = seasonSelVal && seasonSelVal!=="Aucune saison";
  // Fichier spécifique à la saison choisie (backfill via fetch_season.py) en
  // priorité ; à défaut, repli sur le fichier "saison courante" habituel —
  // qui peut être vide si la saison en cours n'a pas encore de buts marqués.
  let payload = hasSeasonVal ? await fetchJson(`data/topscorers-${numId}-${seasonSlug(seasonSelVal)}.json`) : null;
  let usedFallback = false;
  if(!payload){ payload = await fetchJson(`data/topscorers-${numId}.json`); usedFallback = true; }
  const entries = payload && Array.isArray(payload.topscorers) ? payload.topscorers : [];
  const goals = entries.filter(isGoalEntry).sort((a,b)=>(scorerValue(b)||0)-(scorerValue(a)||0)).slice(0,5);
  const assists = entries.filter(isAssistEntry).sort((a,b)=>(scorerValue(b)||0)-(scorerValue(a)||0)).slice(0,5);
  const goalsByPlayer={}, assistsByPlayer={}, positionByPlayer={};
  entries.filter(isGoalEntry).forEach(e=>goalsByPlayer[playerKeyOf(e)]=e);
  entries.filter(isAssistEntry).forEach(e=>assistsByPlayer[playerKeyOf(e)]=e);
  entries.forEach(e=>{
    // Confirmé sur un vrai exemple : position_id numérique brut directement
    // sur l'objet player, pas de player.position.name imbriqué.
    const pos = positionFromId(e.player && e.player.position_id);
    if(pos) positionByPlayer[playerKeyOf(e)] = pos;
  });

  const fallbackNote = usedFallback && hasSeasonVal ? ` (données de la saison ${seasonLabel(seasonSelVal)} pas encore récupérées, saison courante affichée à la place)` : "";
  if(!goals.length && !assists.length){
    document.querySelector("#scorersGenNote").textContent=`Aucun but ni passe décisive enregistrés pour l'instant.${fallbackNote}`;
    document.querySelector("#scorersDlBtn").disabled=true;
    return;
  }
  document.querySelector("#scorersGenNote").textContent=`${goals.length} buteur(s) · ${assists.length} passeur(s)${fallbackNote}`;

  const logos={};
  for(const e of [...goals,...assists]){
    const p=(e.player&&e.player.image_path);
    if(p && !logos[p]) logos[p]=await loadImage(p);
    const t=(e.participant&&e.participant.image_path);
    if(t && !logos[t]) logos[t]=await loadImage(t);
  }
  const brandLogo = await loadImage("logo-factxi.png");
  const compLogo = comp.logo_url ? await loadImage(comp.logo_url) : null;

  // Minutes jouées : pas disponibles sur Topscorers (confirmé : seulement
  // Goals/Cards/Assists), donc récupérées via la même agrégation des détails
  // de match que la carte "Meilleurs joueurs", croisée par joueur.
  document.querySelector("#scorersGenNote").textContent += " · calcul des minutes en cours…";
  const minutesSeason = hasSeasonVal ? seasonSelVal : bestSeasonForStreaks(compId);
  const minutesByPlayer = {};
  if(minutesSeason!=null){
    const {players:ratingPlayers} = await aggregatePlayerRatings(compId, minutesSeason);
    Object.entries(ratingPlayers).forEach(([key,p])=>{
      minutesByPlayer[key] = p.ratings.reduce((s,r)=>s+(r.minutes||0),0);
    });
  }

  // Même grille 5 cartes/ligne que "Meilleurs joueurs". Format fixe 1200×1200,
  // comme les 3 autres générateurs — le bandeau et la signature doivent
  // rester à la même position exacte quelle que soit l'image affichée.
  const leftX=50, gap=16, cardW=(1100-4*gap)/5, cardH=290, labelH=22, rowGap=50, contentStartY=260;
  const LOGICAL_H = 1200;
  const ctx = setupCanvas(canvas,1200,LOGICAL_H);
  ctx.fillStyle=WHITE; ctx.fillRect(0,0,1200,LOGICAL_H);

  drawBanner(ctx, comp, compLogo, "Buteurs & passeurs", hasSeasonVal?seasonSelVal:null, 1200, 166, 50);

  const drawRow=(label, list, y)=>{
    if(!list.length) return y;
    ctx.fillStyle=CORAL; ctx.font="900 16px Arial"; ctx.fillText(label, leftX, y);
    const rowY=y+labelH;
    list.forEach((e,i)=>{
      const x = leftX + i*(cardW+gap);
      const key = playerKeyOf(e);
      drawScorerCardMini(ctx,x,rowY,cardW,cardH,i+1,
        goalsByPlayer[key]||null, assistsByPlayer[key]||null,
        positionByPlayer[key], minutesByPlayer[key], logos);
    });
    return rowY+cardH;
  };

  let y = contentStartY;
  y = drawRow("MEILLEURS BUTEURS", goals, y);
  if(goals.length && assists.length) y += rowGap;
  drawRow("MEILLEURS PASSEURS", assists, y);

  document.querySelector("#scorersGenNote").textContent = `${goals.length} buteur(s) · ${assists.length} passeur(s)${fallbackNote}`;
  drawSignature(ctx, brandLogo, 1200-50-220, 1098); // même position exacte que le calendrier
  document.querySelector("#scorersDlBtn").disabled=false;
}
document.querySelector("#scorersGenBtn").onclick=generateScorers;
document.querySelector("#scorersDlBtn").onclick=()=>{
  const a=document.createElement("a"); a.download="FACT-XI_buteurs-passeurs.png";
  a.href=document.querySelector("#cScorers").toDataURL("image/png"); a.click();
};

// ===================== Séries en cours =====================

const STREAK_THRESHOLD = 3;

// Les séries ne doivent jamais mélanger deux saisons (une "série de 5" à
// cheval sur l'intersaison n'a pas de sens). À défaut de sélecteur dédié ici,
// on choisit automatiquement la saison qui a le plus de matchs terminés —
// la saison en cours si elle est bien avancée, sinon la dernière complète.
function bestSeasonForStreaks(compId){
  const matches = MATCHES_BY_COMP[compId]||[];
  const counts = {};
  matches.forEach(m=>{ if(m.status==="finished" && m.season!=null) counts[m.season]=(counts[m.season]||0)+1; });
  const seasons = Object.keys(counts);
  if(!seasons.length) return null;
  return seasons.reduce((best,s)=> counts[s]>counts[best] ? s : best, seasons[0]);
}
// Une série (victoires, invincibilité, etc.) est un fait continu qui ne
// s'arrête pas à la frontière artificielle d'une saison — contrairement aux
// buteurs/passeurs, aux moyennes de note et au calendrier, qui eux sont bien
// propres à une saison précise. On utilise donc tout l'historique disponible
// pour la compétition, sans filtre de saison.
function teamStreaks(teamName, compId){
  const matches = (MATCHES_BY_COMP[compId]||[])
    .filter(m=>m.status==="finished" && (m.home.name===teamName || m.away.name===teamName))
    .sort((a,b)=>new Date(b.kickoff)-new Date(a.kickoff));
  const state = {
    win: {count:0, stopped:false, startMatch:null},
    unbeaten: {count:0, stopped:false, startMatch:null},
    loss: {count:0, stopped:false, startMatch:null},
    cleanSheet: {count:0, stopped:false, startMatch:null},
    scoring: {count:0, stopped:false, startMatch:null},
    winless: {count:0, stopped:false, startMatch:null},
  };
  const bump = (key, condition, m) => {
    const s = state[key];
    if(s.stopped) return;
    if(condition){ s.count++; s.startMatch = m; } else s.stopped = true;
  };
  for(const m of matches){
    const isHome = m.home.name===teamName;
    const gfRaw = isHome?m.home_score:m.away_score, gaRaw = isHome?m.away_score:m.home_score;
    if(gfRaw==null||gaRaw==null) continue;
    // Number() explicite : si un score arrive en texte ("0" plutôt que 0),
    // une comparaison stricte (===0) échoue silencieusement sans ça.
    const gf = Number(gfRaw), ga = Number(gaRaw);
    const result = gf>ga?"w":gf<ga?"l":"d";
    bump("win", result==="w", m);
    bump("unbeaten", result!=="l", m);
    bump("loss", result==="l", m);
    bump("cleanSheet", ga===0, m);
    bump("scoring", gf>0, m);
    bump("winless", result!=="w", m);
  }
  const out = {};
  for(const k in state) out[k] = state[k].count;
  out._startMatch = {};
  for(const k in state) out._startMatch[k] = state[k].startMatch;
  return out;
}

async function initStreaksSelect(){
  populateCompAndSeason("#streaksCompSelect", "#streaksSeasonSelect");
}

// Renvoie TOUTES les équipes à égalité sur la meilleure valeur — jamais une
// seule choisie arbitrairement. Chaque entrée porte sa propre date de début
// de série (premier match de la série en cours, avec sa journée).
function bestStreak(compId, key){
  const matches = MATCHES_BY_COMP[compId]||[];
  const teams = [...new Set(matches.flatMap(m=>[m.home.name, m.away.name]))];
  let bestValue = 0;
  const perTeam = {};
  teams.forEach(t=>{
    const s = teamStreaks(t, compId);
    if(s[key] >= STREAK_THRESHOLD){
      perTeam[t] = {value:s[key], startMatch:s._startMatch[key]};
      if(s[key] > bestValue) bestValue = s[key];
    }
  });
  const tied = Object.entries(perTeam)
    .filter(([,v])=>v.value===bestValue)
    .map(([team,v])=>({team, startMatch:v.startMatch}));
  if(!tied.length) return null;
  return {value:bestValue, teams:tied};
}

// Conditions match par match pour chaque catégorie de série, réutilisées
// pour le suivi de la série en cours (bestStreak) ET pour le scan
// historique ci-dessous (mostRecentEndedStreak).
const STREAK_CONDITIONS = {
  win: (gf,ga)=>gf>ga,
  unbeaten: (gf,ga)=>gf>=ga,
  loss: (gf,ga)=>gf<ga,
  cleanSheet: (gf,ga)=>ga===0,
  scoring: (gf,ga)=>gf>0,
  winless: (gf,ga)=>gf<=ga,
};

// Quand personne n'atteint le seuil ACTUELLEMENT, on cherche dans tout
// l'historique de la saison la dernière série qualifiante déjà achevée
// (n'importe quelle équipe), pour donner un repère plutôt qu'une case vide.
function mostRecentEndedStreak(compId, key){
  const condition = STREAK_CONDITIONS[key];
  const matches = MATCHES_BY_COMP[compId]||[];
  const teams = [...new Set(matches.flatMap(m=>[m.home.name, m.away.name]))];
  // On collecte TOUTES les séries qualifiantes de TOUTES les équipes dans une
  // seule liste plate, sans distinction, puis on trie par date de fin
  // décroissante. La plus récente gagne, jamais la plus longue — même une
  // série de 15 matchs vieille de deux ans perd face à une série de 3 matchs
  // qui vient de se terminer la semaine dernière.
  const allQualifyingRuns = [];
  teams.forEach(teamName=>{
    const teamMatches = (MATCHES_BY_COMP[compId]||[])
      .filter(m=>m.status==="finished" && (m.home.name===teamName || m.away.name===teamName))
      .sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff));
    let run=null;
    const runs=[];
    teamMatches.forEach(m=>{
      const isHome = m.home.name===teamName;
      const gfRaw = isHome?m.home_score:m.away_score, gaRaw = isHome?m.away_score:m.home_score;
      if(gfRaw==null||gaRaw==null) return;
      const gf=Number(gfRaw), ga=Number(gaRaw);
      if(condition(gf,ga)){
        if(!run) run={startMatch:m, endMatch:m, count:0};
        run.count++; run.endMatch=m;
      } else {
        if(run) runs.push(run);
        run=null;
      }
    });
    if(run) runs.push(run); // série encore active au dernier match connu : compte aussi comme "achevée" pour ce repli
    runs.filter(r=>r.count>=STREAK_THRESHOLD).forEach(r=>allQualifyingRuns.push({...r, team:teamName}));
  });
  if(!allQualifyingRuns.length) return null;
  allQualifyingRuns.sort((a,b)=>new Date(b.endMatch.kickoff)-new Date(a.endMatch.kickoff));
  const best = allQualifyingRuns[0];
  return best;
}
async function generateStreaks(){
  const compId = document.querySelector("#streaksCompSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const canvasEl = document.querySelector("#cStreaks");
  if(!comp){ document.querySelector("#streaksGenNote").textContent="Compétition introuvable."; return; }
  // Pas de filtre de saison ici, volontairement : une série (victoires,
  // invincibilité...) est un fait continu qui traverse l'intersaison, pas
  // une statistique propre à une saison comme les buteurs ou les moyennes.
  if(!(MATCHES_BY_COMP[compId]||[]).some(m=>m.status==="finished")){
    document.querySelector("#streaksGenNote").textContent="Aucun match terminé disponible pour cette compétition."; return;
  }

  const categories = [
    {key:"win", label:"Série de victoires", suffix:"victoires consécutives"},
    {key:"unbeaten", label:"Série d'invincibilité", suffix:"matchs sans défaite"},
    {key:"loss", label:"Série de défaites", suffix:"défaites consécutives"},
    {key:"cleanSheet", label:"Séries sans encaisser", suffix:"matchs sans encaisser (clean sheets)"},
    {key:"scoring", label:"Série de buts marqués", suffix:"matchs consécutifs en marquant"},
    {key:"winless", label:"Série sans victoire", suffix:"matchs consécutifs sans gagner"}
  ];
  const results = categories.map(c=>{
    const best = bestStreak(compId,c.key);
    const fallback = best ? null : mostRecentEndedStreak(compId,c.key);
    return {...c, best, fallback};
  });

  const anyFound = results.some(r=>r.best);
  document.querySelector("#streaksGenNote").textContent = anyFound
    ? "Séries calculées sur tout l'historique disponible — une série n'est pas bornée par saison."
    : "Aucune série ne dépasse le seuil de 3 sur l'historique disponible.";

  const teamLogosNeeded = results.flatMap(r=>{
    if(r.best) return r.best.teams.map(t=>t.team);
    if(r.fallback) return [r.fallback.team];
    return [];
  });
  const logos={};
  for(const t of teamLogosNeeded){
    const matches = MATCHES_BY_COMP[compId]||[];
    const m = matches.find(x=>x.home.name===t || x.away.name===t);
    const url = m ? (m.home.name===t ? m.home.logo_url : m.away.logo_url) : null;
    if(url) logos[t]=await loadImage(url);
  }
  const compLogo = comp.logo_url ? await loadImage(comp.logo_url) : null;
  const brandLogo = await loadImage("logo-factxi.png");

  // Format fixe 1200×1200, comme les 3 autres générateurs — le bandeau et la
  // signature doivent rester à la même position exacte sur les 4 images.
  const gap=20, colW=(1100-gap)/2, cellH=200, leftX=50, contentStartY=250;
  const LOGICAL_H = 1200;
  const ctx = setupCanvas(canvasEl,1200,LOGICAL_H);
  ctx.fillStyle=WHITE; ctx.fillRect(0,0,1200,LOGICAL_H);

  drawBanner(ctx, comp, compLogo, "Séries en cours", null, 1200, 166, 50);

  const startDateLabel=(m)=>{
    if(!m) return "";
    const d = new Date(m.kickoff).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
    const round = m.round ? ` · Journée ${m.round}` : "";
    return `Depuis le ${d}${round}`;
  };

  // Grille 2 colonnes × 3 lignes plutôt qu'une pile verticale — donne plus de
  // relief à un format qui a maintenant 6 catégories. Le grand chiffre porte
  // toujours son unité ("MATCHS") juste en dessous, donc plus besoin de
  // répéter "N matchs sans défaite" en toutes lettres à côté du nom d'équipe.
  results.forEach((r,idx)=>{
    const col = idx%2, row = Math.floor(idx/2);
    const x = leftX + col*(colW+gap), y = contentStartY + row*(cellH+gap);

    ctx.fillStyle=WHITE; roundRect(ctx,x,y,colW,cellH,18); ctx.fill();
    ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,x,y,colW,cellH,18); ctx.stroke();
    ctx.fillStyle=CORAL; ctx.font="900 13px Arial"; ctx.fillText(r.label.toUpperCase(), x+26, y+34);

    // Bloc chiffre + unité, centré verticalement dans la carte (pas plaqué en haut) —
    // aussi affiché pour le repli historique (grisé, la série n'est plus active).
    const numX = x+colW-30, numCy = y+cellH/2;
    if(r.best){
      ctx.fillStyle=CORAL; ctx.font="900 52px Arial"; ctx.textAlign="right"; ctx.fillText(String(r.best.value), numX, numCy+10); ctx.textAlign="left";
      ctx.fillStyle=MUTED; ctx.font="800 10px Arial"; ctx.textAlign="right"; ctx.fillText("MATCHS", numX, numCy+26); ctx.textAlign="left";
    } else if(r.fallback){
      ctx.fillStyle=GREIGE; ctx.font="900 52px Arial"; ctx.textAlign="right"; ctx.fillText(String(r.fallback.count), numX, numCy+10); ctx.textAlign="left";
      ctx.fillStyle=MUTED; ctx.font="800 10px Arial"; ctx.textAlign="right"; ctx.fillText("MATCHS", numX, numCy+26); ctx.textAlign="left";
    }

    if(r.fallback && !r.best){
      const t=r.fallback, logo=logos[t.team];
      ctx.globalAlpha=0.55;
      if(logo) ctx.drawImage(logo, x+26, y+62, 50, 50);
      else { ctx.fillStyle=GREIGE; roundRect(ctx,x+26,y+62,50,50,12); ctx.fill(); }
      ctx.globalAlpha=1;
      ctx.fillStyle=MUTED; ctx.font="800 19px Arial"; ctx.fillText(t.team, x+88, y+91, colW-150);
      const dEnd = new Date(t.endMatch.kickoff).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
      const roundTxt = t.endMatch.round ? ` (Journée ${t.endMatch.round})` : "";
      ctx.fillStyle=MUTED; ctx.font="700 12px Arial"; ctx.fillText(`Dernière fois, jusqu'au ${dEnd}${roundTxt}`, x+26, y+142, colW-52);
    } else if(!r.best){
      ctx.fillStyle=MUTED; ctx.font="700 13px Arial"; ctx.fillText("Aucune équipe n'a atteint le seuil de 3 cette saison.", x+26, y+70);
    } else if(r.best.teams.length===1){
      const t=r.best.teams[0], logo=logos[t.team];
      if(logo) ctx.drawImage(logo, x+26, y+62, 50, 50);
      else { ctx.fillStyle=GREIGE; roundRect(ctx,x+26,y+62,50,50,12); ctx.fill(); }
      ctx.fillStyle=INK; ctx.font="800 19px Arial"; ctx.fillText(t.team, x+88, y+91, colW-150);
      ctx.fillStyle=MUTED; ctx.font="700 12px Arial"; ctx.fillText(startDateLabel(t.startMatch), x+26, y+142, colW-52);
    } else if(r.best.teams.length<=5){
      let ty=y+64;
      r.best.teams.forEach(t=>{
        const logo=logos[t.team];
        if(logo) ctx.drawImage(logo, x+26, ty, 28, 28);
        else { ctx.fillStyle=GREIGE; roundRect(ctx,x+26,ty,28,28,7); ctx.fill(); }
        ctx.fillStyle=INK; ctx.font="700 14px Arial"; ctx.fillText(t.team, x+62, ty+19, colW-90);
        ty += 34;
      });
    } else {
      ctx.fillStyle=INK; ctx.font="800 17px Arial"; ctx.fillText(`${r.best.teams.length} équipes à égalité`, x+26, y+70);
      let lx=x+26;
      r.best.teams.forEach(t=>{
        const logo=logos[t.team];
        if(logo) ctx.drawImage(logo, lx, y+86, 26, 26);
        else { ctx.fillStyle=GREIGE; roundRect(ctx,lx,y+86,26,26,6); ctx.fill(); }
        lx += 32;
        if(lx > x+colW-40){ lx = x+26; }
      });
    }
  });

  drawSignature(ctx, brandLogo, 1200-50-220, 1098); // même position exacte que le calendrier
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
// Plafond de sécurité, pas une limite fonctionnelle : une saison complète de
// n'importe quel des 5 championnats couverts tient largement dedans (~380
// matchs pour la Premier League). Un plafond plus bas (60, utilisé avant)
// faussait silencieusement les stats "saison" en ne couvrant qu'une poignée
// de journées — c'est ce qui donnait des passes décisives très inférieures
// aux vrais totaux de saison.
const RATED_MATCH_CAP = 500;
const RATED_MIN_APPEARANCES = 3;

async function initRatedSelect(){
  populateCompAndSeason("#ratedCompSelect", "#ratedSeasonSelect");
}

// Poste du joueur : confirmé sur un vrai exemple de réponse SportMonks —
// PAS d'objet "position.name" imbriqué, seulement un "position_id" numérique
// brut (24=Gardien, 25=Défenseur, 26=Milieu, 27=Attaquant), table de
// référence stable et documentée officiellement. On reste volontairement sur
// ces 4 catégories simples (pas le detailed_position_id, plus précis mais
// avec une dizaine de valeurs — trop pour une petite carte).
const POSITION_ID_FR = {24:"Gardien", 25:"Défenseur", 26:"Milieu", 27:"Attaquant"};
function positionFromId(id){ return id!=null ? (POSITION_ID_FR[id] || null) : null; }
// Cherche l'ID de poste à plusieurs endroits possibles selon la source
// (lineup de match-detail vs entrée topscorers), sans jamais inventer une
// valeur si rien n'est trouvé.
function playerPosition(l){
  const p = l.player || {};
  const id = l.position_id ?? p.position_id ?? null;
  return positionFromId(id);
}

// Détection défensive de statistiques dans les détails d'une composition —
// on ne connaît pas les type_id exacts à l'avance (seul 118=note est confirmé
// depuis longtemps), donc on cherche par nom/code plutôt que par identifiant.
function statValue(details, matchers, exclude){
  for(const d of details||[]){
    const name = ((d.type && (d.type.name||d.type.code)) || "").toLowerCase();
    if(exclude && exclude.some(x=>name.includes(x))) continue;
    if(matchers.some(m=>name.includes(m))) return Number(d.data && d.data.value);
  }
  return null;
}

async function aggregatePlayerRatings(compId, season){
  const matches = (MATCHES_BY_COMP[compId]||[])
    .filter(m=>m.status==="finished" && String(m.season)===String(season))
    .sort((a,b)=>new Date(b.kickoff)-new Date(a.kickoff))
    .slice(0, RATED_MATCH_CAP);

  const players = {}; // key -> {name, photo, team, teamLogo, position, ratings:[{date,value,goals,assists,minutes}]}
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
          position: playerPosition(l),
          ratings: []
        };
      }
      players[key].ratings.push({
        date:m.kickoff,
        value:Number(rating.data.value),
        goals: statValue(l.details, ["goal"], ["conceded","against","own","expected","xg"]) || 0,
        assists: statValue(l.details, ["assist"], ["expected","xa"]) || 0,
        minutes: statValue(l.details, ["minutes played","minutes"]) || 0,
      });
    });
  }
  return {players, matchesLoaded:loaded, matchesConsidered:matches.length};
}

function drawRatedCardMini(ctx,x,y,w,h,rank,p,value,stats,logos){
  ctx.fillStyle=WHITE; roundRect(ctx,x,y,w,h,18); ctx.fill();
  ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,x,y,w,h,18); ctx.stroke();

  ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(x+26,y+26,16,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=WHITE; ctx.font="900 14px Arial"; fillTextCentered(ctx, String(rank), x+26, y+31);

  const cx=x+w/2, photoY=y+38, photoR=42;
  const img = p.photo && logos[p.photo];
  if(img){ ctx.save(); ctx.beginPath(); ctx.arc(cx,photoY+photoR,photoR,0,Math.PI*2); ctx.clip(); ctx.drawImage(img,cx-photoR,photoY,photoR*2,photoR*2); ctx.restore(); }
  else { ctx.fillStyle=GREIGE; ctx.beginPath(); ctx.arc(cx,photoY+photoR,photoR,0,Math.PI*2); ctx.fill(); }

  const tlogo = p.teamLogo && logos[p.teamLogo];
  if(tlogo) ctx.drawImage(tlogo, cx+photoR-16, photoY+photoR*2-16, 24, 24);

  ctx.fillStyle=INK; ctx.font="800 15px Arial";
  fillTextCentered(ctx, p.name||"—", cx, photoY+photoR*2+30);
  ctx.fillStyle=MUTED; ctx.font="700 11px Arial";
  fillTextCentered(ctx, p.team||"", cx, photoY+photoR*2+47);

  // Poste dans sa propre pilule, sous le nom du club plutôt qu'accolé dessus.
  let statLineY = photoY+photoR*2+66;
  if(p.position){
    ctx.font="800 10px Arial";
    const posLabel = p.position.toUpperCase();
    const pillW = ctx.measureText(posLabel).width + 22;
    const pillY = photoY+photoR*2+56;
    ctx.fillStyle=GREIGE; roundRect(ctx,cx-pillW/2,pillY,pillW,20,10); ctx.fill();
    ctx.fillStyle=INK; fillTextCentered(ctx, posLabel, cx, pillY+14);
    statLineY = pillY + 38;
  }

  // Ligne compacte buts / passes / temps de jeu, calculée sur la même
  // fenêtre que le classement affiché (saison entière ou 5 derniers matchs).
  const statLine = `⚽ ${Math.round(stats.goals)} · 🅰️ ${Math.round(stats.assists)} · ⏱️ ${Math.round(stats.minutes)}’`;
  ctx.fillStyle=INK; ctx.font="700 11px Arial";
  fillTextCentered(ctx, statLine, cx, statLineY);

  const cls = value>=7.5?"#dcebe3":value>=6.5?"#e3edf2":value>=5.5?"#f1e5cc":"#f3dcd5";
  const txt = value>=7.5?"#2d6a4f":value>=6.5?"#3e6c81":value>=5.5?"#805e1f":"#b95845";
  const badgeW=64, badgeY=y+h-48;
  ctx.fillStyle=cls; roundRect(ctx,cx-badgeW/2,badgeY,badgeW,32,10); ctx.fill();
  ctx.fillStyle=txt; ctx.font="900 17px Arial";
  fillTextCentered(ctx, value.toFixed(1), cx, badgeY+22);
}

async function generateRated(){
  const compId = document.querySelector("#ratedCompSelect").value;
  const comp = COMPETITIONS.find(c=>c.id===compId);
  const canvas = document.querySelector("#cRated");
  if(!comp){ document.querySelector("#ratedGenNote").textContent="Compétition introuvable."; return; }

  const seasonSelVal = document.querySelector("#ratedSeasonSelect").value;
  const season = seasonSelVal && seasonSelVal!=="Aucune saison" ? seasonSelVal : bestSeasonForStreaks(compId);
  if(season==null){ document.querySelector("#ratedGenNote").textContent="Aucun match terminé disponible pour cette compétition."; return; }

  document.querySelector("#ratedGenNote").textContent="Agrégation des matchs en cours…";
  const {players, matchesLoaded, matchesConsidered} = await aggregatePlayerRatings(compId, season);

  const withEnough = Object.values(players).filter(p=>p.ratings.length>=RATED_MIN_APPEARANCES);
  const bySeasonAvg = withEnough
    .map(p=>({...p, value: p.ratings.reduce((s,r)=>s+r.value,0)/p.ratings.length}))
    .sort((a,b)=>b.value-a.value).slice(0,5);
  const byLast5 = withEnough
    .map(p=>{
      const sorted=[...p.ratings].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
      return {...p, value: sorted.reduce((s,r)=>s+r.value,0)/sorted.length};
    })
    .sort((a,b)=>b.value-a.value).slice(0,5);

  const leftX=50, gap=16, cardW=(1100-4*gap)/5, cardH=316;
  const labelH=22, rowGap=50;
  const contentStartY=260;
  // Format fixe 1200×1200, comme les 3 autres générateurs — le bandeau et la
  // signature doivent rester à la même position exacte sur les 4 images.
  const LOGICAL_H = 1200;
  const ctx = setupCanvas(canvas,1200,LOGICAL_H);
  ctx.fillStyle=WHITE; ctx.fillRect(0,0,1200,LOGICAL_H);

  if(!bySeasonAvg.length){
    document.querySelector("#ratedGenNote").textContent = matchesLoaded
      ? `Aucun joueur avec au moins ${RATED_MIN_APPEARANCES} matchs notés sur la saison ${seasonLabel(season)}.`
      : "Aucun détail de match disponible pour cette compétition — le backfill saison n'a peut-être pas encore été lancé.";
    document.querySelector("#ratedDlBtn").disabled=true;
    return;
  }
  document.querySelector("#ratedGenNote").textContent = `Saison ${seasonLabel(season)} uniquement · ${matchesLoaded} match(s) chargé(s) sur ${matchesConsidered} · ≥${RATED_MIN_APPEARANCES} apparitions.`;

  const logos={};
  for(const p of [...bySeasonAvg, ...byLast5]){
    if(p.photo && !logos[p.photo]) logos[p.photo]=await loadImage(p.photo);
    if(p.teamLogo && !logos[p.teamLogo]) logos[p.teamLogo]=await loadImage(p.teamLogo);
  }
  const compLogo = comp.logo_url ? await loadImage(comp.logo_url) : null;
  const brandLogo = await loadImage("logo-factxi.png");

  drawBanner(ctx, comp, compLogo, "Meilleurs joueurs", season, 1200, 166, 50);

  // Buts/passes/temps de jeu additionnés sur la MÊME fenêtre que la note
  // affichée : saison entière pour la première rangée, 5 derniers matchs
  // seulement pour la seconde — pas les mêmes totaux dans les deux cas.
  const sumStats=(ratings)=>ratings.reduce((s,r)=>({goals:s.goals+r.goals, assists:s.assists+r.assists, minutes:s.minutes+r.minutes}), {goals:0,assists:0,minutes:0});

  const drawRow=(label, list, y, statsFn)=>{
    ctx.fillStyle=CORAL; ctx.font="900 16px Arial"; ctx.fillText(label, leftX, y);
    const rowY=y+labelH;
    for(let i=0;i<5;i++){
      const x = leftX + i*(cardW+gap);
      if(list[i]) drawRatedCardMini(ctx,x,rowY,cardW,cardH,i+1,list[i],list[i].value,statsFn(list[i]),logos);
      else { ctx.strokeStyle=GREIGE; ctx.lineWidth=1; roundRect(ctx,x,rowY,cardW,cardH,18); ctx.stroke(); }
    }
    return rowY+cardH;
  };

  let y = contentStartY;
  y = drawRow("TOP 5 · MOYENNE SAISON", bySeasonAvg, y, p=>sumStats(p.ratings));
  y += rowGap;
  drawRow("TOP 5 · 5 DERNIERS MATCHS", byLast5, y, p=>{
    const last5 = [...p.ratings].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
    return sumStats(last5);
  });

  ctx.fillStyle=MUTED; ctx.font="700 12px Arial";
  ctx.fillText(`Saison ${seasonLabel(season)} uniquement · minimum ${RATED_MIN_APPEARANCES} apparitions.`, 50, LOGICAL_H-56);
  drawSignature(ctx, brandLogo, 1200-50-220, 1098); // même position exacte que le calendrier
  document.querySelector("#ratedDlBtn").disabled=false;
}
document.querySelector("#ratedGenBtn").onclick=generateRated;
document.querySelector("#ratedDlBtn").onclick=()=>{
  const a=document.createElement("a"); a.download="FACT-XI_meilleurs-joueurs.png";
  a.href=document.querySelector("#cRated").toDataURL("image/png"); a.click();
};
