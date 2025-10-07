// shared.js — tiny DOM & formatting helpers

export function createEl(tag, attrs={}, children){
  const el = document.createElement(tag);
  if (attrs){
    for (const [k,v] of Object.entries(attrs)){
      if (v == null) continue;
      if (k === 'html'){ el.innerHTML = v; continue; }
      el.setAttribute(k, String(v));
    }
  }
  if (children != null){
    if (Array.isArray(children)){
      for (const c of children){
        if (c == null) continue;
        if (c.nodeType) el.appendChild(c); else el.append(String(c));
      }
    } else {
      if (children.nodeType) el.appendChild(children); else el.append(String(children));
    }
  }
  return el;
}

export function decodeEntities(html){
  if (!html) return '';
  const t = document.createElement('textarea');
  t.innerHTML = html;
  return t.value;
}

export function ordinalDate(iso){
  try{
    const d = new Date(iso);
    const day = d.getDate();
    const suf = (n)=>{
      const j=n%10,k=n%100;
      if (j===1 && k!==11) return 'st';
      if (j===2 && k!==12) return 'nd';
      if (j===3 && k!==13) return 'rd';
      return 'th';
    };
    return d.toLocaleString('en-US',{ month:'long' }) + ' ' + day + suf(day) + ', ' + d.getFullYear();
  }catch{ return ''; }
}

// Ensure the first content block isn’t indented or centered oddly
export function normalizeFirstParagraph(container){
  try{
    const el = container.querySelector(':is(p,div,section,article,blockquote)');
    if (!el) return;
    el.style.textAlign = 'left';
    el.style.textIndent = '0';
    el.style.marginLeft = '0';
    el.style.paddingLeft = '0';
  }catch{}
}
