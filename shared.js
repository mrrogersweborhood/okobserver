// shared.js — small utilities used by multiple modules

/**
 * Decode common HTML entities (WordPress often returns &amp;, &#8217;, etc)
 */
export function decodeEntities(input = "") {
  if (!input || typeof input !== "string") return "";
  // Fast path for common numeric entities:
  // Replace &#...; with the corresponding character
  const numeric = input.replace(/&#(\d+);/g, (_, d) => {
    try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; }
  }).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; }
  });

  // Named entities via DOM (covers &amp;, &quot;, &hellip;, etc)
  const textarea = document.createElement("textarea");
  textarea.innerHTML = numeric;
  return textarea.value;
}

/**
 * Format ISO date into "Month 2nd, 2025"
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
