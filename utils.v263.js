/* OkObserver · utils.v263.js */
export async function apiFetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
}

export function extractFirstImage(html) {
  if (!html) return null;
  const withAlt = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/i);
  if (withAlt) return { src: withAlt[1], alt: withAlt[2] || '' };
  const simple  = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (simple) return { src: simple[1], alt: '' };
  return null;
}
