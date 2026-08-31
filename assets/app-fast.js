import { UNIDADES, CITIES } from '../data/unidades.js';
import { UNIT_COORDS } from '../data/coords.js';

const CFG = {
  center: [-25.445, -49.285],
  zoom: 10,
  geocoder: 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates',
  bairros: 'https://geocuritiba.ippuc.org.br/server/rest/services/GeoCuritiba/Publico_Interno_GeoCuritiba_BaseCartografica_para_BC/MapServer/44/query',
  municipios: 'https://geocuritiba.ippuc.org.br/server/rest/services/GeoCuritiba/Publico_Interno_GeoCuritiba_BaseCartografica_para_BC/MapServer/43/query'
};

const $ = selector => document.querySelector(selector);
const units = UNIDADES.map(unit => ({ ...unit, ...(UNIT_COORDS[unit.id] || {}) }));

const state = {
  ref: null,
  activeCity: 'Todas',
  filter: '',
  markers: new Map(),
  bairrosGeo: null,
  animationToken: 0,
  highlightedUnitId: null
};

const els = {
  form: $('#placeSearchForm'),
  input: $('#placeSearchInput'),
  clear: $('#clearPlaceSearch'),
  status: $('#searchStatus'),
  suggestions: $('#searchSuggestions'),
  searchBtn: $('#searchButton'),
  nearest: $('#nearestSection'),
  nearestList: $('#nearestList'),
  refLabel: $('#referenceLabel'),
  clearRef: $('#clearReferenceButton'),
  cityFilters: $('#cityFilters'),
  unitFilter: $('#unitSearchInput'),
  unitsList: $('#unitsList'),
  unitsCount: $('#unitsCount'),
  fit: $('#fitAllButton'),
  bairrosBtn: $('#toggleNeighborhoodsButton'),
  municipiosBtn: $('#toggleMunicipalitiesButton'),
  unitsBtn: $('#toggleUnitsButton'),
  toast: $('#toast')
};

const map = L.map('map', {
  minZoom: 8,
  maxZoom: 19,
  zoomControl: true,
  preferCanvas: true,
  fadeAnimation: false,
  markerZoomAnimation: false,
  zoomAnimation: true,
  tap: true
}).setView(CFG.center, CFG.zoom);

// Sem API key. OSM é usado diretamente para evitar watermark/limites de terceiros.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  updateWhenIdle: false,
  updateWhenZooming: false,
  keepBuffer: 3,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const unitLayer = L.layerGroup().addTo(map);
const refLayer = L.layerGroup().addTo(map);
const recommendationLayer = L.layerGroup().addTo(map);
let bairroLayer = null;
let municipioLayer = null;

const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const norm = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const googleMaps = unit =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${unit.lat},${unit.lng}`)}`;

const route = unit => {
  const params = new URLSearchParams({
    api: '1',
    destination: `${unit.lat},${unit.lng}`,
    travelmode: 'driving'
  });
  if (state.ref) params.set('origin', `${state.ref.lat},${state.ref.lng}`);
  return `https://www.google.com/maps/dir/?${params}`;
};

function pin(type = '') {
  return L.divIcon({
    className: 'unit-pin',
    html: `<div class="unit-pin-inner ${type}"></div>`,
    iconSize: [32, 38],
    iconAnchor: [16, 34],
    popupAnchor: [0, -30]
  });
}

const refIcon = L.divIcon({
  className: 'reference-pin',
  html: '<div class="reference-pin-inner"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

function popup(unit) {
  return `
    <div class="popup-title">${esc(unit.name)}</div>
    <div class="popup-address">${esc(unit.address)}<br>${esc(unit.neighborhood)} • ${esc(unit.city)}${unit.detail ? `<br>${esc(unit.detail)}` : ''}</div>
    <div class="popup-actions">
      <a href="${googleMaps(unit)}" target="_blank" rel="noopener">Google Maps</a>
      <a href="${route(unit)}" target="_blank" rel="noopener">Traçar rota</a>
    </div>`;
}

function drawUnits() {
  unitLayer.clearLayers();
  state.markers.clear();

  for (const unit of units) {
    if (!Number.isFinite(unit.lat) || !Number.isFinite(unit.lng)) continue;
    const type = ['shopping', 'hospital', 'mega', 'new'].includes(unit.type) ? unit.type : '';
    const marker = L.marker([unit.lat, unit.lng], {
      icon: pin(type),
      title: unit.name,
      keyboard: true
    })
      .bindPopup(popup(unit), { autoPanPadding: [28, 28] })
      .on('click', () => selectUnit(unit.id, false))
      .addTo(unitLayer);

    state.markers.set(unit.id, marker);
  }
}

function syncMapDensity() {
  const compact = map.getZoom() <= 10;
  map.getContainer().classList.toggle('map-zoomed-out', compact);
}

function filteredUnits() {
  const query = norm(state.filter);
  return units.filter(unit =>
    (state.activeCity === 'Todas' || unit.city === state.activeCity) &&
    (!query || norm(`${unit.name} ${unit.neighborhood} ${unit.city} ${unit.address}`).includes(query))
  );
}

function renderCities() {
  els.cityFilters.innerHTML = CITIES
    .map(city => `<button class="filter-chip ${city === state.activeCity ? 'active' : ''}" data-city="${esc(city)}" type="button">${esc(city)}</button>`)
    .join('');

  els.cityFilters.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      state.activeCity = button.dataset.city;
      renderCities();
      renderUnits();
    });
  });
}

function renderUnits() {
  const list = filteredUnits();
  els.unitsCount.textContent = String(list.length);
  els.unitsList.innerHTML = list.length
    ? list.map(unit => `
      <article class="unit-card">
        <div class="unit-top"><div><div class="unit-name">${esc(unit.name)}</div><div class="unit-place">${esc(unit.neighborhood)} • ${esc(unit.city)}</div></div><span class="mini-pin" aria-hidden="true"></span></div>
        <div class="unit-address">${esc(unit.address)}${unit.detail ? `<br>${esc(unit.detail)}` : ''}</div>
        <div class="unit-actions"><button data-focus="${unit.id}" type="button">Ver no mapa</button><a href="${googleMaps(unit)}" target="_blank" rel="noopener">Google Maps</a></div>
      </article>`).join('')
    : '<div class="empty-state">Nenhuma unidade encontrada.</div>';

  els.unitsList.querySelectorAll('[data-focus]').forEach(button => {
    button.addEventListener('click', () => selectUnit(button.dataset.focus, true));
  });
}

function selectUnit(id, zoom = true) {
  const unit = units.find(item => item.id === id);
  const marker = state.markers.get(id);
  if (!unit || !marker) return;

  if (zoom) map.flyTo([unit.lat, unit.lng], 16, { duration: 0.45 });
  marker.openPopup();
  if (innerWidth <= 900) document.querySelector('.map-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function distanceKm(a, b) {
  const R = 6371;
  const d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d;
  const dLng = (b.lng - a.lng) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestUnits() {
  if (!state.ref) return [];
  return units
    .filter(unit => Number.isFinite(unit.lat) && Number.isFinite(unit.lng))
    .map(unit => ({ unit, distance: distanceKm(state.ref, unit) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
}

function clearRecommendation() {
  state.animationToken += 1;
  recommendationLayer.clearLayers();

  if (state.highlightedUnitId) {
    const previous = state.markers.get(state.highlightedUnitId);
    previous?.getElement()?.classList.remove('nearest-highlight');
  }
  state.highlightedUnitId = null;
}

function animateNearestRecommendation(ref, nearest) {
  clearRecommendation();
  if (!nearest.length) return;

  const best = nearest[0];
  const unit = best.unit;
  const marker = state.markers.get(unit.id);
  if (!marker) return;

  if (!map.hasLayer(unitLayer)) {
    unitLayer.addTo(map);
    els.unitsBtn.classList.add('active');
    els.unitsBtn.setAttribute('aria-pressed', 'true');
  }

  const routeLine = L.polyline(
    [[ref.lat, ref.lng], [unit.lat, unit.lng]],
    {
      color: '#0f6b63',
      weight: 4,
      opacity: 0.82,
      dashArray: '4 10',
      lineCap: 'round',
      interactive: false,
      className: 'nearest-guide-line'
    }
  ).addTo(recommendationLayer);

  L.circleMarker([unit.lat, unit.lng], {
    radius: 19,
    color: '#0f6b63',
    weight: 2,
    opacity: 0.32,
    fillColor: '#0f6b63',
    fillOpacity: 0.08,
    interactive: false,
    className: 'nearest-guide-halo'
  }).addTo(recommendationLayer);

  routeLine.bringToBack();
  state.highlightedUnitId = unit.id;
  requestAnimationFrame(() => marker.getElement()?.classList.add('nearest-highlight'));

  const token = ++state.animationToken;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const mapArea = document.querySelector('.map-area');

  if (innerWidth <= 900) {
    mapArea?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  const openBest = () => {
    if (token !== state.animationToken) return;
    marker.openPopup();
  };

  if (reducedMotion) {
    map.fitBounds(L.latLngBounds([[ref.lat, ref.lng], [unit.lat, unit.lng]]), {
      padding: [54, 54],
      maxZoom: 16
    });
    setTimeout(openBest, 80);
    return;
  }

  if (best.distance < 0.8) {
    map.flyToBounds(L.latLngBounds([[ref.lat, ref.lng], [unit.lat, unit.lng]]), {
      paddingTopLeft: [38, 80],
      paddingBottomRight: [38, 110],
      maxZoom: 16,
      duration: 0.75,
      easeLinearity: 0.22
    });
    setTimeout(openBest, 820);
    return;
  }

  map.flyTo([ref.lat, ref.lng], 15, { duration: 0.46, easeLinearity: 0.24 });

  setTimeout(() => {
    if (token !== state.animationToken) return;
    map.flyTo([unit.lat, unit.lng], 16, { duration: 0.86, easeLinearity: 0.2 });
  }, 520);

  setTimeout(openBest, 1450);
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonContains(point, rings) {
  if (!rings?.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some(ring => pointInRing(point, ring));
}

function featureContains(feature, ref) {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  const point = [ref.lng, ref.lat];
  if (geometry.type === 'Polygon') return polygonContains(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(polygon => polygonContains(point, polygon));
  return false;
}

function neighborhoodAt(ref) {
  for (const feature of state.bairrosGeo?.features || []) {
    if (featureContains(feature, ref)) return feature.properties?.nome || null;
  }
  return null;
}

function renderReferenceLabel() {
  if (!state.ref) return;
  const neighborhood = neighborhoodAt(state.ref);
  els.refLabel.innerHTML = `<strong>${esc(state.ref.label)}</strong>${neighborhood ? `<span>Bairro: ${esc(neighborhood)}</span>` : ''}`;
}

function setReference(ref) {
  state.ref = ref;
  refLayer.clearLayers();
  L.marker([ref.lat, ref.lng], { icon: refIcon }).addTo(refLayer);
  renderReferenceLabel();

  const nearest = nearestUnits();
  els.nearest.hidden = false;
  els.nearestList.innerHTML = nearest.map(({ unit, distance }, index) => `
    <article class="nearest-item ${index === 0 ? 'recommended' : ''}">
      <div class="rank">${index + 1}</div>
      <div><strong>${esc(unit.name)}</strong><span>${esc(unit.neighborhood)} • ${esc(unit.city)}</span><small>${esc(unit.address)}</small>
        <div class="nearest-actions"><button data-nfocus="${unit.id}" type="button">Ver no mapa</button><a href="${route(unit)}" target="_blank" rel="noopener">Rota</a><button data-copy="${unit.id}" type="button">Copiar endereço</button></div>
      </div>
      <div class="distance-pill">${distance.toFixed(1).replace('.', ',')} km*</div>
    </article>`).join('');

  els.nearestList.querySelectorAll('[data-nfocus]').forEach(button => button.addEventListener('click', () => selectUnit(button.dataset.nfocus, true)));
  els.nearestList.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copyUnit(button.dataset.copy)));

  animateNearestRecommendation(ref, nearest);
}

function clearReference() {
  clearRecommendation();
  state.ref = null;
  refLayer.clearLayers();
  els.nearest.hidden = true;
  els.input.value = '';
  fitAll();
}

async function copyUnit(id) {
  const unit = units.find(item => item.id === id);
  if (!unit) return;
  const text = `${unit.name} — ${unit.address}, ${unit.neighborhood}, ${unit.city} - PR.`;
  try {
    await navigator.clipboard.writeText(text);
    toast('Endereço copiado.');
  } catch {
    toast(text);
  }
}

async function geocode(query, max = 5) {
  const params = new URLSearchParams({
    f: 'json',
    SingleLine: query,
    outFields: 'Match_addr,City,Subregion,Region,Postal',
    countryCode: 'BRA',
    maxLocations: String(max),
    location: '-49.28,-25.44',
    distance: '80000'
  });
  const response = await fetch(`${CFG.geocoder}?${params}`);
  if (!response.ok) throw new Error('Busca indisponível');
  const json = await response.json();
  return (json.candidates || []).map(candidate => ({
    label: candidate.address,
    lat: candidate.location?.y,
    lng: candidate.location?.x,
    score: candidate.score
  })).filter(result => Number.isFinite(result.lat) && Number.isFinite(result.lng));
}

async function searchPlace(query) {
  const value = query.trim();
  if (!value) return toast('Digite um endereço, bairro ou ponto de referência.');
  setSearchBusy(true, 'Procurando…');
  try {
    const normalized = norm(value);
    const hasRegion = /paran|curitiba|pinhais|arauc|sao jos|campo largo|fazenda rio grande/i.test(normalized);
    const results = await geocode(hasRegion ? value : `${value}, Curitiba e Região Metropolitana, PR`, 5);
    if (!results.length) {
      els.status.textContent = 'Não encontrei. Tente rua + bairro ou cidade.';
      return;
    }
    showSuggestions(results);
    if (results.length === 1 || results[0].score >= 99) chooseSuggestion(results[0]);
  } catch {
    els.status.textContent = 'Busca indisponível no momento. Tente novamente.';
  } finally {
    setSearchBusy(false);
  }
}

function showSuggestions(results) {
  els.suggestions.innerHTML = results.map((result, index) => `
    <button class="suggestion" data-index="${index}" type="button"><strong>${esc(result.label.split(',')[0])}</strong><span>${esc(result.label)}</span></button>`).join('');
  els.suggestions.hidden = false;
  els.status.textContent = results.length > 1 ? 'Escolha o resultado correto.' : '';
  els.suggestions.querySelectorAll('button').forEach(button => button.addEventListener('click', () => chooseSuggestion(results[Number(button.dataset.index)])));
}

function chooseSuggestion(result) {
  els.suggestions.hidden = true;
  els.status.textContent = '';
  els.input.value = result.label;
  setReference(result);
}

function setSearchBusy(active, message = '') {
  els.searchBtn.disabled = active;
  els.searchBtn.textContent = active ? 'Buscando…' : 'Buscar no mapa';
  if (message) els.status.textContent = message;
}

function fitAll() {
  const points = units.filter(unit => Number.isFinite(unit.lat) && Number.isFinite(unit.lng)).map(unit => [unit.lat, unit.lng]);
  if (points.length) map.fitBounds(L.latLngBounds(points), { padding: innerWidth <= 900 ? [18, 18] : [35, 35] });
  else map.setView(CFG.center, CFG.zoom);
}

async function fetchGeoJSON(url, params = {}) {
  const query = new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    outFields: 'nome',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '5',
    ...params
  });
  const response = await fetch(`${url}?${query}`);
  if (!response.ok) throw new Error('Camada indisponível');
  return response.json();
}

function setLayerReady(button, ready, active = false) {
  if (!button) return;
  button.disabled = !ready;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
}

async function loadBoundaries() {
  const bairrosPromise = fetchGeoJSON(CFG.bairros, { outFields: 'nome' });
  const municipiosPromise = fetchGeoJSON(CFG.municipios, { outFields: 'nome', geometryPrecision: '4' });

  try {
    state.bairrosGeo = await bairrosPromise;
    bairroLayer = L.geoJSON(state.bairrosGeo, {
      interactive: true,
      style: { color: '#d77b4a', weight: 1, opacity: 0.42, fillOpacity: 0 },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.nome;
        if (name) layer.bindTooltip(esc(name), { sticky: true, direction: 'top', opacity: 0.9 });
      }
    }).addTo(map);
    setLayerReady(els.bairrosBtn, true, true);
    renderReferenceLabel();
  } catch {
    setLayerReady(els.bairrosBtn, true, false);
  }

  try {
    const data = await municipiosPromise;
    const keep = new Set(['curitiba', 'araucaria', 'sao jose dos pinhais', 'pinhais', 'campo largo', 'fazenda rio grande']);
    data.features = (data.features || []).filter(feature => keep.has(norm(feature.properties?.nome || '')));
    municipioLayer = L.geoJSON(data, {
      interactive: false,
      style: { color: '#64808a', weight: 1.25, dashArray: '6 6', opacity: 0.32, fillOpacity: 0 }
    });
    // Município fica desligado por padrão para reduzir ruído visual.
    setLayerReady(els.municipiosBtn, true, false);
  } catch {
    setLayerReady(els.municipiosBtn, true, false);
  }
}

function toggleLayer(layer, button) {
  if (!layer) return;
  const active = map.hasLayer(layer);
  if (active) map.removeLayer(layer);
  else layer.addTo(map);
  button.classList.toggle('active', !active);
  button.setAttribute('aria-pressed', String(!active));
}

function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function lockPageZoomOutsideMap() {
  const mapElement = $('#map');
  if (!mapElement) return;
  const insideMap = target => target instanceof Node && mapElement.contains(target);

  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, event => {
      if (!insideMap(event.target)) event.preventDefault();
    }, { passive: false });
  }

  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1 && !insideMap(event.target)) event.preventDefault();
  }, { passive: false });
}

function bind() {
  els.form.addEventListener('submit', event => {
    event.preventDefault();
    searchPlace(els.input.value);
  });
  els.clear.addEventListener('click', () => {
    els.input.value = '';
    els.suggestions.hidden = true;
    els.status.textContent = '';
    els.input.focus();
  });
  els.clearRef.addEventListener('click', clearReference);
  els.fit.addEventListener('click', fitAll);
  els.unitFilter.addEventListener('input', () => {
    state.filter = els.unitFilter.value;
    renderUnits();
  });
  els.bairrosBtn.addEventListener('click', () => toggleLayer(bairroLayer, els.bairrosBtn));
  els.municipiosBtn.addEventListener('click', () => toggleLayer(municipioLayer, els.municipiosBtn));
  els.unitsBtn.addEventListener('click', () => {
    const active = map.hasLayer(unitLayer);
    if (active) map.removeLayer(unitLayer);
    else unitLayer.addTo(map);
    els.unitsBtn.classList.toggle('active', !active);
    els.unitsBtn.setAttribute('aria-pressed', String(!active));
  });
  map.on('zoomend', syncMapDensity);
}

function deferBoundaries() {
  const start = () => loadBoundaries().catch(error => console.warn('Camadas', error));
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 900 });
  else setTimeout(start, 180);
}

function boot() {
  lockPageZoomOutsideMap();
  drawUnits();
  renderCities();
  renderUnits();
  bind();
  fitAll();
  syncMapDensity();
  setLayerReady(els.bairrosBtn, false, false);
  setLayerReady(els.municipiosBtn, false, false);
  els.unitsBtn.classList.add('active');
  els.unitsBtn.setAttribute('aria-pressed', 'true');
  requestAnimationFrame(() => map.invalidateSize(false));
  deferBoundaries();
}

boot();
