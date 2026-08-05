const events=[
 {t:2,d:"2’",type:"goal",team:"ARS",title:"Ødegaard",detail:"But après une perte de balle de City",h:1,a:0},
 {t:6,d:"6’",type:"var",team:"ARS",title:"Martinelli",detail:"But refusé pour hors-jeu",h:1,a:0},
 {t:55,d:"55’",type:"goal",team:"MCI",title:"Haaland",detail:"Égalisation de la tête sur un centre de Savinho",h:1,a:1},
 {t:56,d:"56’",type:"goal",team:"ARS",title:"Partey",detail:"Arsenal reprend l’avantage 105 secondes plus tard",h:2,a:1},
 {t:62,d:"62’",type:"goal",team:"ARS",title:"Lewis-Skelly",detail:"Premier but avec l’équipe première",h:3,a:1},
 {t:72,d:"72’",type:"sub",team:"MCI",title:"Triple changement",detail:"De Bruyne, Gündoğan et McAtee entrent",h:3,a:1},
 {t:76,d:"76’",type:"goal",team:"ARS",title:"Havertz",detail:"But en transition rapide",h:4,a:1},
 {t:84,d:"84’",type:"sub",team:"ARS",title:"Double changement",detail:"Nwaneri et Merino entrent",h:4,a:1},
 {t:90,d:"90’",type:"sub",team:"ARS",title:"Sterling entre",detail:"Dernier changement d’Arsenal",h:4,a:1},
 {t:93,d:"90+3’",type:"goal",team:"ARS",title:"Nwaneri",detail:"Frappe enroulée pour conclure",h:5,a:1}
];
const points=[
 {t:0,p:[.43,.27,.30]},{t:2,p:[.70,.20,.10]},{t:20,p:[.66,.23,.11]},{t:45,p:[.58,.28,.14]},
 {t:55,p:[.43,.39,.18]},{t:56,p:[.72,.23,.05]},{t:62,p:[.91,.08,.01]},{t:76,p:[.995,.005,0]},{t:93,p:[1,0,0]}
];
let selected=0,series="all";
const colors=["#d9705c","#d6a443","#76a9c0"],names=["ARS","NUL","MCI"],seriesKeys=["ars","draw","mci"];
const x=t=>48+t/95*830,y=p=>24+(1-p)*270;
function path(idx){const p=points.map(v=>[x(v.t),y(v.p[idx])]);let d=`M${p[0][0]},${p[0][1]}`;for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],mx=(a[0]+b[0])/2;d+=` C${mx},${a[1]} ${mx},${b[1]} ${b[0]},${b[1]}`}return d}
function probsAt(t){let result=points[0].p;for(const p of points)if(p.t<=t)result=p.p;return result}
function scoreBefore(i){return i?{h:events[i-1].h,a:events[i-1].a}:{h:0,a:0}}
function pct(v){return Math.round(v*100)+" %"}
function icon(type){return type==="goal"?"⚽":type==="red"?'<span class="red-card-icon"></span>':type==="sub"?'<span class="sub-icon"><i>↗</i><b>↙</b></span>':'<span class="var-badge">VAR</span>'}
function renderChart(){
 let svg="";[0,.25,.5,.75,1].forEach(v=>svg+=`<line class="grid" x1="48" y1="${y(v)}" x2="878" y2="${y(v)}"/><text x="5" y="${y(v)+3}">${v*100}%</text>`);[0,15,30,45,60,75,90].forEach(v=>svg+=`<text x="${x(v)}" y="320" text-anchor="middle">${v}’</text>`);colors.forEach((c,i)=>svg+=`<path class="curve ${series===seriesKeys[i]?"focus":""}" stroke="${c}" d="${path(i)}"/>`);document.querySelector("#chart").innerHTML=svg;document.querySelector("#chart").classList.toggle("dim",series!=="all");
 document.querySelector("#chartEvents").innerHTML=events.map((e,i)=>(e.type==="goal"||e.type==="red")?`<button class="chart-event ${i===selected?'active':''}" data-i="${i}" style="--x:${5.3+e.t/95*92.2}%;--y:${12+(i%3)*10}%" title="${e.d} · ${e.title}">${icon(e.type)}</button>`:"").join("");document.querySelectorAll(".chart-event").forEach(b=>b.onclick=()=>select(+b.dataset.i));
}
function boxes(p,old){return `<div class="probs">${p.map((v,i)=>`<div class="prob"><b>${pct(v)}</b><span>${names[i]}</span>${old?`<em>${Math.round((v-old[i])*100)>0?'+':''}${Math.round((v-old[i])*100)} pts</em>`:''}</div>`).join('')}</div>`}
function renderCompare(){let e=events[selected],before=scoreBefore(selected),bp=probsAt(Math.max(0,e.t-.1)),ap=probsAt(e.t);document.querySelector("#before").innerHTML=`<small>Juste avant · ${e.d}</small><h3>État avant l’événement</h3><div class="state-score">${before.h}–${before.a}</div>${boxes(bp)}`;document.querySelector("#after").innerHTML=`<small>Juste après · ${e.d}</small><h3>${icon(e.type)} ${e.title}</h3><div class="state-score">${e.h}–${e.a}</div>${boxes(ap,bp)}`}
function feedRow(e,i){return `<button class="feed-event ${i===selected?'active':''}" data-i="${i}"><time>${e.d}</time><span class="symbol">${icon(e.type)}</span><b>${e.title}<small> · ${e.detail}</small></b>${e.type==='goal'?`<strong>${e.h}–${e.a}</strong>`:''}</button>`}
function renderFeed(){let first=events.map((e,i)=>({e,i})).filter(x=>x.e.t<46),second=events.map((e,i)=>({e,i})).filter(x=>x.e.t>=46),block=(title,score,a)=>`<div class="period"><span>${title}</span><b>${score}</b></div>${a.map(x=>feedRow(x.e,x.i)).join('')}`;document.querySelector("#feed").innerHTML=block("1re mi-temps","1–0",first)+block("2e mi-temps","5–1",second);document.querySelectorAll(".feed-event").forEach(b=>b.onclick=()=>select(+b.dataset.i))}
function select(i){selected=i;render()}
function render(){renderChart();renderCompare();renderFeed()}
document.querySelectorAll(".legend button").forEach(b=>b.onclick=()=>{series=b.dataset.series;document.querySelectorAll(".legend button").forEach(x=>x.classList.toggle("active",x===b));renderChart()});render();
document.querySelectorAll(".page-tabs button").forEach(button=>button.onclick=()=>{document.querySelectorAll(".page-tabs button").forEach(b=>b.classList.toggle("active",b===button));document.querySelectorAll(".page-tab-panel").forEach(panel=>panel.classList.toggle("active",panel.id===`tab-${button.dataset.tab}`))});
document.querySelectorAll(".studio-tabs button").forEach(button=>button.onclick=()=>{document.querySelectorAll(".studio-tabs button").forEach(b=>b.classList.toggle("active",b===button));document.querySelectorAll(".output").forEach(panel=>panel.classList.toggle("active",panel.id===button.dataset.output))});
async function copyText(text,button){try{await navigator.clipboard.writeText(text);let old=button.textContent;button.textContent="Copié ✓";setTimeout(()=>button.textContent=old,1500)}catch{button.textContent="Sélectionnez le texte"}}
document.querySelectorAll(".copy-button").forEach(button=>button.onclick=()=>copyText(document.querySelector(`#${button.dataset.copy}`).innerText,button));
document.querySelector("#copySource").onclick=()=>copyText("Arsenal 5–1 Manchester City · Premier League J24 · 02/02/2025 · Stats : possession 46–54, tirs 12–7, xG 1,04–0,81 · Sources : PremierLeague.com et ManCity.com",document.querySelector("#copySource"));
const periodData={full:{groups:[{g:"Attaque",rows:[["12","Tirs","7"],["1,04","xG","0,81"]]},{g:"Possession et construction",rows:[["46 %","Possession","54 %"],["341","Passes réussies","422"],["5","Corners","2"]]},{g:"Discipline",rows:[["6","Fautes","7"]]}],pending:["Tirs cadrés","Arrêts du gardien","Touches dans la surface"],note:"Source : rapport officiel Manchester City."},first:{groups:null,pending:null,note:"Les statistiques de première période seront injectées par API-Football. Aucune valeur n’est simulée."},second:{groups:null,pending:null,note:"Les statistiques de seconde période seront injectées par API-Football. Aucune valeur n’est simulée."}};
function parseStatNum(v){return parseFloat(String(v).replace("%","").replace(",","."))}
function statRow(r){const a=parseStatNum(r[0]),b=parseStatNum(r[2]),total=a+b||1,pa=Math.round(a/total*100),pb=100-pa;return `<div class="stat-row"><div class="stat-label"><span>${r[0]}</span><b>${r[1]}</b><span>${r[2]}</span></div><div class="stat-bar"><i class="home" style="width:${pa}%"></i><i class="away" style="width:${pb}%"></i></div></div>`}
function renderStats(period="full"){const data=periodData[period],root=document.querySelector("#periodStats");
 if(!data.groups){root.innerHTML=`<div class="stats-empty"><strong>En attente de l’API</strong><span>La structure est réservée ; les données ne sont pas encore disponibles.</span></div>`;document.querySelector("#periodNote").textContent=data.note;return}
 root.innerHTML=data.groups.map(group=>`<div class="stat-group"><h4>${group.g}</h4>${group.rows.map(statRow).join("")}</div>`).join("")+`<div class="stat-group pending"><h4>Autres indicateurs</h4>${data.pending.map(p=>`<div class="stat-row pending-row"><span>${p}</span><em>Non disponible sur cette source</em></div>`).join("")}</div>`;
 document.querySelector("#periodNote").textContent=data.note}
document.querySelectorAll(".period-tabs button").forEach(button=>button.onclick=()=>{document.querySelectorAll(".period-tabs button").forEach(b=>b.classList.toggle("active",b===button));renderStats(button.dataset.period)});renderStats();
const carouselSlides=[
 {k:"PREMIER LEAGUE · J24",title:"Arsenal 5–1\nManchester City",body:"2 février 2025 · Emirates Stadium",cover:true},
 {k:"LE CONTRASTE",title:"46 %",body:"Arsenal a moins eu le ballon que City — et a gagné 5–1."},
 {k:"LE FAUX CALME",title:"1–1 · 55’",body:"Haaland vient d’égaliser. Le match semble relancé."},
 {k:"LA BASCULE",title:"105 secondes",body:"Le temps entre l’égalisation de City et le but de Partey.",accent:true},
 {k:"L’EFFONDREMENT",title:"4 buts",body:"Arsenal marque quatre fois après la 55e minute."},
 {k:"LA LECTURE",title:"Chirurgical.",body:"12 tirs, 1,04 xG, 5 buts. Le score amplifie une bascule réelle."}
];
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function wrap(ctx,text,x,y,max,line){const words=text.split(" ");let row="",cy=y;for(const word of words){const test=row+word+" ";if(ctx.measureText(test).width>max&&row){ctx.fillText(row.trim(),x,cy);row=word+" ";cy+=line}else row=test}ctx.fillText(row.trim(),x,cy)}
function drawSlide(canvas,slide,index,assets){const c=canvas.getContext("2d"),ink="#20304A",ivory="#FAF7F0",coral="#D9705C",greige="#E6DED2",white="#FFFDF9";c.fillStyle=slide.accent?coral:ivory;c.fillRect(0,0,800,800);c.fillStyle=slide.accent?"rgba(255,255,255,.13)":greige;rounded(c,30,30,740,740,28);c.fillStyle=slide.accent?"rgba(32,48,74,.2)":ink;rounded(c,46,46,708,190,23);if(slide.cover){c.globalAlpha=.12;c.fillStyle=white;for(let x=45;x<755;x+=55)c.fillRect(x,46,26,190);c.globalAlpha=1;if(assets.ars?.complete)c.drawImage(assets.ars,85,78,110,110);else{c.fillStyle=coral;rounded(c,85,78,110,110,22);c.fillStyle=white;c.font="800 45px Arial";c.fillText("A",124,148)}if(assets.mci?.complete)c.drawImage(assets.mci,605,78,110,110);else{c.fillStyle="#78abc2";rounded(c,605,78,110,110,22);c.fillStyle=white;c.font="800 45px Arial";c.fillText("M",638,148)}c.fillStyle=white;c.textAlign="center";c.font="800 64px Arial";c.fillText("5 — 1",400,150);c.textAlign="left"}c.fillStyle=slide.accent?white:coral;c.font="800 18px Arial";c.fillText(slide.k,70,285);c.fillRect(70,307,82,5);c.fillStyle=slide.accent?white:ink;c.font=slide.cover?"700 49px Georgia":"700 76px Georgia";slide.title.split("\n").forEach((t,i)=>c.fillText(t,70,400+i*(slide.cover?62:88)));c.font="500 28px Arial";wrap(c,slide.body,70,590,600,38);c.fillStyle=slide.accent?"rgba(255,255,255,.75)":"#6f7887";c.font="700 15px Arial";c.fillText(`ARSENAL — MANCHESTER CITY · ${String(index+1).padStart(2,"0")}/06`,70,713);if(assets.logo?.complete){c.globalAlpha=.96;c.drawImage(assets.logo,675,665,72,72);c.globalAlpha=1}else{c.fillStyle=slide.accent?white:ink;c.font="900 17px Arial";c.fillText("FACT XI",680,710)}}
function loadImage(src,crossOrigin=false){return new Promise(resolve=>{const img=new Image();if(crossOrigin)img.crossOrigin="anonymous";img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src})}
async function generateCarousel(){const root=document.querySelector("#carouselExports");root.innerHTML="<p>Génération des six images…</p>";const [logo,ars,mci]=await Promise.all([loadImage("Logo%20Transparent.png"),loadImage("https://resources.premierleague.com/premierleague/badges/100/t3.png",true),loadImage("https://resources.premierleague.com/premierleague/badges/100/t43.png",true)]);root.innerHTML="";carouselSlides.forEach((slide,i)=>{const item=document.createElement("article"),canvas=document.createElement("canvas"),download=document.createElement("button");canvas.width=800;canvas.height=800;drawSlide(canvas,slide,i,{logo,ars,mci});download.textContent=`Télécharger ${i+1}/6 · PNG`;download.onclick=()=>{const a=document.createElement("a");a.download=`FACT-XI_Arsenal-Man-City_${i+1}-06_800x800.png`;try{a.href=canvas.toDataURL("image/png");a.click()}catch{alert("L’export est bloqué par le chargement distant des écussons. Rechargez puis réessayez.")}};item.append(canvas,download);root.append(item)})}
document.querySelector("#generateCarousel").onclick=generateCarousel;
document.querySelector("#carousel .output-head span").textContent="CARROUSEL · 6 IMAGES · 800 × 800 PX";
generateCarousel();
