/* Read-aloud follow-along highlight for the Observer app (v2.0.0).
   Used wherever the browser's own speech reader is used (desktop, tablet, iPhone; the Android app uses its own
   native path in main.js). The sentence being read gets a soft rounded tint and a solid rounded fill slides
   through it letter by letter in time with the voice. Colours live in oo-menu-skin.css. It hooks speechSynthesis,
   so it needs no change to the reading code. Browsers without the CSS Highlight API simply skip it. */
(function () {
  if (window.__ooFollow) { return; }
  window.__ooFollow = 1;
  var P = window.SpeechSynthesis && window.SpeechSynthesis.prototype;
  if (!window.speechSynthesis || !P || !window.CSS || !CSS.highlights || typeof Highlight === 'undefined') { return; }
  var ROOTS = '.post-detail-content';
  var SKIP = 'audio,video,iframe,form,script,style,noscript,figure,aside,nav,button,svg,[hidden],[aria-hidden="true"],.wp-caption,.oo-listen-box,.oo-comments-panel,.oo-comments-toggle,.author-box,.oo-hl-layer';
  var map = null, flat = '', pos = 0, st = null, raf = 0, clearT = 0, host = null, hostPrev = null, layer = null;

  function build() {
    var roots = [].slice.call(document.querySelectorAll(ROOTS));
    roots = roots.filter(function (r) { return !roots.some(function (o) { return o !== r && o.contains(r); }); });
    map = []; var parts = [];
    roots.forEach(function (root) {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
      while ((n = w.nextNode())) {
        var pe = n.parentElement; if (!pe || pe.closest(SKIP)) { continue; }
        var t = n.nodeValue;
        for (var i = 0; i < t.length; i++) { if (!/\s/.test(t.charAt(i))) { map.push(n, i); parts.push(t.charAt(i)); } }
      }
    });
    flat = parts.join('');
  }
  function strip(s) { return String(s).replace(/\s+/g, ''); }
  function nws(s) { return strip(s).length; }
  function locate(text) {
    if (!map) { build(); }
    var f = strip(text), i = flat.indexOf(f, pos);
    if (i < 0) { i = flat.indexOf(f); }
    if (i < 0 && /[.!?]$/.test(f)) { f = f.slice(0, -1); i = flat.indexOf(f, pos); if (i < 0) { i = flat.indexOf(f); } }
    return (i < 0 || !f.length) ? null : { i: i, len: f.length };
  }
  function sentences(text) {
    var out = [], re = /[^.!?]+[.!?]*["'”’)]*\s*/g, m, c = 0;
    while ((m = re.exec(text))) { var l = nws(m[0]); if (l) { out.push([c, c + l - 1]); c += l; } }
    return out;
  }
  function rangeFor(a, b) {
    var r = document.createRange();
    try { r.setStart(map[a * 2], map[a * 2 + 1]); r.setEnd(map[b * 2], map[b * 2 + 1] + 1); } catch (e) { return null; }
    return r;
  }
  function clearOverlay() {
    if (layer && layer.parentNode) { layer.parentNode.removeChild(layer); }
    if (host && hostPrev) { host.style.position = hostPrev.pos; host.style.isolation = hostPrev.iso; }
    host = null; hostPrev = null; layer = null;
  }
  function hostFor(r) {
    var n = r.commonAncestorContainer, el = n.nodeType === 1 ? n : n.parentElement;
    return (el && (el.closest('p,li,h1,h2,h3,h4,blockquote') || el.closest('div'))) || document.body;
  }
  function ensureHost(h) {
    if (host === h && layer) { return; }
    clearOverlay(); host = h;
    hostPrev = { pos: h.style.position, iso: h.style.isolation };
    if (getComputedStyle(h).position === 'static') { h.style.position = 'relative'; }
    h.style.isolation = 'isolate';
    layer = document.createElement('span'); layer.className = 'oo-hl-layer'; layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<span class="oo-hl-sent"></span><span class="oo-hl-fill"></span>';
    h.insertBefore(layer, h.firstChild);
  }
  function draw(kind, r) {
    if (!layer || !host) { return; }
    var g = layer.querySelector(kind === 's' ? '.oo-hl-sent' : '.oo-hl-fill'); if (!g) { return; }
    var hr = host.getBoundingClientRect(), ox = hr.left + host.clientLeft, oy = hr.top + host.clientTop;
    var raw = [].slice.call(r.getClientRects()).filter(function (q) { return q.width > 0.5 && q.height > 0; })
      .map(function (q) { return { l: q.left - ox, r: q.right - ox, t: q.top - oy, b: q.bottom - oy }; })
      .sort(function (x, y) { return x.t - y.t || x.l - y.l; });
    var lines = [];
    raw.forEach(function (q) {
      var p = lines[lines.length - 1];
      if (p && Math.abs(q.t - p.t) < (p.b - p.t) * 0.6) { p.l = Math.min(p.l, q.l); p.r = Math.max(p.r, q.r); p.t = Math.min(p.t, q.t); p.b = Math.max(p.b, q.b); }
      else { lines.push({ l: q.l, r: q.r, t: q.t, b: q.b }); }
    });
    g.innerHTML = lines.map(function (q) { return '<i style="left:' + (q.l - 3).toFixed(1) + 'px;top:' + (q.t - 1).toFixed(1) + 'px;width:' + (q.r - q.l + 6).toFixed(1) + 'px;height:' + (q.b - q.t + 2).toFixed(1) + 'px"></i>'; }).join('');
  }
  function keepInView(r) {
    var rc = r.getBoundingClientRect(), vh = window.innerHeight;
    if (rc.height && (rc.bottom > vh * 0.85 || rc.top < vh * 0.15)) {
      var y = window.scrollY + rc.top - vh * 0.35;
      var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { window.scrollTo({ top: Math.max(0, y), behavior: (rm || Math.abs(y - window.scrollY) > vh * 1.5) ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, Math.max(0, y)); }
    }
  }
  function tick() {
    raf = 0; if (!st || !map) { return; }
    var now = performance.now();
    var cur = st.done ? st.len - 1 : Math.max(0, Math.min(st.len - 1, Math.floor(st.aI + (now - st.aT) * st.rate)));
    var si = 0; for (var k = 0; k < st.sents.length; k++) { if (cur >= st.sents[k][0]) { si = k; } }
    var S = st.sents[si] || [0, st.len - 1];
    if (si !== st.si) {
      st.si = si; st.shown = -1;
      var rs = rangeFor(st.f + S[0], st.f + S[1]);
      if (rs) { ensureHost(hostFor(rs)); draw('s', rs); keepInView(rs); }
    }
    if (cur !== st.shown) {
      st.shown = cur;
      var rf = rangeFor(st.f + S[0], st.f + Math.max(S[0], cur));
      if (rf) { draw('f', rf); CSS.highlights.set('oo-read', new Highlight(rf)); }
    }
    raf = requestAnimationFrame(tick);
  }
  /* a new story means a new page of text: forget the old map */
  function reset() { map = null; flat = ''; pos = 0; }
  function off() {
    clearTimeout(clearT); st = null; pos = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    try { CSS.highlights.delete('oo-read'); } catch (e) {}
    clearOverlay();
  }
  function begin(u) {
    var loc = locate(u.text); if (!loc) { return; }
    pos = loc.i + loc.len;
    var now = performance.now();
    st = { f: loc.i, len: loc.len, sents: sentences(u.text), aI: 0, aT: now, rate: 0.0135 * (u.rate || 1), bi: null, bt: 0, si: -1, shown: -1, done: false };
    if (!raf) { raf = requestAnimationFrame(tick); }
  }

  var sp = P.speak;
  P.speak = function (u) {
    try {
      if (u && u.addEventListener && u.text) {
        u.addEventListener('start', function () { clearTimeout(clearT); try { begin(u); } catch (e) {} });
        u.addEventListener('boundary', function (e) {
          try {
            if (!st || (e.name && e.name !== 'word')) { return; }
            var k = nws(u.text.slice(0, e.charIndex)), now = performance.now();
            if (st.bi !== null && k > st.bi && now > st.bt) { st.rate = Math.max(0.004, Math.min(0.05, st.rate * 0.5 + ((k - st.bi) / (now - st.bt)) * 0.5)); }
            st.bi = k; st.bt = now; st.aI = k; st.aT = now;
          } catch (x) {}
        });
        u.addEventListener('end', function () { if (st) { st.done = true; } clearT = setTimeout(off, 1200); });
        u.addEventListener('error', function () { clearT = setTimeout(off, 300); });
      }
    } catch (e) {}
    return sp.call(this, u);
  };
  var cn = P.cancel;
  P.cancel = function () { off(); reset(); return cn.apply(this, arguments); };
  window.addEventListener('hashchange', function () { off(); reset(); });
})();
