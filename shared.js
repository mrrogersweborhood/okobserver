// shared.js — small utilities shared across views
// v=2.3.4

export function decodeEntities(str=""){
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

export function ordinalDate(iso){
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.getDate();
  const ord = (n)=>{
    const s=["th","st","nd","rd"], v=n%100;
    return s[(v-20)%10]||s[v]||s[0];
  };
  const m = d.toLocaleString(undefined,{month:"long"});
  const y = d.getFullYear();
  return `${m} ${day}${ord(day)}, ${y}`;
}

export function createEl(tag, attrs={}, children=[]){
  const el = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k==="class") el.className = v;
    else if (k==="html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v==="function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c!=null) el.append(c.nodeType?c:document.createTextNode(c));
  return el;
}

export function selectHeroSrc(featured, fallback="icon.png"){
  if (featured && typeof featured === "string") return featured;
  return fallback;
}

export function normalizeFirstParagraph(container){
  const p = container?.querySelector(":scope > p:first-of-type");
  if (p){
    p.style.textIndent = "0";
    p.style.marginLeft = "0";
    p.style.paddingLeft = "0";
    p.style.textAlign = "left";
  }
}
