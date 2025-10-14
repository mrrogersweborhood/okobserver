// utils.js v2.65

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function fetchWithRetry(url, opts = {}, attempts = 3, delayMs = 400) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} - ${text.slice(0, 140)}`);
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) return await res.json();
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw lastErr;
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch {
    return iso || '';
  }
}

export function stripTags(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').trim();
}

// Keep a default export to satisfy any legacy import patterns
export default { fetchWithRetry, fmtDate, stripTags };
