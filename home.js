let league=null,season=null,club="all",matchday="all",searchDriven=false;
const search=document.querySelector("#matchSearch");
const seasonBlock=document.querySelector("#seasonBlock"),clubBlock=document.querySelector("#clubBlock"),resultsSection=document.querySelector("#resultsSection"),emptyPrompt=document.querySelector("#emptyPrompt");
const matchdayGrid=document.querySelector("#matchdayGrid"),clubsGrid=document.querySelector("#clubs"),matchesRoot=document.querySelector("#matches");

// Repli hors-ligne : instantané du 05/08/2026 (SportMonks, Premier League,
// matchs du 1er au 3 février 2025), utilisé si le site est ouvert en simple
// double-clic (sans hébergement) ou si data/matches.json est indisponible.
const FALLBACK_DATA = {
  "Premier League": [
    {id:"sportmonks:fixture:19134571", home:{name:"Nottingham Forest"}, away:{name:"Brighton & Hove Albion"}, home_score:7, away_score:0, kickoff:"2025-02-01T12:30:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134563", home:{name:"AFC Bournemouth"}, away:{name:"Liverpool"}, home_score:0, away_score:2, kickoff:"2025-02-01T15:00:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134567", home:{name:"Everton"}, away:{name:"Leicester City"}, home_score:4, away_score:0, kickoff:"2025-02-01T15:00:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134568", home:{name:"Ipswich Town"}, away:{name:"Southampton"}, home_score:1, away_score:2, kickoff:"2025-02-01T15:00:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134570", home:{name:"Newcastle United"}, away:{name:"Fulham"}, home_score:1, away_score:2, kickoff:"2025-02-01T15:00:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134572", home:{name:"Wolverhampton Wanderers"}, away:{name:"Aston Villa"}, home_score:2, away_score:0, kickoff:"2025-02-01T17:30:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134565", home:{name:"Brentford"}, away:{name:"Tottenham Hotspur"}, home_score:0, away_score:2, kickoff:"2025-02-02T14:00:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134569", home:{name:"Manchester United"}, away:{name:"Crystal Palace"}, home_score:0, away_score:2, kickoff:"2025-02-02T14:00:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134564", home:{name:"Arsenal"}, away:{name:"Manchester City"}, home_score:5, away_score:1, kickoff:"2025-02-02T16:30:00+00:00", status:"finished", season:2024},
    {id:"sportmonks:fixture:19134566", home:{name:"Chelsea"}, away:{name:"West Ham United"}, home_score:2, away_score:1, kickoff:"2025-02-03T20:00:00+00:00", status:"finished", season:2024}
  ]
};

let REAL_DATA = {};
let dataSource = "fallback";

function seasonLabel(year){ return `${year}–${String(year+1).slice(2)}` }

function isFeatured(m){
  const names = [m.home.name.toLowerCase(), m.away.name.toLowerCase()];
  return names.includes("arsenal") && names.includes("manchester city");
}
function tagFeatured(dataset){
  Object.values(dataset).forEach(list=>list.forEach(m=>m.featured=isFeatured(m)));
  return dataset;
}

REAL_DATA = tagFeatured(JSON.parse(JSON.stringify(FALLBACK_DATA)));

async function loadLiveData(){
  try{
    const res = await fetch("data/matches.json", {cache:"no-store"});
    if(!res.ok) throw new Error("data/matches.json indisponible");
    const payload = await res.json();
    if(!Array.isArray(payload.competitions)) throw new Error("format inattendu");
    const live = {};
    payload.competitions.forEach(entry=>{
      const name = entry.competition && entry.competition.name;
      if(name && Array.isArray(entry.matches)) live[name] = entry.matches;
    });
    if(Object.keys(live).length){
      REAL_DATA = tagFeatured(live);
      dataSource = "live";
    }
  }catch(err){
    // Pas grave : on garde le repli embarqué. Cas normal en local sans hébergement,
    // ou avant le premier passage du robot GitHub Actions.
  }
}

function matchesForLeague(name){
  return REAL_DATA[name] || [];
}

function buildClubButtons(){
  const matches = matchesForLeague(league).filter(m=>season===null || season===seasonLabel(m.season));
  const clubs = new Set();
  matches.forEach(m=>{clubs.add(m.home.name); clubs.add(m.away.name)});
  clubsGrid.innerHTML = '<button class="active" data-club="all"><i>' + matches.length + '</i><span>Tous</span></button>' +
    [...clubs].sort().map(name=>`<button data-club="${name.toLowerCase()}"><i>${name[0]}</i><span>${name}</span></button>`).join("");
  clubsGrid.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    club=b.dataset.club;
    clubsGrid.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));
    refresh();
  });
}

function matchdayGridInit(){
  for(let j=1;j<=38;j++){const b=document.createElement("button");b.textContent=`J${j}`;b.dataset.matchday=String(j);b.onclick=()=>{matchday=String(j);document.querySelectorAll("#matchdayGrid button").forEach(x=>x.classList.toggle("active",x===b));refresh()};matchdayGrid.appendChild(b)}
  document.querySelector('[data-matchday="all"]').onclick=()=>{matchday="all";document.querySelectorAll("#matchdayGrid button").forEach(x=>x.classList.toggle("active",x.dataset.matchday==="all"));refresh()};
}

function resetSelection(){
  league=null;season=null;club="all";matchday="all";searchDriven=false;
  document.querySelectorAll(".competition").forEach(b=>b.classList.remove("active"));
  document.querySelector("#seasonTabs").innerHTML="";
  document.querySelectorAll("#matchdayGrid button").forEach(b=>b.classList.toggle("active",b.dataset.matchday==="all"));
}
function buildSeasonTabs(){
  const seasons=new Set(matchesForLeague(league).map(m=>m.season));
  const sorted=[...seasons].sort((a,b)=>b-a);
  const tabs=document.querySelector("#seasonTabs");
  if(!sorted.length){tabs.innerHTML=`<span style="font-size:9px;color:var(--muted)">Aucune saison disponible pour cette compétition.</span>`;return}
  tabs.innerHTML=sorted.map(y=>`<button data-season="${y}">${seasonLabel(y)}</button>`).join("");
  tabs.querySelectorAll("button").forEach(b=>b.onclick=()=>{selectSeason(b.textContent);refresh()});
}
function selectLeague(name,fromSearch){
  league=name;season=null;club="all";matchday="all";searchDriven=!!fromSearch;
  document.querySelectorAll(".competition").forEach(b=>b.classList.toggle("active",b.dataset.league===league));
  document.querySelectorAll("#matchdayGrid button").forEach(b=>b.classList.toggle("active",b.dataset.matchday==="all"));
  buildSeasonTabs();
  buildClubButtons();
}
function selectSeason(label){
  season=label;club="all";
  document.querySelectorAll("#seasonTabs button").forEach(b=>b.classList.toggle("active",b.textContent===season));
  buildClubButtons();
}

function formatDate(iso){
  const d=new Date(iso);
  return d.toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
}

function renderCard(m){
  const homeInit=m.home.name[0], awayInit=m.away.name[0];
  const score = (m.home_score!=null && m.away_score!=null) ? `${m.home_score}–${m.away_score}` : "—";
  const dateTxt = formatDate(m.kickoff);
  const badge = dataSource==="live" ? "Donnée réelle · mise à jour auto" : "Donnée réelle · SportMonks (05/08)";
  const fixtureId = (m.id||"").split(":").pop();
  if(m.status==="finished" && fixtureId){
    return `<a class="match-card" href="match.html?id=${fixtureId}"><div class="cover"><span class="status">${badge}</span><div class="club-score"><i class="ars">${homeInit}</i><strong>${score}</strong><i class="mci">${awayInit}</i></div></div><div class="match-info"><span>PREMIER LEAGUE</span><h3>${m.home.name} — ${m.away.name}</h3><p>${dateTxt}</p><div><b>Ouvrir le MatchLab</b><i>→</i></div></div></a>`;
  }
  return `<div class="match-card disabled"><div class="cover"><span class="status muted">${badge}</span><div class="club-score"><i>${homeInit}</i><strong>${score}</strong><i>${awayInit}</i></div></div><div class="match-info"><span>PREMIER LEAGUE</span><h3>${m.home.name} — ${m.away.name}</h3><p>${dateTxt}</p><div><b>MatchLab à venir</b></div></div></div>`;
}

function refresh(){
  seasonBlock.hidden=!league;
  clubBlock.hidden=!league||!season;
  resultsSection.hidden=!(league&&season);
  emptyPrompt.hidden=!!(league&&season);
  if(!league||!season)return;
  const q=search.value.toLowerCase().trim();
  const all=matchesForLeague(league);
  const filtered=all.filter(m=>{
    if(season!==seasonLabel(m.season))return false;
    if(matchday!=="all" && m.matchday!==matchday)return false;
    if(club!=="all" && m.home.name.toLowerCase()!==club && m.away.name.toLowerCase()!==club)return false;
    if(q && !(m.home.name.toLowerCase()+" "+m.away.name.toLowerCase()+" "+league.toLowerCase()).includes(q))return false;
    return true;
  });
  document.querySelector("#resultTitle").textContent=`${league} · ${season}`;
  document.querySelector("#resultCount").textContent=`${filtered.length} match${filtered.length>1?"s":""}`;
  matchesRoot.innerHTML = filtered.length
    ? filtered.map(renderCard).join("")
    : `<div class="no-results"><b>Aucun match chargé</b><p>Cette sélection sera alimentée après élargissement de la couverture SportMonks.</p></div>`;
}

document.querySelectorAll(".competition").forEach(button=>button.onclick=()=>{selectLeague(button.dataset.league,false);refresh()});
search.oninput=()=>{
  const q=search.value.toLowerCase().trim();
  const hasMatch = Object.values(REAL_DATA).some(list=>list.some(m=>(m.home.name+" "+m.away.name).toLowerCase().includes(q)));
  if(q && hasMatch && (!league||!season)){
    selectLeague("Premier League",true);
    selectSeason(seasonLabel(REAL_DATA["Premier League"][0].season));
  }else if(!q&&searchDriven){
    resetSelection();
  }
  refresh();
};

matchdayGridInit();
function updateCompetitionCounts(){
  document.querySelectorAll(".competition").forEach(btn=>{
    const league=btn.dataset.league;
    const count=(REAL_DATA[league]||[]).length;
    const em=btn.querySelector("em");
    if(em) em.textContent = `${count} match${count>1?"s":""}`;
  });
}

loadLiveData().then(()=>{updateCompetitionCounts();refresh()});
updateCompetitionCounts();
refresh();
