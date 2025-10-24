// util.js
// v2025-10-24d

/**
 * Tiny, safe DOM factory.
 */
export function el(tag, attrs = {}, children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === 'class' || k === 'className') node.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, String(v));
  }
  if (children != null) {
    if (children instanceof Node) node.appendChild(children);
    else if (Array.isArray(children)) children.forEach(c => (c instanceof Node ? node.appendChild(c) : node.insertAdjacentHTML('beforeend', String(c))));
    else node.insertAdjacentHTML('beforeend', String(children));
  }
  return node;
}

/**
 * Markup helper.
 */
export function html(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? String(vals[i]) : ''), '');
}

/**
 * Remove HTML tags from a string (keeps text).
 */
export function stripTags(input = '') {
  const s = String(input);
  // Quick bail if there are obviously no tags
  if (!/[<>]/.test(s)) return s;
  const tmp = document.createElement('div');
  tmp.innerHTML = s;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Decode basic HTML entities (&amp; &lt; &gt; &quot; &#039;)
 * Falls back to browser parser for anything else.
 */
export function decodeHTMLEntities(input = '') {
  const s = String(input);
  // Fast-track common entities
  const quick = s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#039;', "'");
  if (quick.indexOf('&') === -1) return quick; // done
  // Fallback decode via DOM for any remaining entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = quick;
  return textarea.value;
}

/**
 * Optional: consistent short date (kept because some places use it).
 */
export function formatDate(iso, opts) {
  try {
    return new Date(iso).toLocaleDateString(undefined, opts || { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso ?? '';
  }
}
