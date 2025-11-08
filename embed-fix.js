/* 🟢 embed-fix.js – additive hotfix (no baseline edits)
   Purpose:
   - Ensure real video players are visible on post detail
   - Remove black placeholder divs (empty iframes / hidden wrappers)
   - If WP only left a bare URL, inject a proper player (Vimeo/YouTube/Facebook)
   Safe:
   - Pure add-on. Delete this file or its script tag to fully revert.
*/

(function () {
  const BUILD = "2025-11-07SR1-embedHotfix1";
  console.log("[OkObserver] embed-fix.js", BUILD);

  // Run when DOM is ready AND again after hash change navigations (SPA)
  document.addEventListener("DOMContentLoaded", run);
  window.addEventListener("hashchange", () => setTimeout(run, 0));

  function run() {
    // Only act on post detail routes: #/post/12345
    const hash = (location.hash || "").toLowerCase();
    if (!/^#\/post\/\d+/.test(hash)) return;

    // Try multiple times in case baseline renders content slightly later
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const ok = fixEmbeds();
      if (ok || tries >= 10) clearInterval(t);
    }, 120);
  }

  function fixEmbeds() {
    const root = document.querySelector(".post-body") || document.getElementById("app");
    if (!root) return false;

    let changed = false;

    // 1) Make any existing iframes / WP wrappers visible & sized
    const candidates = root.querySelectorAll("iframe, .wp-block-embed, .wp-block-embed__wrapper, .fb-video, [data-embed-url]");
    candidates.forEach(el => {
      if (el.tagName === "IFRAME") {
        styleIframe(el);
        changed = true;
      } else {
        // If wrapper has an iframe inside, style that; else unhide wrapper
        const ifr = el.querySelector("iframe");
        if (ifr) {
          styleIframe(ifr);
          changed = true;
        } else {
          // Some themes hide wrappers; unhide them
          el.style.display = "block";
          el.style.visibility = "visible";
          el.style.opacity = "1";
        }
      }
    });

    // 2) Remove obvious black placeholders (empty iframes with 0 size or no src)
    const empties = root.querySelectorAll("iframe:not([src]), iframe[src=''], iframe[src='#']");
    empties.forEach(e => {
      const rect = e.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        e.remove();
        changed = true;
      }
    });

    // 3) If there is still NO visible player, try to inject from a bare URL in the content
    if (!root.querySelector("iframe")) {
      const url = findFirstMediaUrl(root.innerHTML);
      if (url) {
        const ifr = buildPlayer(url);
        if (ifr) {
          // Insert after first paragraph or at end of article
          const firstP = root.querySelector("article.post-body p, .post-body p, p");
          (firstP || root).insertAdjacentElement("afterend", ifr);
          changed = true;
          console.log("[OkObserver] embed-fix: injected player from", url);
        }
      }
    }

    // 4) Collapse big white gaps: any obvious huge empty spacer before iframe
    const box = previousSiblingBlock(root.querySelector("iframe"));
    if (box && /^\s*$/.test(box.textContent || "") && box.tagName === "DIV") {
      const rect = box.getBoundingClientRect();
      if (rect.height > 60) {
        box.style.margin = "0";
        box.style.padding = "0";
        box.style.height = "0";
      }
    }

    return changed;
  }

  function styleIframe(ifr) {
    ifr.style.display = "block";
    ifr.style.visibility = "visible";
    ifr.style.opacity = "1";
    ifr.style.width = "100%";
    ifr.style.maxWidth = "100%";
    ifr.style.minHeight = "480px";
    ifr.style.border = "0";
    ifr.style.background = "black";
    ifr.allow = "autoplay; encrypted-media; picture-in-picture";
    ifr.setAttribute("allowfullscreen", "true");
  }

  function findFirstMediaUrl(html) {
    const m = html.match(/https?:\/\/(?:www\.)?(?:vimeo\.com\/\d+|youtu\.be\/[\w-]+|youtube\.com\/watch\?[^"'<\s]+|facebook\.com\/[^"'<\s]+)/i);
    return m ? m[0] : null;
  }

  function buildPlayer(url) {
    let src = "";
    if (/vimeo\.com\/(\d+)/i.test(url)) {
      const id = url.match(/vimeo\.com\/(\d+)/i)[1];
      src = `https://player.vimeo.com/video/${id}`;
    } else if (/youtu\.be\/([\w-]+)/i.test(url)) {
      const id = url.match(/youtu\.be\/([\w-]+)/i)[1];
      src = `https://www.youtube.com/embed/${id}`;
    } else if (/youtube\.com\/watch/i.test(url)) {
      const id = (url.match(/[?&]v=([\w-]+)/i) || [])[1];
      if (id) src = `https://www.youtube.com/embed/${id}`;
    } else if (/facebook\.com\//i.test(url)) {
      src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
    }
    if (!src) return null;

    const ifr = document.createElement("iframe");
    ifr.src = src;
    styleIframe(ifr);
    ifr.style.margin = "0 auto 16px";
    return ifr;
  }

  function previousSiblingBlock(node) {
    if (!node) return null;
    let n = node.previousElementSibling;
    while (n && getComputedStyle(n).display === "contents") n = n.previousElementSibling;
    return n || null;
  }
})();

/* 🔴 embed-fix.js */
