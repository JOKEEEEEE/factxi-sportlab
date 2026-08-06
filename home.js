let league=null,season=null,club="all",matchday="all",searchDriven=false,view="grid";
const search=document.querySelector("#matchSearch");
const seasonBlock=document.querySelector("#seasonBlock"),clubBlock=document.querySelector("#clubBlock"),resultsSection=document.querySelector("#resultsSection"),emptyPrompt=document.querySelector("#emptyPrompt");
const matchdayGrid=document.querySelector("#matchdayGrid"),clubsGrid=document.querySelector("#clubs"),matchesRoot=document.querySelector("#matches");

// Repli hors-ligne : instantané du 05/08/2026 (SportMonks, Premier League,
// matchs du 1er au 3 février 2025), utilisé si le site est ouvert en simple
// double-clic (sans hébergement) ou si data/matches.json est indisponible.
const FALLBACK_DATA = {
  "Premier League": [
    {id:"sportmonks:fixture:19134571", home:{name:"Nottingham Forest",image_path:"https://cdn.sportmonks.com/images/soccer/teams/31/63.png"}, away:{name:"Brighton & Hove Albion",image_path:"https://cdn.sportmonks.com/images/soccer/teams/14/78.png"}, home_score:7, away_score:0, kickoff:"2025-02-01T12:30:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134563", home:{name:"AFC Bournemouth",image_path:"https://cdn.sportmonks.com/images/soccer/teams/20/52.png"}, away:{name:"Liverpool",image_path:"https://cdn.sportmonks.com/images/soccer/teams/8/8.png"}, home_score:0, away_score:2, kickoff:"2025-02-01T15:00:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134567", home:{name:"Everton",image_path:"https://cdn.sportmonks.com/images/soccer/teams/13/13.png"}, away:{name:"Leicester City",image_path:"https://cdn.sportmonks.com/images/soccer/teams/10/42.png"}, home_score:4, away_score:0, kickoff:"2025-02-01T15:00:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134568", home:{name:"Ipswich Town",image_path:"https://cdn.sportmonks.com/images/soccer/teams/20/116.png"}, away:{name:"Southampton",image_path:"https://cdn.sportmonks.com/images/soccer/teams/1/65.png"}, home_score:1, away_score:2, kickoff:"2025-02-01T15:00:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134570", home:{name:"Newcastle United",image_path:"https://cdn.sportmonks.com/images/soccer/teams/20/20.png"}, away:{name:"Fulham",image_path:"https://cdn.sportmonks.com/images/soccer/teams/11/11.png"}, home_score:1, away_score:2, kickoff:"2025-02-01T15:00:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134572", home:{name:"Wolverhampton Wanderers",image_path:"https://cdn.sportmonks.com/images/soccer/teams/29/29.png"}, away:{name:"Aston Villa",image_path:"https://cdn.sportmonks.com/images/soccer/teams/15/15.png"}, home_score:2, away_score:0, kickoff:"2025-02-01T17:30:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134565", home:{name:"Brentford",image_path:"https://cdn.sportmonks.com/images/soccer/teams/12/236.png"}, away:{name:"Tottenham Hotspur",image_path:"https://cdn.sportmonks.com/images/soccer/teams/6/6.png"}, home_score:0, away_score:2, kickoff:"2025-02-02T14:00:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134569", home:{name:"Manchester United",image_path:"https://cdn.sportmonks.com/images/soccer/teams/14/14.png"}, away:{name:"Crystal Palace",image_path:"https://cdn.sportmonks.com/images/soccer/teams/19/51.png"}, home_score:0, away_score:2, kickoff:"2025-02-02T14:00:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134564", home:{name:"Arsenal",image_path:"https://cdn.sportmonks.com/images/soccer/teams/19/19.png"}, away:{name:"Manchester City",image_path:"https://cdn.sportmonks.com/images/soccer/teams/9/9.png"}, home_score:5, away_score:1, kickoff:"2025-02-02T16:30:00+00:00", status:"finished", season:2024, round:"24"},
    {id:"sportmonks:fixture:19134566", home:{name:"Chelsea",image_path:"https://cdn.sportmonks.com/images/soccer/teams/18/18.png"}, away:{name:"West Ham United",image_path:"https://cdn.sportmonks.com/images/soccer/teams/1/1.png"}, home_score:2, away_score:1, kickoff:"2025-02-03T20:00:00+00:00", status:"finished", season:2024, round:"24"}
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

function teamLogo(name){
  for(const list of Object.values(REAL_DATA)){
    for(const m of list){
      if(m.home.name===name && m.home.image_path) return m.home.image_path;
      if(m.away.name===name && m.away.image_path) return m.away.image_path;
    }
  }
  return null;
}
function crestHtml(name,logoUrl){
  return logoUrl
    ? `<img class="club-logo" src="${logoUrl}" alt="" loading="lazy" onerror="this.parentElement.textContent='${name[0]}'">`
    : name[0];
}

function buildClubButtons(){
  const matches = matchesForLeague(league).filter(m=>season===null || season===seasonLabel(m.season));
  const clubs = new Set();
  matches.forEach(m=>{clubs.add(m.home.name); clubs.add(m.away.name)});
  clubsGrid.innerHTML = '<button class="active" data-club="all"><i>' + matches.length + '</i><span>Tous</span></button>' +
    [...clubs].sort().map(name=>`<button data-club="${name.toLowerCase()}"><i>${crestHtml(name,teamLogo(name))}</i><span>${name}</span></button>`).join("");
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
  const seasons=new Set(matchesForLeague(league).map(m=>Number(m.season)).filter(y=>!Number.isNaN(y)));
  const sorted=[...seasons].sort((a,b)=>b-a); // saison la plus récente en premier
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
  const homeLogo=crestHtml(m.home.name,m.home.image_path), awayLogo=crestHtml(m.away.name,m.away.image_path);
  const score = (m.home_score!=null && m.away_score!=null) ? `${m.home_score}–${m.away_score}` : "—";
  const dateTxt = formatDate(m.kickoff);
  const badge = dataSource==="live" ? "Donnée réelle · mise à jour auto" : "Donnée réelle · SportMonks (05/08)";
  const fixtureId = (m.id||"").split(":").pop();
  const roundTxt = m.round ? `J${m.round}` : "";
  if(m.status==="finished" && fixtureId){
    return `<a class="match-card" href="match.html?id=${fixtureId}"><div class="cover"><span class="status">${badge}</span><div class="club-score"><i>${homeLogo}</i><strong>${score}</strong><i>${awayLogo}</i></div></div><div class="match-info"><span>${roundTxt||"PREMIER LEAGUE"}</span><h3>${m.home.name} — ${m.away.name}</h3><p>${dateTxt}</p><div class="list-score"><i>${homeLogo}</i><b>${score}</b><i>${awayLogo}</i></div><div><b>Ouvrir le MatchLab</b><i>→</i></div></div></a>`;
  }
  return `<div class="match-card disabled"><div class="cover"><span class="status muted">${badge}</span><div class="club-score"><i>${homeLogo}</i><strong>${score}</strong><i>${awayLogo}</i></div></div><div class="match-info"><span>${roundTxt||"PREMIER LEAGUE"}</span><h3>${m.home.name} — ${m.away.name}</h3><p>${dateTxt}</p><div class="list-score"><i>${homeLogo}</i><b>${score}</b><i>${awayLogo}</i></div><div><b>MatchLab à venir</b></div></div></div>`;
}

function refresh(){
  seasonBlock.hidden=!league;
  clubBlock.hidden=!league||!season;
  resultsSection.hidden=!(league&&season);
  emptyPrompt.hidden=!!(league&&season);
  if(!league||!season)return;
  const q=search?search.value.toLowerCase().trim():"";
  const all=matchesForLeague(league);
  let filtered=all.filter(m=>{
    if(season!==seasonLabel(m.season))return false;
    if(matchday!=="all" && String(m.round)!==matchday)return false;
    if(club!=="all" && m.home.name.toLowerCase()!==club && m.away.name.toLowerCase()!==club)return false;
    if(q && !(m.home.name.toLowerCase()+" "+m.away.name.toLowerCase()+" "+league.toLowerCase()).includes(q))return false;
    return true;
  });
  // Si aucun filtre journée/club précis n'est choisi, on trie par journée pour la lisibilité.
  if(matchday==="all" && club==="all"){
    filtered=[...filtered].sort((a,b)=>{
      const ra=Number(a.round), rb=Number(b.round);
      if(!Number.isNaN(ra) && !Number.isNaN(rb) && ra!==rb) return ra-rb;
      return new Date(a.kickoff)-new Date(b.kickoff);
    });
  }
  document.querySelector("#resultTitle").textContent=`${league} · ${season}`;
  document.querySelector("#resultCount").textContent=`${filtered.length} match${filtered.length>1?"s":""}`;
  matchesRoot.className = "matches" + (view==="list" ? " view-list" : "");
  matchesRoot.innerHTML = filtered.length
    ? filtered.map(renderCard).join("")
    : `<div class="no-results"><b>Aucun match chargé</b><p>Cette sélection sera alimentée après élargissement de la couverture SportMonks.</p></div>`;
}

document.querySelectorAll(".competition").forEach(button=>button.onclick=()=>{selectLeague(button.dataset.league,false);refresh()});
document.querySelectorAll(".view-toggle button").forEach(button=>button.onclick=()=>{
  view=button.dataset.view;
  document.querySelectorAll(".view-toggle button").forEach(b=>b.classList.toggle("active",b===button));
  refresh();
});
if(search){
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
}

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
