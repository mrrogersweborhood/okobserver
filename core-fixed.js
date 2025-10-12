// core-fixed.js — simple router with static imports
import renderHome from "./home.v263.js";
import renderAbout from "./about.v263.js";
import renderPost from "./detail.v263.js";
export async function router(){
  const app=document.getElementById("app"); if(!app) return;
  const hash=(window.location.hash||"#/").replace(/^#/,"");
  const parts=hash.split("/").filter(Boolean);
  const path=parts[0]||""; const id=parts[1];
  app.innerHTML="";
  try{
    if(!path) await renderHome(app);
    else if(path==="about") await renderAbout(app);
    else if(path==="post"&&id) await renderPost(app,id);
    else await renderHome(app);
  }catch(err){
    console.error("[Router error]",err);
    app.innerHTML=`<div style="padding:1rem;color:#b00020"><strong>Page error:</strong> ${err}</div>`;
  }
}
export function start(){const run=()=>router().catch(console.error); window.addEventListener("hashchange",run); run();}
