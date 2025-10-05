// about.js — renders About page pulled from WP Pages
import { fetchAboutPage } from "./api.js";
import { createEl } from "./shared.js";

export async function renderAbout(){
  const host = document.getElementById("app");
  if (!host) return;

  host.innerHTML = "Loading…";
  const page = await fetchAboutPage("contact-about-donate");
  const h1 = createEl("h1",{},[page.title || "About"]);
  const content = createEl("div",{class:"content", html: page.html || "<p>About not available.</p>"});
  host.innerHTML = "";
  host.append(createEl("article",{class:"post"},[h1, content]));
}
