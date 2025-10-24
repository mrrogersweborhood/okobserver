// util.js — Utility helpers (v2025-10-24b)

// Decode WordPress’s HTML entities safely
export function decodeHTML(str = "") {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

// Format an ISO or WP date string as "Mon DD, YYYY"
export function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr || "";
  }
}
