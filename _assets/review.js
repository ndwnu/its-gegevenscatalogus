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
 *   data-l10n      JSON met de UI-teksten in de paginataal (standaard: Engels);
 *                  zie docpublish/services/chrome.py:review_l10n. Eén review.js
 *                  bedient alle taalversies, dus de pagina levert de teksten.
 *
 * Review staat alleen open op de AANTOONBAAR NIEUWSTE versie. Het script haalt
 * de latest-pagina op (respecConfig.latestVersion) en vergelijkt diens
 * thisVersion met die van deze pagina. Alleen bij een match (of als deze pagina
 * de latest-pagina zelf is) verschijnt de review-knop; in ALLE andere gevallen
 * (andere versie, latest-pagina onbereikbaar, pagina van vóór de latest-laag)
 * is review gesloten. Geen statusbestand: de publicatie zelf is de bron.
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
  const t = Object.assign(
    {
      button: "Review comment",
      title: "Review mode",
      instruction: "Select text and click {button} to create a GitHub issue.",
      view: "View comments",
      close: "Close",
      general: "General",
      closed: "Review is closed for this version.",
      latest: "Go to the latest version",
    },
    parseL10n(script?.dataset.l10n),
  );

  function parseL10n(raw) {
    // Kapotte of ontbrekende JSON mag de review-knop niet breken: dan Engels.
    try {
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

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
    if (!sec) return { id: "", title: t.general };
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

  function addStyle() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Opgebouwd met DOM-nodes i.p.v. innerHTML: de teksten komen van buiten
  // het script (data-l10n) en mogen nooit als HTML geïnterpreteerd worden.
  function makeBanner(heading) {
    const banner = document.createElement("div");
    banner.className = "rv-banner";
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", t.close);
    close.textContent = "×";
    close.onclick = () => banner.remove();
    const title = document.createElement("b");
    title.textContent = heading;
    banner.append(close, title);
    return banner;
  }

  function makeLink(href, text, newTab) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    if (newTab) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    return a;
  }

  // Oudere versie: geen review-knop, alleen een verwijzing naar de nieuwste
  // (als die bekend is; pagina's van vóór de latest-laag kennen hem niet).
  function initClosed(latestUrl) {
    addStyle();
    const banner = makeBanner(t.closed);
    if (latestUrl) banner.append(makeLink(latestUrl, t.latest, false));
    document.body.appendChild(banner);
  }

  function init() {
    addStyle();

    const btn = document.createElement("button");
    btn.className = "rv-btn";
    btn.type = "button";
    btn.textContent = `💬 ${t.button}`;
    document.body.appendChild(btn);

    const banner = makeBanner(t.title);
    // {button} in de instructie wordt de cursieve knopnaam; de rest is tekst.
    const [before, after = ""] = t.instruction.split("{button}");
    const em = document.createElement("i");
    em.textContent = t.button;
    banner.append(before, em, `${after} `);
    banner.append(makeLink(`https://github.com/${cfg.repo}/issues?q=label%3Areview`, t.view, true));
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

  // ---------- alleen de nieuwste versie ----------
  // respecConfig staat in een <script class="remove"> vóór dit script. ReSpec
  // haalt dat element weg, maar de globale variabele blijft bestaan.
  function versionUrls() {
    const rc = window.respecConfig;
    return { self: rc?.thisVersion, latest: rc?.latestVersion };
  }

  // De latest-pagina is een bytekopie van een versiepagina: diens
  // respecConfig.thisVersion zegt welke versie nu de nieuwste is.
  function thisVersionIn(html) {
    const m = html.match(/"thisVersion"\s*:\s*("(?:[^"\\]|\\.)*")/);
    if (!m) return null;
    try {
      return JSON.parse(m[1]);
    } catch (e) {
      return null;
    }
  }

  // Vergelijk zonder query, fragment en een afsluitende index.html: ".../nl/"
  // en ".../nl/index.html" zijn dezelfde pagina.
  function sameUrl(a, b) {
    const norm = (u) => {
      const url = new URL(u, location.href);
      url.search = "";
      url.hash = "";
      return url.href.replace(/index\.html?$/i, "");
    };
    try {
      return norm(a) === norm(b);
    } catch (e) {
      return false;
    }
  }

  // Fail-closed: review alleen als AANTOONBAAR is dat dit de nieuwste versie is.
  // Geen latest-laag (publicatie van vóór #106), latest-pagina onbereikbaar of
  // zonder thisVersion -> gesloten. Liever een keer te veel dicht (herladen
  // lost een netwerkhapering op) dan een oude versie die open blijft.
  async function isLatest() {
    const { self, latest } = versionUrls();
    if (!latest) return false;
    if (sameUrl(location.href, latest)) return true; // dit ís de latest-pagina
    if (!self) return false;
    try {
      const res = await fetch(latest, { cache: "no-cache" });
      if (!res.ok) return false;
      const current = thisVersionIn(await res.text());
      return Boolean(current) && sameUrl(current, self);
    } catch (e) {
      return false;
    }
  }

  // Sectie-id's en koppen worden pas bij het selecteren uitgelezen, dus het maakt
  // niet uit of ReSpec nog aan het renderen is. Werkt ook op een statische export.
  async function start() {
    if (!cfg.repo) {
      console.warn("[review.js] No repo known; set data-repo=\"owner/repo\" on the script tag.");
      return;
    }
    if (await isLatest()) {
      init();
    } else {
      initClosed(versionUrls().latest);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
