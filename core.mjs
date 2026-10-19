/** Pure game utilities. No UI or browser dependencies. */
export const CESENA = Object.freeze({ lat: 44.1391, lng: 12.2431 });
export const REGION_RADIUS_KM = 24;
export const PANORAMAX_API = 'https://api.panoramax.xyz/api';
export const MAPILLARY_API = 'https://graph.mapillary.com';
export function haversineKm(a, b) {
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lng - a.lng);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
export function scoreForDistance(km) {
  return Math.max(0, Math.min(5000, Math.round(5000 * Math.exp(-Math.max(0, km) / 5))));
}
export function bboxForRadius(center, radiusKm) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos(center.lat * Math.PI / 180));
  return [center.lng - dLng, center.lat - dLat, center.lng + dLng, center.lat + dLat].map(n => +n.toFixed(6));
}
export function eligibleInRegion(point) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && haversineKm(point, CESENA) <= REGION_RADIUS_KM;
}
export function parsePanoramaxFeature(feature) {
  if (!feature || !Array.isArray(feature.geometry?.coordinates)) return null;
  const [lng, lat] = feature.geometry.coordinates;
  const id = feature.id, collection = feature.collection;
  if (typeof id !== 'string' || typeof collection !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const props = feature.properties || {};
  const fov = Number(props['pers:interior_orientation']?.field_of_view ?? 0);
  const producer = props['geovisio:producer'];
  const author = typeof producer === 'string' ? producer : (producer?.name || props.creator || 'contributori');
  return { provider: 'pnx', id, collection, lat, lng, isPano: fov >= 300, credits: `Panoramax · ${String(author).slice(0,70)}` }; 
}
export function parseCommonsPage(page) {
  const image = page?.imageinfo?.[0];
  const coord = page?.coordinates?.find(p => p.primary === '') || page?.coordinates?.[0];
  if (!page || !coord || !Number.isFinite(coord.lat) || !Number.isFinite(coord.lon) || !image) return null;
  if (image.mime !== 'image/jpeg' && image.mime !== 'image/png' && image.mime !== 'image/webp') return null;
  if ((image.width || 0) < 900 || (image.height || 0) < 560) return null;
  // Discard maps, illustrations, portraits, screenshots, scans and very narrow images.
  if (/map|cartina|stemma|coat.of.arms|logo|planimetr|portrait|ritratto|screenshot|diagram|railway.map|locator/i.test(page.title || '')) return null;
  const url = image.thumburl || image.url;
  if (typeof url !== 'string' || !url.startsWith('https://upload.wikimedia.org/')) return null;
  const strip = text => String(text || '').replace(/<[^>]*>/g, ' ').replace(/&[^; ]{2,12};/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
  const meta = image.extmetadata || {};
  const author = strip(meta.Artist?.value) || 'autore indicato sulla fonte';
  const license = strip(meta.LicenseShortName?.value) || 'licenza sulla fonte';
  const source = image.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`;
  return { provider: 'commons', id: String(page.pageid), lat: coord.lat, lng: coord.lon,
    isPano: false, imageUrl: url, sourceUrl: source, credits: `${author} · ${license} · Wikimedia Commons` };
}
export function parseMapillaryFeature(feature) {
  const p = feature?.computed_geometry?.coordinates;
  if (!feature || !Array.isArray(p) || !feature.id) return null;
  const [lng, lat] = p;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { provider: 'mly', id: String(feature.id), lat, lng, isPano: feature.is_pano === true, credits: '© Mapillary · contributors' };
}
export function uniqueLocations(entries, max = 100, minKm = .2) {
  const output = [];
  for (const point of entries) {
    if (!point || !eligibleInRegion(point) || output.some(p => p.provider === point.provider && p.id === point.id)) continue;
    if (output.some(p => haversineKm(p, point) < minKm)) continue;
    output.push(point);
    if (output.length >= max) break;
  }
  return output;
}
export function shuffled(array, random = Math.random) {
  const output = [...array];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}
export function createChallenge(rounds) {
  if (!Array.isArray(rounds) || rounds.length < 1 || rounds.length > 10) throw new Error('Sfida non valida');
  if (rounds.some(p => !['pnx', 'commons'].includes(p.provider) || !p.id || (p.provider === 'pnx' && !p.collection))) {
    throw new Error('Queste fotografie non supportano ancora le sfide tramite link.');
  }
  const photos = rounds.map(p => p.provider === 'pnx' ? ['p', p.collection, p.id] : ['c', p.id]);
  return btoa(JSON.stringify({ v: 2, photos })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function readChallenge(encoded) {
  if (!encoded || encoded.length > 4500 || !/^[a-zA-Z0-9_-]+$/.test(encoded)) throw new Error('Link della sfida non valido');
  const json = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4));
  const o = JSON.parse(json);
  if (o?.v === 1 && o.provider === 'pnx' && Array.isArray(o.photos) && o.photos.length <= 10 && o.photos.length >= 1 &&
    o.photos.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(s => typeof s === 'string' && /^[\w-]{1,80}$/.test(s)))) return o;
  if (o?.v !== 2 || !Array.isArray(o.photos) || o.photos.length < 1 || o.photos.length > 10 ||
    !o.photos.every(pair => Array.isArray(pair) && ((pair[0] === 'p' && pair.length === 3 && pair.slice(1).every(s => typeof s === 'string' && /^[\w-]{1,80}$/.test(s))) ||
      (pair[0] === 'c' && pair.length === 2 && /^\d{1,12}$/.test(pair[1]))))) {
    throw new Error('Contenuto della sfida non valido');
  }
  return o;
}
export function formatDistance(km) { return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2).replace('.', ',')} km`; }
export function deriveStats(base, scores, isInfinite) {
  const sum = scores.reduce((a, b) => a + b, 0);
  const result = { played: base.played || 0, won: base.won || 0, streak: base.streak || 0, bestStreak: base.bestStreak || 0, best: base.best || 0, total: base.total || 0 };
  if (!isInfinite) {
    result.played++;
    const win = sum >= scores.length * 3000;
    result.won += Number(win);
    result.streak = win ? result.streak + 1 : 0;
    result.bestStreak = Math.max(result.bestStreak, result.streak);
  }
  result.total += sum;
  result.best = Math.max(result.best, sum);
  return result;
}
