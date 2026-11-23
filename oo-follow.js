/* Read-aloud follow-along highlight for the Observer app (v1.0.0).
   Same behaviour as the website: when a chunk of the story starts being spoken, the words being read are
   highlighted (colours live in oo-menu-skin.css: white on blue mode, blue on light mode) and kept in view.
   It hooks speechSynthesis, so it needs no change to the reading code. Browsers without the CSS Highlight API
   simply skip it. */
(function () {
  if (window.__ooFollow) { return; }
  window.__ooFollow = 1;
  var SS = window.speechSynthesis, P = window.SpeechSynthesis && window.SpeechSynthesis.prototype;
  if (!SS || !P || !window.CSS || !CSS.highlights || typeof Highlight === 'undefined') { return; }
  var ROOTS = '.post-detail-content';
  var SKIP = 'audio,video,iframe,form,script,style,noscript,figure,aside,nav,button,svg,[hidden],[aria-hidden="true"],.wp-caption,.oo-listen-box,.oo-comments-panel,.oo-comments-toggle,.author-box';
  var map = null, flat = '', pos = 0, clearT = 0;

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

  function show(text) {
    if (!map) { build(); }
    var f = strip(text), i = flat.indexOf(f, pos);
    if (i < 0) { i = flat.indexOf(f); }
    if (i < 0 && /[.!?]$/.test(f)) { f = f.slice(0, -1); i = flat.indexOf(f, pos); if (i < 0) { i = flat.indexOf(f); } }
    if (i < 0 && f.length > 80) {
      var s0 = flat.indexOf(f.slice(0, 40), pos); if (s0 < 0) { s0 = flat.indexOf(f.slice(0, 40)); }
      if (s0 >= 0) { var s1 = flat.indexOf(f.slice(-40), s0); if (s1 >= 0) { i = s0; f = flat.slice(s0, s1 + 40); } }
    }
    if (i < 0 || !f.length) { CSS.highlights.delete('oo-read'); return; }
    var a = i * 2, b = (i + f.length - 1) * 2;
    var r = document.createRange();
    try { r.setStart(map[a], map[a + 1]); r.setEnd(map[b], map[b + 1] + 1); } catch (e) { return; }
    pos = i + f.length;
    CSS.highlights.set('oo-read', new Highlight(r));
    var rc = r.getBoundingClientRect(), vh = window.innerHeight;
    if (rc.height && (rc.bottom > vh * 0.88 || rc.top < vh * 0.12)) {
      var y = window.scrollY + rc.top - vh * 0.35;
      var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { window.scrollTo({ top: Math.max(0, y), behavior: (rm || Math.abs(y - window.scrollY) > vh * 1.5) ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, Math.max(0, y)); }
    }
  }
  /* a new story means a new page of text: forget the old map */
  function reset() { map = null; flat = ''; pos = 0; }
  function off() { clearTimeout(clearT); CSS.highlights.delete('oo-read'); pos = 0; }

  var sp = P.speak;
  P.speak = function (u) {
    try {
      if (u && u.addEventListener && u.text) {
        u.addEventListener('start', function () { clearTimeout(clearT); try { show(u.text); } catch (e) {} });
        u.addEventListener('end', function () { clearT = setTimeout(off, 1200); });
        u.addEventListener('error', function () { clearT = setTimeout(off, 300); });
      }
    } catch (e) {}
    return sp.call(this, u);
  };
  var cn = P.cancel;
  P.cancel = function () { off(); reset(); return cn.apply(this, arguments); };
  window.addEventListener('hashchange', function () { off(); reset(); });
})();
