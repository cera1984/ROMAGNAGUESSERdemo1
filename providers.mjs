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

export async function discoverMapillary(needed, accessToken, only360 = false) {
  if (!accessToken?.trim()) throw new Error('Per usare Mapillary inserisci un client access token nelle impostazioni. La modalità gratuita non richiede token.');
  const params = new URLSearchParams({
    access_token: accessToken.trim(), bbox: bboxForRadius(CESENA, REGION_RADIUS_KM).join(','),
    fields: 'id,computed_geometry,is_pano', limit: '2000',
  });
  const json = await getJson(`${MAPILLARY_API}/images?${params}`);
  return diverse((json.data || []).map(parseMapillaryFeature).filter(Boolean), needed, only360);
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
