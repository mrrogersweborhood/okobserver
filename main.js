// main.js — entry point for The Oklahoma Observer app
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev";
console.log("[OkObserver] Entry loaded: v2.5.4");
console.log("[OkObserver] API base (locked):", window.OKO_API_BASE);
import { start } from "./core-fixed.js";
(function(){const y=document.getElementById("year"); if(y) y.textContent=new Date().getFullYear();})();
if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js").catch(()=>{});}
start();
