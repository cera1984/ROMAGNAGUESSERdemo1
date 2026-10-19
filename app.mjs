import { CESENA, PANORAMAX_API, haversineKm, scoreForDistance, createChallenge, readChallenge, formatDistance, deriveStats } from './core.mjs';
import { discoverHybrid, discoverMapillary, fetchChallenge } from './providers.mjs';

const $ = id => document.getElementById(id);
const numberIt = n => Math.round(n).toLocaleString('it-IT');
const STAT_KEY = 'romaguessr-stats-v1';
const SETTINGS_KEY = 'romaguessr-settings-v1';
const show = (id, yes) => { $(id).hidden = !yes; };
const all = (...ids) => ids.forEach(id => show(id, true));
const no = (...ids) => ids.forEach(id => show(id, false));
const defaultSettings = { mapillaryToken: '', moveAllowed: true };
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
let settings = { ...defaultSettings, ...readStorage(SETTINGS_KEY, {}) };
let stats = readStorage(STAT_KEY, {});
const state = { rounds: [], count: 5, selected: '5', provider: 'pnx', index: 0, results: [], guess: null, locked: false, phase: 'home', map: null, marker: null, solution: [], mapillaryViewer: null, loading: false, challenge: null };
function renderStats() {
  $('statPlayed').textContent = numberIt(stats.played || 0);
  $('statWinRate').textContent = (stats.played ? Math.round(100 * (stats.won || 0) / stats.played) : 0) + '%';
  $('statBest').textContent = numberIt(stats.best || 0);
  $('statStreak').textContent = numberIt(stats.streak || 0);
}
function selectScreen(name) {
  state.phase = name;
  show('homeScreen', name === 'home'); show('gameScreen', name === 'game'); show('summaryScreen', name === 'summary');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function homeError(text) { $('homeError').textContent = text; show('homeError', !!text); }
function changeRounds(value) {
  if (state.challenge) return;
  state.selected = value;
  document.querySelectorAll('#roundOptions .segment').forEach(b => { const yes=b.dataset.rounds===value;b.classList.toggle('active', yes);b.setAttribute('aria-pressed',String(yes)); });
}
function getProvider() { return document.querySelector('input[name="provider"]:checked').value; }
function ensureMap() {
  if (state.map) return;
  if (!window.L) throw new Error('La libreria cartografica non si è caricata: controlla la connessione a Internet.');
  state.map = L.map('guessMap', { zoomControl: false, attributionControl: true, minZoom: 8, maxZoom: 19 }).setView([CESENA.lat, CESENA.lng], 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19, subdomains:'abcd'
  }).addTo(state.map);
  L.control.zoom({ position: 'bottomleft' }).addTo(state.map);
  state.map.on('click', e => {
    if (state.phase !== 'game' || state.locked) return;
    state.guess = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (state.marker) state.marker.setLatLng(e.latlng);
    else state.marker = L.marker(e.latlng, {icon: makeIcon('#f0bc4b','?')}).addTo(state.map);
    $('guessBtn').disabled = false;
    $('pinIndicator').textContent = 'PIN PIAZZATO ✓';
    $('guessHelp').textContent = 'Hai scelto la posizione. Puoi spostare il pin.';
  });
}
function makeIcon(color, content) {
  return L.divIcon({ className: 'rom-pin', html: `<span style="display:grid;place-items:center;width:30px;height:30px;border:3px solid #111a1c;border-radius:50% 50% 50% 5px;background:${color};color:#0c151b;font-size:14px;font-weight:950;box-shadow:0 2px 10px #000b;transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${content}</span></span>`, iconSize:[30,30],iconAnchor:[15,30] });
}
function clearMap() {
  if (state.marker) { state.map.removeLayer(state.marker); state.marker = null; }
  state.solution.forEach(layer => state.map.removeLayer(layer)); state.solution = [];
  state.guess = null;
  $('guessBtn').disabled = true;
  $('pinIndicator').textContent = 'NESSUN PIN';
  $('mapPanel').classList.remove('expanded', 'is-result');
  $('mapHeading').textContent = 'DOVE TI TROVI?';
  state.map.setView([CESENA.lat,CESENA.lng],11,{animate:false});
  setTimeout(() => state.map.invalidateSize(), 80);
}
async function findRounds() {
  if (state.challenge) { state.provider = 'mix'; return await fetchChallenge(state.challenge); }
  const count = state.selected === 'infinite' ? 10 : Number(state.selected);
  state.provider = getProvider() === 'pnx' ? 'mix' : 'mly';
  const only360 = $('only360').checked;
  const found = state.provider === 'mix' ? await discoverHybrid(count, only360) : await discoverMapillary(count, settings.mapillaryToken, only360);
  if (found.length < count) throw new Error(`Trovate ${found.length} posizioni utilizzabili, ma ne servono ${count}. Prova a disattivare «solo 360°», scegli 5 round oppure cambia fonte immagini nelle impostazioni.`);
  return found.slice(0,count);
}
async function startGame() {
  if (state.loading) return;
  state.loading = true; homeError('');
  $('startBtn').disabled = true; $('startBtn').textContent = 'RICERCA DELLE POSIZIONI…';
  try {
    const positions = await findRounds();
    state.rounds = positions; state.index = 0; state.results = []; state.locked = false;
    state.count = state.challenge ? positions.length : state.selected === 'infinite' ? Infinity : Number(state.selected);
    ensureMap(); selectScreen('game');
    await displayRound();
  } catch(err) {
    console.error('Avvio fallito:', err);
    homeError(err?.message || 'Impossibile iniziare la partita. Riprova.');
    selectScreen('home');
  } finally {
    state.loading = false;
    $('startBtn').disabled = false; $('startBtn').innerHTML = 'INIZIA A GIOCARE <span>→</span>';
  }
}
function removeViewer() {
  if (state.mapillaryViewer) { try { state.mapillaryViewer.remove(); } catch {} state.mapillaryViewer = null; }
  $('photoHolder').replaceChildren();
}
async function showPhoto(photo) {
  removeViewer();
  $('photoCredit').textContent = photo.credits;
  const holder = $('photoHolder');
  if (photo.provider === 'pnx') {
    await Promise.race([
      customElements.whenDefined('pnx-photo-viewer'),
      new Promise((_,reject) => setTimeout(() => reject(new Error('Visualizzatore Panoramax non caricato. Controlla la connessione.')), 12000))
    ]);
    const viewer = document.createElement('pnx-photo-viewer');
    viewer.setAttribute('endpoint', PANORAMAX_API);
    viewer.setAttribute('sequence', photo.collection);
    viewer.setAttribute('picture', photo.id);
    viewer.setAttribute('widgets', 'false');
    viewer.setAttribute('url-parameters', 'false');
    if (!settings.moveAllowed) viewer.setAttribute('psv-options', JSON.stringify({picturesNavigation:'pic'}));
    viewer.addEventListener('broken', () => { $('guessHelp').textContent = 'Questa immagine non si carica: il server delle fotografie potrebbe essere temporaneamente offline.'; });
    holder.append(viewer);
  } else if (photo.provider === 'commons') {
    const img = document.createElement('img');
    img.className = 'commons-photo';
    img.alt = 'Fotografia geolocalizzata da indovinare';
    img.src = photo.imageUrl;
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { $('guessHelp').textContent = 'Fotografia non disponibile. Il link originale potrebbe essere cambiato.'; });
    holder.append(img);
  } else {
    if (!window.mapillary?.Viewer) throw new Error('Visualizzatore Mapillary non caricato. Controlla la connessione.');
    const box = document.createElement('div'); box.id = 'mly'; holder.append(box);
    state.mapillaryViewer = new window.mapillary.Viewer({ accessToken:settings.mapillaryToken, container:'mly', imageId:photo.id });
  }
}
async function displayRound() {
  state.locked = false;
  clearMap();
  no('resultStrip','nextBtn'); all('guessBtn');
  show('shareBtn', state.provider === 'mix' && Number.isFinite(state.count));
  $('roundLabel').textContent = `ROUND ${String(state.index + 1).padStart(2,'0')} / ${Number.isFinite(state.count) ? String(state.count).padStart(2,'0') : '∞'}`;
  $('scoreLabel').textContent = numberIt(state.results.reduce((sum,x)=>sum+x.score,0));
  $('guessHelp').textContent = 'Guarda gli indizi, poi piazza il pin sulla mappa.';
  await showPhoto(state.rounds[state.index]);
}
function submitGuess() {
  if (!state.guess || state.locked) return;
  state.locked = true;
  const target = state.rounds[state.index];
  const km = haversineKm(state.guess,target);
  const score = scoreForDistance(km);
  state.results.push({ km, score });
  $('distanceResult').textContent = formatDistance(km);
  $('pointsResult').textContent = numberIt(score);
  $('sourceLink').href = target.provider === 'pnx' ? `https://api.panoramax.xyz/#focus=pic&pic=${encodeURIComponent(target.id)}` : target.provider === 'commons' ? target.sourceUrl : `https://www.mapillary.com/app/?pKey=${encodeURIComponent(target.id)}`;
  $('resultComment').textContent = km < .25 ? 'CENTRO PERFETTO! 🔥' : km < 2 ? 'Ci sei andato vicino!' : km < 8 ? 'Non male, dai.' : 'La prossima andrà meglio.';
  $('scoreLabel').textContent = numberIt(state.results.reduce((sum,x)=>sum+x.score,0));
  $('mapHeading').textContent = 'LA POSIZIONE CORRETTA';
  $('mapPanel').classList.add('is-result');
  state.solution.push(L.marker([target.lat,target.lng],{icon:makeIcon('#a42a3d','✓')}).addTo(state.map));
  state.solution.push(L.polyline([[state.guess.lat,state.guess.lng],[target.lat,target.lng]],{color:'#f0bc4b',weight:3,dashArray:'7,8'}).addTo(state.map));
  const bounds = L.latLngBounds([[state.guess.lat,state.guess.lng],[target.lat,target.lng]]).pad(.65);
  setTimeout(()=>{ state.map.invalidateSize(); state.map.fitBounds(bounds,{maxZoom:15,animate:true}); },110);
  no('guessBtn'); all('nextBtn','resultStrip');
  $('nextBtn').innerHTML = state.index + 1 >= state.count ? 'RISULTATI FINALI <span>→</span>' : 'PROSSIMO ROUND <span>→</span>';
  $('guessHelp').textContent = `Hai ottenuto ${numberIt(score)} punti su 5.000.`;
}
async function nextRound() {
  if (!state.locked) return;
  state.index++;
  if (state.index >= state.count) { finishGame(); return; }
  if (state.index >= state.rounds.length) {
    // Infinite: discover a new batch; permit repeated places only if the coverage is limited.
    $('nextBtn').disabled = true;
    try {
      const more = state.provider === 'mix' ? await discoverHybrid(10,$('only360').checked) : await discoverMapillary(10,settings.mapillaryToken,$('only360').checked);
      if (more.length === 0) throw new Error('Non ci sono nuove posizioni.');
      const unused=more.filter(p=>!state.rounds.some(q=>q.id===p.id));
      state.rounds.push(...(unused.length ? unused : more));
    } catch(e) { $('nextBtn').disabled = false; alert(e.message); return; }
    $('nextBtn').disabled = false;
  }
  try { await displayRound(); }
  catch(e) { alert(`Caricamento round fallito: ${e.message}`); }
}
function finishGame() {
  const total = state.results.reduce((s,r)=>s+r.score,0);
  const infinite = !Number.isFinite(state.count);
  if (!infinite && state.results.length === state.count) {
    stats = deriveStats(stats,state.results.map(x=>x.score),false);
    localStorage.setItem(STAT_KEY,JSON.stringify(stats)); renderStats();
  }
  selectScreen('summary');
  $('summaryTotal').textContent = numberIt(total);
  $('summaryMax').textContent = `PUNTI SU ${numberIt(state.results.length * 5000)}`;
  $('summaryDetails').textContent = `Hai esplorato ${state.results.length} posizioni della zona di Cesena. ${!infinite && total >= state.count * 3000 ? 'Partita vinta!' : 'Puoi fare ancora meglio.'}`;
  removeViewer();
}
async function copyOrShare(text, title) {
  if (navigator.share) {
    try { await navigator.share({title,text,url:text.startsWith('https://') ? text : undefined}); return; }
    catch(err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); alert('Copiato negli appunti!'); }
  catch { window.prompt('Copia questo testo:',text); }
}
function shareChallenge() {
  try {
    const encoded=createChallenge(state.rounds.slice(0,state.count));
    const link=`${location.origin}${location.pathname}?challenge=${encoded}`;
    void copyOrShare(link,'Sfida ROMAGNAGUESSER');
  } catch(err) { alert(err.message); }
}
function shareScore() {
  const sum=state.results.reduce((s,r)=>s+r.score,0);
  const msg=`Ho fatto ${numberIt(sum)} punti in ${state.results.length} round su ROMAGNAGUESSER! Riesci a battermi? ${location.origin}${location.pathname}`;
  void copyOrShare(msg,'Il mio punteggio ROMAGNAGUESSER');
}
function resetHome() {
  removeViewer();
  state.challenge=null;
  history.replaceState({},'',location.pathname);
  show('challengeBanner',false);
  document.querySelectorAll('#roundOptions button').forEach(b=>b.disabled=false);
  document.querySelectorAll('input[name="provider"]').forEach(b=>b.disabled=false);
  selectScreen('home');
}
function initChallenge() {
  const value = new URLSearchParams(location.search).get('challenge');
  if (!value) return;
  try {
    state.challenge = readChallenge(value);
    state.selected = String(state.challenge.photos.length);
    show('challengeBanner',true);
    document.querySelectorAll('#roundOptions button').forEach(b=>b.disabled=true);
    document.querySelector('input[name="provider"][value="pnx"]').checked = true;
    document.querySelectorAll('input[name="provider"]').forEach(b=>b.disabled=true);
    $('startBtn').innerHTML='ACCETTA LA SFIDA <span>→</span>';
  } catch(err) { homeError(`La sfida condivisa non è valida: ${err.message}`); }
}
// Event bindings
$('roundOptions').addEventListener('click',e=>{if(e.target.closest('[data-rounds]'))changeRounds(e.target.closest('[data-rounds]').dataset.rounds);});
$('startBtn').addEventListener('click',startGame);
$('guessBtn').addEventListener('click',submitGuess);
$('nextBtn').addEventListener('click',nextRound);
$('shareBtn').addEventListener('click',shareChallenge);
$('expandMap').addEventListener('click',()=>{ $('mapPanel').classList.toggle('expanded'); if(state.map)setTimeout(()=>state.map.invalidateSize(),200); });
$('endBtn').addEventListener('click',()=>{if(!state.locked && !confirm('Vuoi abbandonare la partita? Il punteggio attuale andrà perso.'))return;if(state.count===Infinity&&state.results.length){finishGame();}else resetHome();});
$('againBtn').addEventListener('click',resetHome);
$('shareScoreBtn').addEventListener('click',shareScore);
$('settingsBtn').addEventListener('click',()=>{ $('mapillaryToken').value=settings.mapillaryToken; $('moveAllowed').checked=settings.moveAllowed; $('settingsDialog').showModal();});
$('saveSettings').addEventListener('click',()=>{ settings={mapillaryToken:$('mapillaryToken').value.trim(),moveAllowed:$('moveAllowed').checked};localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));$('settingsDialog').close(); });
renderStats(); initChallenge();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
