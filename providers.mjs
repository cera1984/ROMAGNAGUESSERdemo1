import { PANORAMAX_API, MAPILLARY_API, CESENA, REGION_RADIUS_KM, bboxForRadius, parsePanoramaxFeature, parseMapillaryFeature, parseCommonsPage, uniqueLocations, shuffled, haversineKm } from './core.mjs';

async function getJson(url, timeoutMs = 12500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}
function diverse(points, min, only360 = false, preserveOrder = false) {
  const eligible = only360 ? points.filter(p => p.isPano) : points;
  const candidates = preserveOrder ? eligible : shuffled(eligible);
  for (const spacing of [1.3, 0.6, 0.15, 0]) {
    const result = uniqueLocations(candidates, 300, spacing);
    if (result.length >= min) return result;
  }
  return uniqueLocations(candidates, 300, 0);
}

export async function discoverPanoramax(needed, only360 = false) {
  const radii = [7, 15, REGION_RADIUS_KM];
  const responses = await Promise.allSettled(radii.map(async radius => {
    const url = new URL(`${PANORAMAX_API}/search`);
    url.searchParams.set('bbox', bboxForRadius(CESENA, radius).join(','));
    url.searchParams.set('limit', '500');
    const data = await getJson(url);
    return (data.features || []).map(parsePanoramaxFeature).filter(Boolean);
  }));
  const found = responses.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const selected = diverse(found, needed, only360);
  if (selected.length) return selected;
  const failure = responses.find(r => r.status === 'rejected');
  throw new Error(failure ? `Panoramax non disponibile (${failure.reason?.message || 'connessione non riuscita'}).` : 'Nessuna immagine Panoramax geolocalizzata entro 24 km da Cesena.');
}

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const SEARCH_CENTERS = [
  [44.1391, 12.2431], // Cesena
  [44.1709, 12.1322], // Forlimpopoli
  [44.1470, 12.1345], // Bertinoro sud-est
  [44.0872, 12.3956], // Savignano
  [44.1168, 12.3870], // Gambettola / Gatteo
  [44.2000, 12.3400], // nord Cesena
];
function commonsParams() {
  return {
    action: 'query', format: 'json', origin: '*',
    prop: 'coordinates|imageinfo', coprimary: 'all',
    iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1800',
  };
}
export async function discoverCommons(needed) {
  const results = await Promise.allSettled(SEARCH_CENTERS.map(async ([lat, lng]) => {
    const params = new URLSearchParams({
      ...commonsParams(), generator: 'geosearch', ggsprimary: 'all',
      ggsnamespace: '6', ggsradius: '10000', ggslimit: '50',
      ggscoord: `${lat}|${lng}`,
    });
    const data = await getJson(`${COMMONS_API}?${params}`);
    return Object.values(data.query?.pages || {}).map(parseCommonsPage).filter(Boolean);
  }));
  const candidates = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const picked = diverse(candidates, needed);
  if (picked.length) return picked;
  throw new Error('Nessuna fotografia geolocalizzata utilizzabile da Wikimedia Commons.');
}

// Prefer real panoramas and moving sequences, but permit CC-licensed geotagged stills
// when street-view coverage near Cesena is insufficient. No fictitious locations.
export async function discoverHybrid(needed, only360 = false) {
  if (only360) return discoverPanoramax(needed, true);
  const sources = await Promise.allSettled([discoverPanoramax(needed), discoverCommons(needed)]);
  const panoramax = sources[0].status === 'fulfilled' ? sources[0].value : [];
  const commons = sources[1].status === 'fulfilled' ? sources[1].value : [];
  const highQuality = panoramax.filter(p => p.isPano);
  const plainPanoramax = panoramax.filter(p => !p.isPano);
  const candidateList = [...shuffled(highQuality), ...shuffled(plainPanoramax), ...shuffled(commons)];
  const selected = diverse(candidateList, needed, false, true);
  if (!selected.length) throw new Error('Nessun panorama disponibile nell’area. Verifica la connessione o configura Mapillary nelle impostazioni.');
  return selected;
}

// Mapillary's /images endpoint rejects large bbox requests (sometimes with HTTP 500).
// Probe several small boxes well below even the original 0.001 square-degree limit.
// The returned image coordinates are the real Mapillary coordinates; these probe
// centers are NEVER used as answers to the game.
const MAPILLARY_BOX_WIDTH = 0.026;
const MAPILLARY_BOX_HEIGHT = 0.026;
const MAPILLARY_LIMIT = 60;
const MAPILLARY_BATCH_SIZE = 4;
const MAPILLARY_MAX_REQUESTS = 32;

export function mapillarySmallBbox(center) {
  const dx = MAPILLARY_BOX_WIDTH / 2, dy = MAPILLARY_BOX_HEIGHT / 2;
  return [center.lng - dx, center.lat - dy, center.lng + dx, center.lat + dy].map(n => +n.toFixed(6));
}

function mapillarySearchCenters() {
  // Population centers and approaches within ~24 km of Cesena, followed by
  // dispersed probes; randomize order to avoid always replaying identical roads.
  const hubs = [
    { lat: 44.1391, lng: 12.2431 }, // Cesena
    { lat: 44.1580, lng: 12.2550 },
    { lat: 44.1280, lng: 12.2190 },
    { lat: 44.1430, lng: 12.2850 },
    { lat: 44.1080, lng: 12.2510 },
    { lat: 44.1880, lng: 12.1340 }, // Forlimpopoli area
    { lat: 44.1480, lng: 12.1350 }, // Bertinoro area
    { lat: 44.1780, lng: 12.3850 }, // Gambettola area
    { lat: 44.0890, lng: 12.3970 }, // Savignano area
    { lat: 44.2010, lng: 12.4000 }, // Cesenatico area
    { lat: 44.0930, lng: 12.3320 },
    { lat: 44.0920, lng: 12.2040 },
    { lat: 44.1800, lng: 12.2980 },
    { lat: 44.2290, lng: 12.3200 },
    { lat: 44.0600, lng: 12.2550 },
    { lat: 44.1700, lng: 12.1900 },
  ];
  const ring = [];
  for (let i = 0; i < 24; i++) {
    const theta = 2 * Math.PI * i / 24;
    const radiusKm = [6.5, 12, 18][i % 3];
    ring.push({
      lat: CESENA.lat + radiusKm * Math.sin(theta) / 111.32,
      lng: CESENA.lng + radiusKm * Math.cos(theta) / (111.32 * Math.cos(CESENA.lat * Math.PI / 180)),
    });
  }
  return [hubs[0], ...shuffled(hubs.slice(1)), ...shuffled(ring)];
}

async function fetchMapillaryCell(center, accessToken) {
  const params = new URLSearchParams({
    access_token: accessToken,
    bbox: mapillarySmallBbox(center).join(','),
    fields: 'id,computed_geometry,is_pano',
    limit: String(MAPILLARY_LIMIT),
  });
  const url = `${MAPILLARY_API}/images?${params}`;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const res = await fetch(url, { mode: 'cors', signal: controller.signal });
      if (!res.ok) {
        const error = new Error(`Mapillary HTTP ${res.status}`);
        error.status = res.status;
        // Distinguish invalid/restricted tokens without exposing the token.
        if (res.status === 401 || res.status === 403) {
          error.auth = true;
          throw error;
        }
        lastError = error;
        if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 1) throw error;
      } else {
        const json = await res.json();
        if (!Array.isArray(json.data)) throw new Error('Risposta Mapillary senza elenco immagini.');
        return json.data.map(parseMapillaryFeature).filter(Boolean);
      }
    } catch (error) {
      if (error.auth) throw error;
      lastError = error;
      if (attempt === 1) throw error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw lastError || new Error('Mapillary non disponibile.');
}

export async function discoverMapillary(needed, accessToken, only360 = false) {
  const token = accessToken?.trim();
  if (!token) throw new Error('Per usare Mapillary inserisci il client access token nelle impostazioni.');
  const centers = mapillarySearchCenters().slice(0, MAPILLARY_MAX_REQUESTS);
  const found = [];
  const errors = [];
  let succeeded = 0;
  for (let i = 0; i < centers.length; i += MAPILLARY_BATCH_SIZE) {
    const batch = await Promise.allSettled(
      centers.slice(i, i + MAPILLARY_BATCH_SIZE).map(center => fetchMapillaryCell(center, token))
    );
    for (const result of batch) {
      if (result.status === 'fulfilled') {
        succeeded++;
        found.push(...result.value);
      } else if (result.reason?.auth) {
        throw new Error('Mapillary rifiuta il client access token (HTTP 401/403). Controlla l’attivazione dell’app su Mapillary e il token inserito.');
      } else {
        errors.push(result.reason);
      }
    }
    const selected = diverse(found, needed, only360);
    // Search at least two batches for a range of locations, not a single road.
    if (selected.length >= needed && i >= MAPILLARY_BATCH_SIZE) return selected;
  }
  const result = diverse(found, needed, only360);
  if (result.length >= needed) return result;
  if (!succeeded && errors.length) {
    const httpCode = errors.find(e => e?.status)?.status;
    throw new Error(`Mapillary non risponde alle ricerche locali${httpCode ? ` (HTTP ${httpCode})` : ''}. Abbiamo già suddiviso la zona in riquadri piccoli; potrebbe essere un problema temporaneo dell’API. Riprova più tardi.`);
  }
  throw new Error(`Mapillary: trovate ${result.length} posizioni valide su ${needed}. ${only360 ? 'Disattiva «solo panorami a 360°» oppure ' : ''}Riprova o scegli Panoramax + Commons. ${errors.length ? `(${errors.length} ricerche locali non riuscite)` : ''}`);
}

export async function fetchChallenge(payload) {
  const photos = payload.v === 1 ? payload.photos.map(([collection, id]) => ['p', collection, id]) : payload.photos;
  const commonsIds = photos.filter(p => p[0] === 'c').map(p => p[1]);
  let commonsById = new Map();
  if (commonsIds.length) {
    const params = new URLSearchParams({ ...commonsParams(), pageids: commonsIds.join('|') });
    const response = await getJson(`${COMMONS_API}?${params}`);
    commonsById = new Map(Object.values(response.query?.pages || {}).map(p => [String(p.pageid), parseCommonsPage(p)]));
  }
  const loaded = await Promise.all(photos.map(async p => {
    if (p[0] === 'c') return commonsById.get(p[1]);
    const [, collection, id] = p;
    const json = await getJson(`${PANORAMAX_API}/collections/${encodeURIComponent(collection)}/items/${encodeURIComponent(id)}`);
    const point = parsePanoramaxFeature(json);
    return point?.collection === collection && point?.id === id ? point : null;
  }));
  if (loaded.some(p => !p || haversineKm(p, CESENA) > REGION_RADIUS_KM)) throw new Error('Una fotografia della sfida non è più disponibile.');
  return loaded;
}
