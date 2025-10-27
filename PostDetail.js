// PostDetail.js — v2025-10-27d
// Updates: removed top back button, single bottom left-aligned back button.
// All other logic (video handling, featured image, cleaning) retained.

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost } from './api.js?v=2025-10-24e';

/* =========================
   Video helpers
   ========================= */

function normalizeVideoSrc(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // YouTube
    if (host.includes('youtu.be')) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return `https://www.youtube.com/embed/${m[1]}`;
    }

    // Vimeo
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) return `https://player.vimeo.com/video/${last}`;
    }
    if (host === 'player.vimeo.com') return url;
  } catch {}
  return null;
}

function findVideoSrcInHTML(html = '') {
  const vimeoOrYT = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+|vimeo\.com\/\d+)/i;
  const div = document.createElement('div');
  div.innerHTML = html;

  // iframe first
  const ifr = div.querySelector('iframe[src]');
  if (ifr) {
    const n = normalizeVideoSrc(ifr.getAttribute('src') || '');
    if (n) return n;
  }

  // anchor next
  const a = Array.from(div.querySelectorAll('a[href]')).find(a => {
    const h = (a.getAttribute('href') || '').toLowerCase();
    return h.includes('youtube.com') || h.includes('youtu.be') || h.includes('vimeo.com');
  });
  if (a) {
    const n = normalizeVideoSrc(a.getAttribute('href') || '');
    if (n) return n;
  }

  // plain-text URL paragraph
  const p = Array.from(div.querySelectorAll('p')).find(p => vimeoOrYT.test((p.textContent || '').trim()));
  if (p) {
    const m = (p.textContent || '').trim().match(vimeoOrYT);
    if (m) {
      const n = normalizeVideoSrc(m[0]);
      if (n) return n;
    }
  }
  return null;
}

/* =========================
   Strip video embeds
   ========================= */

function stripVideoEmbedsFrom(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;

  const selectors = [
    'iframe[src*="youtube.com"]',
    'iframe[src*="youtu.be"]',
    'iframe[src*="vimeo.com"]',
    'a[href*="youtube.com"]',
    'a[href*="youtu.be"]',
    'a[href*="vimeo.com"]',
  ];
  div.querySelectorAll(selectors.join(',')).forEach((n) => n.remove());

  // Remove plain-text oEmbed URLs
  const urlRe = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+|vimeo\.com\/\d+)\s*$/i;
  div.querySelectorAll('p, blockquote, pre').forEach((n) => {
    const t = (n.textContent || '').trim();
    if (urlRe.test(t)) n.remove();
  });

  // Remove WP/Jetpack wrappers
  const WRAPPER_CLS = [
    'wp-block-embed',
    'wp-block-embed__wrapper',
    'wp-embed-aspect-16-9',
    'wp-embed-aspect-4-3',
    'jetpack-video-wrapper',
    'wp-block-video',
    'wp-block-embed-youtube',
    'wp-block-embed-vimeo'
  ];
  div.querySelectorAll('*').forEach((node) => {
    const cls = (node.className || '').toString();
    if (WRAPPER_CLS.some(c => cls.includes(c))) node.remove();
  });

  // Collapse empties
  div.querySelectorAll('p, figure, div').forEach((n) => {
    const text = (n.textContent || '').replace(/\u00a0/g, ' '
