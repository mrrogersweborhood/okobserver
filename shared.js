// shared.js — small utilities shared across modules

/**
 * Decode HTML entities from WP (covers &amp;, &#8217;, &hellip;, etc).
 */
export function decodeEntities(input = "") {
  if (!input || typeof input !== "string") return "";
  // numeric
  const numeric = input.replace(/&#(\d+);/g, (_, d) => {
    try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; }
  }).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; }
  });
  // named
  const ta = document.createElement("textarea");
  ta.innerHTML = numeric;
  return ta.value;
}

/**
 * Format ISO date into "Month 2nd, 2025".
 */
export function ordinalDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const day = d.getDate();
  const month = d.toLocaleString(undefined, { month: "long" });
  const year = d.getFullYear();
  const suf = (n) => {
    const v = n % 100;
    if (v >= 11 && v <= 13) return "th";
    switch (n % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  };
  return `${month} ${day}${suf(day)}, ${year}`;
}
