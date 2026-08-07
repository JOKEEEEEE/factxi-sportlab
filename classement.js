let COMPETITIONS = []; // [{id:"sportmonks:league:8", name, logo_url}]
let currentLeagueId = null;
let MATCHES_BY_COMP = {};

// Zones qualification/relégation : règle simplifiée, pas une donnée API.
// Approximation raisonnable pour les 5 grands championnats (top 4 = Ligue des
// Champions, 2 suivants = Europa/Conférence, 3 derniers = relégation) mais les
// règles exactes varient par saison (vainqueurs de coupe, place coefficient
// supplémentaire, nombre de relégués selon le championnat). À ajuster à la
// main si un cas précis ne correspond pas.
const ZONE_RULES = { ucl: 4, uel: 2, relegationFromBottom: 3 };
function zoneFor(position, total){
  if(position<=ZONE_RULES.ucl) return "zone-ucl";
  if(position<=ZONE_RULES.ucl+ZONE_RULES.uel) return "zone-uel";
  if(total && position>total-ZONE_RULES.relegationFromBottom) return "zone-relegation";
  return "";
}

async function fetchJson(url){
  try{
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) return null;
    return await res.json();
  }catch(e){ return null; }
}

async function init(){
  const matches = await fetchJson("data/matches.json");
  if(matches && Array.isArray(matches.competitions)){
    COMPETITIONS = matches.competitions
      .map(e => e.competition)
      .filter(Boolean)
      .map(c => ({id:c.id, name:c.name, logo_url:c.logo_url}));
    matches.competitions.forEach(e=>{
      if(e.competition) MATCHES_BY_COMP[e.competition.id] = e.matches || [];
    });
  }
  if(!COMPETITIONS.length){
    document.querySelector("#loadingState").textContent = "Aucune compétition disponible pour l'instant. Le robot n'a peut-être pas encore tourné.";
    return;
  }
  document.querySelector("#compTabs").innerHTML = COMPETITIONS.map(c=>{
    const logo = c.logo_url ? `<img src="${c.logo_url}" alt="" onerror="this.remove()">` : "";
    return `<button data-id="${c.id}">${logo}<span>${c.name}</span></button>`;
  }).join("");
  document.querySelectorAll("#compTabs button").forEach(b=>b.onclick=()=>selectCompetition(b.dataset.id));
  await selectCompetition(COMPETITIONS[0].id);
}

function leagueNumericId(id){ return (id||"").split(":").pop(); }

async function selectCompetition(id){
  currentLeagueId = id;
  document.querySelectorAll("#compTabs button").forEach(b=>b.classList.toggle("active", b.dataset.id===id));
  document.querySelector("#loadingState").hidden = false;
  document.querySelector("#loadingState").textContent = "Chargement…";
  document.querySelector("#content").hidden = true;

  const numId = leagueNumericId(id);
  const [standingsPayload, topscorersPayload] = await Promise.all([
    fetchJson(`data/standings-${numId}.json`),
    fetchJson(`data/topscorers-${numId}.json`)
  ]);

  if(!standingsPayload){
    document.querySelector("#loadingState").textContent = "Pas encore de classement récupéré pour cette compétition.";
    return;
  }

  renderStandings(standingsPayload.standings || []);
  renderTopscorers(topscorersPayload ? (topscorersPayload.topscorers || []) : []);

  document.querySelector("#loadingState").hidden = true;
  document.querySelector("#content").hidden = false;
}

function detailValue(row, typeId){
  const d = (row.details||[]).find(x=>x.type_id===typeId);
  return d ? d.value : null;
}

function last5Form(teamName, leagueId){
  const matches = (MATCHES_BY_COMP[leagueId]||[])
    .filter(m => m.status==="finished" && (m.home.name===teamName || m.away.name===teamName))
    .sort((a,b)=>new Date(b.kickoff)-new Date(a.kickoff))
    .slice(0,5)
    .reverse(); // plus ancien à gauche, plus récent à droite
  return matches.map(m=>{
    const isHome = m.home.name===teamName;
    const gf = isHome ? m.home_score : m.away_score;
    const ga = isHome ? m.away_score : m.home_score;
    if(gf==null || ga==null) return null;
    if(gf>ga) return "w";
    if(gf<ga) return "l";
    return "d";
  }).filter(Boolean);
}
function formDots(results){
  if(!results.length) return "—";
  const labels={w:"V",d:"N",l:"D"};
  return `<div class="form-dots">${results.map(r=>`<span class="${r}">${labels[r]}</span>`).join("")}</div>`;
}

function renderStandings(rows){
  const sorted = [...rows].sort((a,b)=>(a.position??999)-(b.position??999));
  const anyPlayed = sorted.some(r => (detailValue(r,129)||0) > 0);
  document.querySelector("#standingsNote").textContent = anyPlayed
    ? "Classement à jour après la dernière journée jouée. Zones qualification/relégation approximatives (règle générique, à vérifier selon la compétition)."
    : "La saison n'a pas encore commencé : tous les compteurs sont à zéro, c'est normal.";

  const head = `<tr><th class="team">Équipe</th><th>MJ</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>Diff</th><th>Pts</th><th class="form">5 derniers</th></tr>`;
  const body = sorted.map(r=>{
    const p = r.participant || {};
    const crest = p.image_path ? `<img src="${p.image_path}" alt="" onerror="this.remove()">` : "";
    const mj = detailValue(r,129), v=detailValue(r,130), n=detailValue(r,131), d=detailValue(r,132);
    const bp = detailValue(r,133), bc = detailValue(r,134), diff = detailValue(r,179);
    const diffTxt = diff==null ? "—" : (diff>0?`+${diff}`:diff);
    const zone = zoneFor(r.position, sorted.length);
    const form = p.name ? formDots(last5Form(p.name, currentLeagueId)) : "—";
    return `<tr class="${zone}"><td class="team"><span class="pos">${r.position??"—"}</span>${crest}${p.name||"—"}</td><td>${mj??"—"}</td><td>${v??"—"}</td><td>${n??"—"}</td><td>${d??"—"}</td><td>${bp??"—"}</td><td>${bc??"—"}</td><td>${diffTxt}</td><td class="pts">${r.points??"—"}</td><td>${form}</td></tr>`;
  }).join("");
  document.querySelector("#standingsTable").innerHTML = head + body;
}

// NOTE : la forme exacte des entrées "topscorers" (buts + passes mélangés,
// distingués par leur type) n'a pas encore pu être vérifiée sur un vrai
// exemple non vide (0 but marqué à ce jour cette saison). Le filtrage et le
// nom du champ de total ci-dessous sont donc une meilleure estimation à
// reconfirmer dès qu'une vraie entrée existera.
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
// xG/xA par joueur : pas encore confirmé sur un vrai exemple (0 but marqué à
// ce jour). La doc SportMonks indique que l'endpoint buteurs peut être trié
// par "n'importe quelle statistique", donc on tente une détection par mot-clé
// dans le même flux ; si rien ne matche, on affiche juste sans xG/xA plutôt
// que d'inventer une valeur.
function isXgEntry(entry){
  const code = (entry.type && (entry.type.code||entry.type.name||"")).toLowerCase();
  return code.includes("expected") && code.includes("goal") && !code.includes("assist");
}
function isXaEntry(entry){
  const code = (entry.type && (entry.type.code||entry.type.name||"")).toLowerCase();
  return (code.includes("expected") && code.includes("assist")) || code.includes("xa");
}
function playerKey(entry){
  return entry.player_id || (entry.player && entry.player.id) || (entry.player && entry.player.name);
}
function renderPlayerList(rootId, noteId, entries, expectedEntries, expectedLabel, emptyMsg){
  const root = document.querySelector(rootId);
  if(!entries.length){
    document.querySelector(noteId).textContent = emptyMsg;
    root.innerHTML = "";
    return;
  }
  document.querySelector(noteId).textContent = `${entries.length} joueur${entries.length>1?"s":""}`;
  const expectedByPlayer = {};
  (expectedEntries||[]).forEach(e=>{ expectedByPlayer[playerKey(e)] = scorerValue(e); });
  root.innerHTML = entries.map((e,i)=>{
    const player = e.player || {};
    const team = e.participant || {};
    const photo = player.image_path ? `<img class="avatar" src="${player.image_path}" alt="" onerror="this.outerHTML='<i class=&quot;avatar&quot;></i>'">` : `<i class="avatar"></i>`;
    const xVal = expectedByPlayer[playerKey(e)];
    const xTxt = xVal!=null ? `<small>${expectedLabel} ${Number(xVal).toFixed(2)}</small>` : "";
    return `<div class="cl-prow"><span class="rank">${i+1}</span>${photo}<span class="pname">${player.display_name||player.name||"—"}<small>${team.name||""}</small></span><span class="pval">${scorerValue(e)??"—"}${xTxt}</span></div>`;
  }).join("");
}

function renderTopscorers(entries){
  const goals = entries.filter(isGoalEntry).sort((a,b)=>(scorerValue(b)||0)-(scorerValue(a)||0));
  const assists = entries.filter(isAssistEntry).sort((a,b)=>(scorerValue(b)||0)-(scorerValue(a)||0));
  const xg = entries.filter(isXgEntry);
  const xa = entries.filter(isXaEntry);
  renderPlayerList("#scorersList", "#scorersNote", goals, xg, "xG", "Aucun but marqué pour l'instant cette saison.");
  renderPlayerList("#assistsList", "#assistsNote", assists, xa, "xA", "Aucune passe décisive pour l'instant cette saison.");
}

init();
