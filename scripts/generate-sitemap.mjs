import fs from 'node:fs/promises';

const BASE_URL = 'https://freemovieir.github.io';
const TMDB_KEY = process.env.TMDB_API_KEY || '1dc4cbf81f0accf4fa108820d551dafc';

const staticPaths = [
  '/',
  '/search/index.html',
  '/watchlist/index.html',
  '/settings/index.html',
  '/pages/about-freemovie/',
  '/pages/developer/',
  '/pages/disclaimer/',
  '/pages/disclaimer/index-en.html',
  '/pages/changelog/',
  '/genres/index.html',
  '/upcoming/index.html',
  '/airing-today-tv-show/index.html',
  '/series-top-rated/index.html'
];

async function fetchTmdb(path) {
  const url = `https://api.themoviedb.org/3${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}&language=fa`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status} ${path}`);
  return res.json();
}

async function loadDynamicUrls() {
  const [trendingMovie, trendingTv, upcomingMovie, topTv] = await Promise.all([
    fetchTmdb('/trending/movie/week'),
    fetchTmdb('/trending/tv/week'),
    fetchTmdb('/movie/upcoming?page=1'),
    fetchTmdb('/tv/top_rated?page=1')
  ]);

  const movieIds = new Set([
    ...(trendingMovie.results || []).map((i) => i.id),
    ...(upcomingMovie.results || []).map((i) => i.id)
  ]);
  const tvIds = new Set([
    ...(trendingTv.results || []).map((i) => i.id),
    ...(topTv.results || []).map((i) => i.id)
  ]);

  return [
    ...[...movieIds].map((id) => `/movie/index.html?id=${id}`),
    ...[...tvIds].map((id) => `/series/index.html?id=${id}`)
  ];
}

function xmlUrl(loc, priority = '0.70') {
  const now = new Date().toISOString();
  return `<url><loc>${loc}</loc><lastmod>${now}</lastmod><priority>${priority}</priority></url>`;
}

async function main() {
  let dynamicPaths = [];
  try {
    dynamicPaths = await loadDynamicUrls();
  } catch (error) {
    console.warn('Could not fetch TMDB dynamic URLs, generating sitemap with static paths only.');
  }
  const allPaths = [...new Set([...staticPaths, ...dynamicPaths])];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    allPaths.map((path) => xmlUrl(`${BASE_URL}${path}`, path === '/' ? '1.00' : '0.70')).join('\n') +
    `\n</urlset>\n`;

  await fs.writeFile('sitemap.xml', xml, 'utf8');
  console.log(`sitemap.xml generated with ${allPaths.length} URLs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
