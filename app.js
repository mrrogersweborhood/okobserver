// app.js — SMOKE TEST ONLY
const APP_VERSION = "smoke-1.56.3";
window.APP_VERSION = APP_VERSION;

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <div style="padding:16px;border:1px solid #cfc;background:#eaffea;border-radius:8px">
      ✅ JS loaded. Version: <strong>${APP_VERSION}</strong><br>
      If you can see this, the site is serving app.js correctly.
    </div>
  `;
  const y=document.getElementById("year"); if (y) y.textContent=new Date().getFullYear();
  const v=document.getElementById("appVersion"); if (v) v.textContent=APP_VERSION;
});
