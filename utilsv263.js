// utils.v263.js
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
  const m = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/i)
           || html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (m) return { src: m[1], alt: m[2] || '' };
  return null;
}
