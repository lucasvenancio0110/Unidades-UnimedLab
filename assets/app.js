import { UNIDADES, CITIES } from '../data/unidades.js';

const CFG = {
  center: [-25.445, -49.285], zoom: 10,
  geocoder: 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates',
  bairros: 'https://geocuritiba.ippuc.org.br/server/rest/services/GeoCuritiba/Publico_Interno_GeoCuritiba_BaseCartografica_para_BC/MapServer/44/query',
  municipios: 'https://geocuritiba.ippuc.org.br/server/rest/services/GeoCuritiba/Publico_Interno_GeoCuritiba_BaseCartografica_para_BC/MapServer/43/query',
  cache: 'unimedlab-coords-v4'
};

const $ = s => document.querySelector(s);
const state = { units: UNIDADES.map(u => ({...u})), ref: null, activeCity: 'Todas', filter: '', pick: false, markers: new Map(), bairrosGeo: null };
const els = {
  form: $('#placeSearchForm'), input: $('#placeSearchInput'), clear: $('#clearPlaceSearch'), status: $('#searchStatus'), suggestions: $('#searchSuggestions'),
  searchBtn: $('#searchButton'), locationBtn: $('#myLocationButton'), pickBtn: $('#clickMapModeButton'), cancelPick: $('#cancelMapPickButton'), hint: $('#mapHint'),
  nearest: $('#nearestSection'), nearestList: $('#nearestList'), refLabel: $('#referenceLabel'), clearRef: $('#clearReferenceButton'),
  cityFilters: $('#cityFilters'), unitFilter: $('#unitSearchInput'), unitsList: $('#unitsList'), unitsCount: $('#unitsCount'), fit: $('#fitAllButton'),
  bairrosBtn: $('#toggleNeighborhoodsButton'), municipiosBtn: $('#toggleMunicipalitiesButton'), unitsBtn: $('#toggleUnitsButton'),
  loading: $('#loadingOverlay'), loadingText: $('#loadingText'), toast: $('#toast')
};

const map = L.map('map', { minZoom: 8, maxZoom: 19, zoomControl: true }).setView(CFG.center, CFG.zoom);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
const unitLayer = L.layerGroup().addTo(map), refLayer = L.layerGroup().addTo(map), bairroLabels = L.layerGroup().addTo(map), municipioLabels = L.layerGroup().addTo(map);
let bairroLayer = null, municipioLayer = null;

const esc = (v='') => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const norm = (v='') => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const address = u => [u.address,u.neighborhood,u.city,'PR',u.cep,'Brasil'].filter(Boolean).join(', ');
const gm = u => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.lat ? `${u.lat},${u.lng}` : address(u))}`;
const route = u => { const p=new URLSearchParams({api:'1',destination:u.lat?`${u.lat},${u.lng}`:address(u),travelmode:'driving'}); if(state.ref) p.set('origin',`${state.ref.lat},${state.ref.lng}`); return `https://www.google.com/maps/dir/?${p}`; };
const waze = u => `https://www.waze.com/ul?q=${encodeURIComponent(u.lat?`${u.lat},${u.lng}`:address(u))}&navigate=yes`;

function pin(type='') { return L.divIcon({ className:'unit-pin', html:`<div class="unit-pin-inner ${type}"></div>`, iconSize:[32,38], iconAnchor:[16,34], popupAnchor:[0,-30] }); }
const refIcon = L.divIcon({ className:'reference-pin', html:'<div class="reference-pin-inner"></div>', iconSize:[24,24], iconAnchor:[12,12] });
function popup(u){ return `<div class="popup-title">${esc(u.name)}</div><div class="popup-address">${esc(u.address)}<br>${esc(u.neighborhood)} • ${esc(u.city)}${u.detail?`<br>${esc(u.detail)}`:''}</div><div class="popup-actions"><a href="${gm(u)}" target="_blank">Google Maps</a><a href="${route(u)}" target="_blank">Traçar rota</a></div>`; }

async function geocode(q, max=5){
  const p=new URLSearchParams({f:'json',SingleLine:q,outFields:'Match_addr,City,Subregion,Region,Postal',countryCode:'BRA',maxLocations:String(max),location:'-49.28,-25.44',distance:'80000'});
  const r=await fetch(`${CFG.geocoder}?${p}`); if(!r.ok) throw new Error('Busca indisponível');
  const j=await r.json(); return (j.candidates||[]).map(c=>({label:c.address,lat:c.location?.y,lng:c.location?.x,score:c.score})).filter(x=>Number.isFinite(x.lat));
}

async function locateUnits(){
  let cache={}; try{ cache=JSON.parse(localStorage.getItem(CFG.cache)||'{}'); }catch{}
  for(const u of state.units) if(cache[u.id]) Object.assign(u,cache[u.id]);
  const queue=state.units.filter(u=>!Number.isFinite(u.lat));
  const workers=Array.from({length:Math.min(5,queue.length)},async()=>{ while(queue.length){ const u=queue.shift(); try{ let r=await geocode(`${u.name}, ${address(u)}`,1); if(!r.length) r=await geocode(address(u),1); if(r[0]) Object.assign(u,{lat:r[0].lat,lng:r[0].lng}); }catch(e){ console.warn(u.name,e); } } });
  await Promise.all(workers);
  const out={}; state.units.forEach(u=>{if(Number.isFinite(u.lat))out[u.id]={lat:u.lat,lng:u.lng};}); localStorage.setItem(CFG.cache,JSON.stringify(out));
}

function drawUnits(){
  unitLayer.clearLayers(); state.markers.clear();
  state.units.forEach(u=>{ if(!Number.isFinite(u.lat)) return; const type=['shopping','hospital','mega','new'].includes(u.type)?u.type:''; const m=L.marker([u.lat,u.lng],{icon:pin(type),title:u.name}).bindPopup(popup(u)).on('click',()=>selectUnit(u.id,false)); m.addTo(unitLayer); state.markers.set(u.id,m); });
}

function filtered(){ const q=norm(state.filter); return state.units.filter(u=>(state.activeCity==='Todas'||u.city===state.activeCity)&&(!q||norm(`${u.name} ${u.neighborhood} ${u.city} ${u.address}`).includes(q))); }
function renderCities(){ els.cityFilters.innerHTML=CITIES.map(c=>`<button class="filter-chip ${c===state.activeCity?'active':''}" data-city="${esc(c)}">${esc(c)}</button>`).join(''); els.cityFilters.querySelectorAll('button').forEach(b=>b.onclick=()=>{state.activeCity=b.dataset.city;renderCities();renderUnits();}); }
function renderUnits(){
  const list=filtered(); els.unitsCount.textContent=list.length;
  els.unitsList.innerHTML=list.length?list.map(u=>`<article class="unit-card" data-unit="${u.id}"><div class="unit-top"><div><div class="unit-name">${esc(u.name)}</div><div class="unit-place">${esc(u.neighborhood)} • ${esc(u.city)}</div></div><span class="mini-pin"></span></div><div class="unit-address">${esc(u.address)}${u.detail?`<br>${esc(u.detail)}`:''}</div><div class="unit-actions"><button data-focus="${u.id}">Ver no mapa</button><a href="${gm(u)}" target="_blank">Google Maps</a></div></article>`).join(''):'<div class="empty-state">Nenhuma unidade encontrada.</div>';
  els.unitsList.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>selectUnit(b.dataset.focus,true));
}

function selectUnit(id,zoom=true){ const u=state.units.find(x=>x.id===id),m=state.markers.get(id); if(!u||!m)return; if(zoom)map.flyTo([u.lat,u.lng],17,{duration:.7}); m.openPopup(); if(innerWidth<=900)document.querySelector('.map-area').scrollIntoView({behavior:'smooth'}); }
function km(a,b){ const R=6371,d=Math.PI/180,dLat=(b.lat-a.lat)*d,dLng=(b.lng-a.lng)*d,s=Math.sin(dLat/2)**2+Math.cos(a.lat*d)*Math.cos(b.lat*d)*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(s)); }
function nearest(){ if(!state.ref)return[]; return state.units.filter(u=>Number.isFinite(u.lat)).map(u=>({u,d:km(state.ref,u)})).sort((a,b)=>a.d-b.d).slice(0,3); }

function neighborhoodAt(ref){
  if(!state.bairrosGeo||!window.turf)return null;
  const pt=turf.point([ref.lng,ref.lat]);
  for(const f of state.bairrosGeo.features||[]){ try{ if(turf.booleanPointInPolygon(pt,f))return f.properties?.nome||null; }catch{} }
  return null;
}
function setRef(ref){
  state.ref=ref; refLayer.clearLayers(); L.marker([ref.lat,ref.lng],{icon:refIcon}).addTo(refLayer).bindPopup(`<strong>Local de referência</strong><br>${esc(ref.label)}`).openPopup();
  const bairro=neighborhoodAt(ref); els.refLabel.innerHTML=`<strong>${esc(ref.label)}</strong>${bairro?`<span>Bairro identificado: ${esc(bairro)}</span>`:''}`;
  const near=nearest(); els.nearest.hidden=false; els.nearestList.innerHTML=near.map((x,i)=>`<article class="nearest-item"><div class="rank">${i+1}</div><div><strong>${esc(x.u.name)}</strong><span>${esc(x.u.neighborhood)} • ${esc(x.u.city)}</span><small>${esc(x.u.address)}</small><div class="nearest-actions"><button data-nfocus="${x.u.id}">Ver no mapa</button><a href="${route(x.u)}" target="_blank">Rota</a><button data-copy="${x.u.id}">Copiar endereço</button></div></div><div class="distance-pill">${x.d.toFixed(1).replace('.',',')} km*</div></article>`).join('');
  els.nearestList.querySelectorAll('[data-nfocus]').forEach(b=>b.onclick=()=>selectUnit(b.dataset.nfocus,true));
  els.nearestList.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyUnit(b.dataset.copy));
  const pts=[[ref.lat,ref.lng],...near.map(x=>[x.u.lat,x.u.lng])]; map.fitBounds(L.latLngBounds(pts),{padding:[55,55],maxZoom:14});
  if(innerWidth<=900)els.nearest.scrollIntoView({behavior:'smooth',block:'start'});
}
function clearRef(){ state.ref=null;refLayer.clearLayers();els.nearest.hidden=true;els.input.value='';fitAll(); }
async function copyUnit(id){ const u=state.units.find(x=>x.id===id); const text=`${u.name} — ${u.address}, ${u.neighborhood}, ${u.city} - PR.`; try{await navigator.clipboard.writeText(text);toast('Endereço copiado.');}catch{toast(text);} }

async function searchPlace(q){
  q=q.trim(); if(!q)return toast('Digite um endereço, bairro ou ponto de referência.');
  busy(true,'Procurando…'); try{ const biased=/paran|curitiba|pinhais|arauc|s[aã]o jos|campo largo|fazenda rio grande/i.test(norm(q))?q:`${q}, Curitiba e Região Metropolitana, PR`; const r=await geocode(biased,5); if(!r.length){els.status.textContent='Não encontrei. Tente rua + bairro ou cidade.';return;} showSuggestions(r); if(r.length===1||r[0].score>=99)choose(r[0]); }catch(e){els.status.textContent='Busca indisponível. Use “Marcar no mapa”.';}finally{busy(false);}
}
function showSuggestions(r){ els.suggestions.innerHTML=r.map((x,i)=>`<button class="suggestion" data-i="${i}"><strong>${esc(x.label.split(',')[0])}</strong><span>${esc(x.label)}</span></button>`).join('');els.suggestions.hidden=false;els.status.textContent=r.length>1?'Escolha o resultado correto.':'';els.suggestions.querySelectorAll('button').forEach(b=>b.onclick=()=>choose(r[+b.dataset.i])); }
function choose(x){els.suggestions.hidden=true;els.status.textContent='';els.input.value=x.label;setRef(x);}
function busy(v,msg=''){els.searchBtn.disabled=v;els.searchBtn.textContent=v?'Buscando…':'Buscar no mapa';if(msg)els.status.textContent=msg;}
function myLocation(){ if(!navigator.geolocation)return toast('Localização não disponível.');els.status.textContent='Obtendo localização…';navigator.geolocation.getCurrentPosition(p=>{els.status.textContent='';setRef({lat:p.coords.latitude,lng:p.coords.longitude,label:'Minha localização'});},()=>els.status.textContent='Permissão de localização não concedida.',{enableHighAccuracy:true,timeout:10000}); }
function pickMode(v=!state.pick){state.pick=v;els.hint.hidden=!v;els.pickBtn.classList.toggle('active',v);els.pickBtn.textContent=v?'✓ Toque no mapa':'⌖ Marcar no mapa';map.getContainer().style.cursor=v?'crosshair':'';}
function fitAll(){const p=state.units.filter(u=>Number.isFinite(u.lat)).map(u=>[u.lat,u.lng]);p.length?map.fitBounds(L.latLngBounds(p),{padding:[35,35]}):map.setView(CFG.center,CFG.zoom);}

async function geojson(url,params={}){const q=new URLSearchParams({f:'geojson',where:'1=1',outFields:'*',returnGeometry:'true',outSR:'4326',...params});const r=await fetch(`${url}?${q}`);if(!r.ok)throw new Error('camada');return r.json();}
async function loadBoundaries(){
  try{
    state.bairrosGeo=await geojson(CFG.bairros,{outFields:'nome,nm_regional'});
    bairroLayer=L.geoJSON(state.bairrosGeo,{style:{color:'#dc7443',weight:1.2,opacity:.72,fillColor:'#f1a47f',fillOpacity:.035},onEachFeature:(f,l)=>l.bindTooltip(`<strong>${esc(f.properties?.nome||'Bairro')}</strong>`,{sticky:true})}).addTo(map);
    bairroLayer.eachLayer(l=>{const n=l.feature?.properties?.nome;if(!n)return;L.marker(l.getBounds().getCenter(),{interactive:false,icon:L.divIcon({className:'',html:`<div class="neighborhood-label">${esc(n)}</div>`,iconSize:[0,0]})}).addTo(bairroLabels);});
  }catch(e){console.warn('Bairros',e);toast('Mapa carregado sem a camada de bairros.');}
  try{
    const g=await geojson(CFG.municipios,{outFields:'nome'}); const keep=new Set(['CURITIBA','ARAUCARIA','SAO JOSE DOS PINHAIS','PINHAIS','CAMPO LARGO','FAZENDA RIO GRANDE']);
    g.features=(g.features||[]).filter(f=>keep.has(norm(f.properties?.nome||'').toUpperCase()));
    municipioLayer=L.geoJSON(g,{style:{color:'#486b76',weight:2,dashArray:'7 7',opacity:.55,fillOpacity:0}}).addTo(map);
    municipioLayer.eachLayer(l=>{const n=l.feature?.properties?.nome;if(!n)return;L.marker(l.getBounds().getCenter(),{interactive:false,icon:L.divIcon({className:'',html:`<div class="city-label">${esc(n)}</div>`,iconSize:[0,0]})}).addTo(municipioLabels);});
  }catch(e){console.warn('Municípios',e);}
}
function toggle(layer,label,btn){ if(!layer)return toast('Camada ainda não disponível.'); const on=map.hasLayer(layer); [layer,label].forEach(x=>on?map.removeLayer(x):x.addTo(map));btn.classList.toggle('active',!on);btn.setAttribute('aria-pressed',String(!on));}
function toast(t){els.toast.textContent=t;els.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove('show'),2500);}

function bind(){
  els.form.onsubmit=e=>{e.preventDefault();searchPlace(els.input.value)}; els.clear.onclick=()=>{els.input.value='';els.suggestions.hidden=true;els.status.textContent='';els.input.focus()};
  els.locationBtn.onclick=myLocation;els.pickBtn.onclick=()=>pickMode();els.cancelPick.onclick=()=>pickMode(false);els.clearRef.onclick=clearRef;els.fit.onclick=fitAll;
  els.unitFilter.oninput=()=>{state.filter=els.unitFilter.value;renderUnits()};
  els.bairrosBtn.onclick=()=>toggle(bairroLayer,bairroLabels,els.bairrosBtn); els.municipiosBtn.onclick=()=>toggle(municipioLayer,municipioLabels,els.municipiosBtn);
  els.unitsBtn.onclick=()=>{const on=map.hasLayer(unitLayer);on?map.removeLayer(unitLayer):unitLayer.addTo(map);els.unitsBtn.classList.toggle('active',!on);};
  map.on('click',e=>{if(!state.pick)return;pickMode(false);setRef({lat:e.latlng.lat,lng:e.latlng.lng,label:'Ponto marcado no mapa'})});
}

async function boot(){
  renderCities();renderUnits();bind();
  await Promise.allSettled([locateUnits(),loadBoundaries()]);drawUnits();renderUnits();fitAll();
  const n=state.units.filter(u=>Number.isFinite(u.lat)).length;els.loadingText.textContent=`${n} unidades posicionadas`;setTimeout(()=>els.loading.classList.add('hidden'),250);
  if(n<state.units.length)toast(`${n} de ${state.units.length} unidades foram posicionadas.`);
}
boot();
