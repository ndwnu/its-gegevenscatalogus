/*
 * review.js — reviewcommentaar op een ReSpec-pagina omzetten naar een GitHub-issue.
 *
 * Gebruik: één regel in het ReSpec-document (bijv. vanuit Ontologica):
 *   <script src="https://xcalibur1978.github.io/temp/review.js" defer
 *           data-repo="xcalibur1978/temp"></script>
 *
 * Optionele attributen:
 *   data-repo      owner/repo waar issues landen (standaard: afgeleid van github.io-URL)
 *   data-template  naam van het issue form (standaard: review.yml)
 *   data-model     naam van het model (standaard: eerste padsegment na de repo)
 *   data-version   versie van het model (standaard: tweede padsegment na de repo)
 *
 * Geen backend nodig: het script opent een vooraf ingevuld issue form op github.com.
 */
(function () {
  "use strict";

  const script = document.currentScript;
  const cfg = {
    repo: script?.dataset.repo || guessRepo(),
    template: script?.dataset.template || "review.yml",
    model: script?.dataset.model,
    version: script?.dataset.version,
  };
  const MAX_QUOTE = 500; // houd de URL beneden de limieten van GitHub/browsers

  function guessRepo() {
    // https://<owner>.github.io/<repo>/...
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    const repo = location.pathname.split("/").filter(Boolean)[0];
    return m && repo ? `${m[1]}/${repo}` : null;
  }

  function pathInfo() {
    // /<repo>/<model>/<versie>/index.html → model + versie
    const parts = decodeURIComponent(location.pathname).split("/").filter(Boolean);
    const rest = parts.slice(1).filter((p) => !/\.html?$/i.test(p));
    return {
      model: cfg.model || rest[0] || document.title || "unknown",
      version: cfg.version || rest[1] || "unknown",
    };
  }

  function sectionOf(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const sec = el?.closest("section[id], [id].section, h1[id], h2[id], h3[id], dt[id], dfn[id]");
    if (!sec) return { id: "", title: "General" };
    const heading = sec.matches("h1,h2,h3") ? sec : sec.querySelector("h1, h2, h3, h4, h5, h6");
    const title = (heading?.textContent || sec.id).replace(/\s+/g, " ").trim();
    return { id: sec.id, title };
  }

  function fragmentLink(quote, secId) {
    const base = location.origin + location.pathname;
    const words = quote.replace(/\s+/g, " ").trim();
    // text fragment: begin,eind zodat lange selecties toch matchen
    let frag;
    if (words.length <= 80) {
      frag = encodeURIComponent(words);
    } else {
      const start = words.slice(0, 40).replace(/\s\S*$/, "");
      const end = words.slice(-40).replace(/^\S*\s/, "");
      frag = `${encodeURIComponent(start)},${encodeURIComponent(end)}`;
    }
    // #<sectie-id>:~:text=… — browsers zonder text fragments vallen terug op de sectie
    return `${base}#${secId || ""}:~:text=${frag}`;
  }

  function buildIssueUrl(quote, section) {
    const { model, version } = pathInfo();
    let q = quote.replace(/\s+/g, " ").trim();
    if (q.length > MAX_QUOTE) q = q.slice(0, MAX_QUOTE) + " …";
    const url = new URL(`https://github.com/${cfg.repo}/issues/new`);
    url.searchParams.set("template", cfg.template);
    url.searchParams.set("title", `[Review] ${model} ${version} — ${section.title}`.slice(0, 200));
    url.searchParams.set("model", model);
    url.searchParams.set("versie", version);
    url.searchParams.set("sectie", section.id ? `${section.title} (#${section.id})` : section.title);
    url.searchParams.set("citaat", q);
    url.searchParams.set("locatie", fragmentLink(quote, section.id));
    return url.toString();
  }

  // ---------- UI ----------
  const css = `
    .rv-btn{position:absolute;z-index:9999;display:none;font:600 13px/1 system-ui,sans-serif;
      background:#1f6feb;color:#fff;border:0;border-radius:6px;padding:8px 12px;cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .rv-btn:hover{background:#1158c7}
    .rv-btn:focus-visible{outline:2px solid #fff;outline-offset:-4px}
    .rv-banner{position:fixed;right:16px;bottom:16px;z-index:9998;max-width:280px;
      font:13px/1.4 system-ui,sans-serif;background:#fff;color:#1f2328;border:1px solid #d0d7de;
      border-radius:8px;padding:10px 12px;box-shadow:0 4px 12px rgba(0,0,0,.12)}
    .rv-banner b{display:block;margin-bottom:2px}
    .rv-banner a{color:#0969da}
    .rv-banner button{float:right;border:0;background:none;font-size:16px;line-height:1;cursor:pointer;color:#656d76}
    @media (prefers-color-scheme:dark){.rv-banner{background:#161b22;color:#e6edf3;border-color:#30363d}
      .rv-banner a{color:#4493f8}}
    @media print{.rv-btn,.rv-banner{display:none!important}}`;

  function init() {
    if (!cfg.repo) {
      console.warn("[review.js] No repo known; set data-repo=\"owner/repo\" on the script tag.");
      return;
    }
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.className = "rv-btn";
    btn.type = "button";
    btn.textContent = "💬 Review comment";
    document.body.appendChild(btn);

    const banner = document.createElement("div");
    banner.className = "rv-banner";
    banner.innerHTML =
      `<button type="button" aria-label="Close">×</button><b>Review mode</b>` +
      `Select text and click <i>Review comment</i> to create a GitHub issue. ` +
      `<a href="https://github.com/${cfg.repo}/issues?q=label%3Areview" target="_blank" rel="noopener">View comments</a>`;
    banner.querySelector("button").onclick = () => banner.remove();
    document.body.appendChild(banner);

    let pending = null;

    function hide() {
      btn.style.display = "none";
      pending = null;
    }

    function onSelect() {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (!text || sel.rangeCount === 0) return hide();
      const range = sel.getRangeAt(0);
      if (btn.contains(range.commonAncestorContainer) || banner.contains(range.commonAncestorContainer)) return;
      const rect = range.getBoundingClientRect();
      pending = { text, section: sectionOf(range.startContainer) };
      btn.style.top = `${window.scrollY + rect.bottom + 6}px`;
      btn.style.left = `${Math.max(8, window.scrollX + rect.left)}px`;
      btn.style.display = "block";
    }

    document.addEventListener("mouseup", (e) => {
      if (e.target === btn) return;
      setTimeout(onSelect, 0);
    });
    document.addEventListener("keyup", (e) => {
      if (e.shiftKey || e.key === "Shift") setTimeout(onSelect, 0);
    });
    document.addEventListener("mousedown", (e) => {
      if (e.target !== btn) hide();
    });
    // touch: selectionchange is het enige betrouwbare signaal
    document.addEventListener("selectionchange", () => {
      if (matchMedia("(pointer: coarse)").matches) setTimeout(onSelect, 300);
    });

    btn.addEventListener("click", () => {
      if (!pending) return;
      window.open(buildIssueUrl(pending.text, pending.section), "_blank", "noopener");
      window.getSelection()?.removeAllRanges();
      hide();
    });
  }

  // Sectie-id's en koppen worden pas bij het selecteren uitgelezen, dus het maakt
  // niet uit of ReSpec nog aan het renderen is. Werkt ook op een statische export.
  function start() {
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
