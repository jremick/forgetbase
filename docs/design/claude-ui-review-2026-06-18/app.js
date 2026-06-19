/* ============================================================================
   ForgetBase — Claude UI Design Review (2026-06-18)
   Static interaction layer. No network, no external dependencies, no storage
   writes required. Everything degrades to a readable static page if JS is off.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---- Route switching (left nav -> .view) ------------------------------- */
  function setRoute(route) {
    $$(".view").forEach(function (v) {
      v.classList.toggle("active", v.getAttribute("data-view") === route);
    });
    $$("[data-route]").forEach(function (b) {
      var on = b.getAttribute("data-route") === route;
      b.classList.toggle("active", on);
      if (on) { b.setAttribute("aria-current", "page"); } else { b.removeAttribute("aria-current"); }
    });
    // Update the breadcrumb "here" + active ancestor folder.
    var active = $('[data-route="' + route + '"]');
    if (active) {
      var here = $(".crumbs .here");
      if (here) { here.textContent = active.getAttribute("data-title") || active.textContent.trim(); }
      var grp = $(".crumbs .group");
      if (grp) { grp.textContent = active.getAttribute("data-group") || "Read"; }
      $$(".nav-folder").forEach(function (f) { f.classList.remove("is-active-ancestor"); });
      var branch = active.closest(".nav-branch");
      if (branch) {
        var folder = branch.previousElementSibling;
        if (folder && folder.classList.contains("nav-folder")) { folder.classList.add("is-active-ancestor"); }
      }
    }
    try { history.replaceState(null, "", "#" + route); } catch (e) {}
    var main = $(".main");
    if (main) { main.scrollTop = 0; }
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", function (e) {
    var routeEl = e.target.closest("[data-route]");
    if (routeEl) { e.preventDefault(); setRoute(routeEl.getAttribute("data-route")); return; }

    var goEl = e.target.closest("[data-goto]");
    if (goEl) { e.preventDefault(); setRoute(goEl.getAttribute("data-goto")); return; }
  });

  /* ---- Density toggle ---------------------------------------------------- */
  var densityBtn = $("[data-density-toggle]");
  if (densityBtn) {
    densityBtn.addEventListener("click", function () {
      var root = document.documentElement;
      var next = root.getAttribute("data-density") === "compact" ? "comfortable" : "compact";
      root.setAttribute("data-density", next);
      densityBtn.textContent = next === "compact" ? "Compact" : "Comfortable";
      densityBtn.setAttribute("aria-pressed", String(next === "compact"));
    });
  }

  /* ---- "View as" role -> body[data-role] (demo affordance) --------------- */
  var roleSel = $("[data-role-select]");
  if (roleSel) {
    roleSel.addEventListener("change", function () {
      document.body.setAttribute("data-role", roleSel.value);
    });
    document.body.setAttribute("data-role", roleSel.value);
  }

  /* ---- Review-annotation layer toggle ------------------------------------ */
  var revBtn = $("[data-review-toggle]");
  if (revBtn) {
    revBtn.addEventListener("click", function () {
      var on = document.body.classList.toggle("show-review");
      revBtn.setAttribute("aria-pressed", String(on));
      revBtn.textContent = on ? "Hide review notes" : "Show review notes";
    });
  }

  /* ---- Copy-to-clipboard affordances ------------------------------------- */
  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-copy]");
    if (!c) { return; }
    var text = c.getAttribute("data-copy");
    var done = function () {
      var prev = c.textContent;
      c.classList.add("copied");
      c.textContent = "Copied";
      setTimeout(function () { c.classList.remove("copied"); c.textContent = prev; }, 1100);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else { done(); }
  });

  /* ---- Generic tab groups: [data-tabs] with [data-tab] -> [data-panel] --- */
  $$("[data-tabs]").forEach(function (group) {
    var tabs = $$("[data-tab]", group);
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var name = tab.getAttribute("data-tab");
        tabs.forEach(function (t) { t.classList.toggle("active", t === tab); });
        var scope = group.getAttribute("data-tabs");
        $$('[data-panel][data-scope="' + scope + '"]').forEach(function (p) {
          p.classList.toggle("active", p.getAttribute("data-panel") === name);
        });
      });
    });
  });

  /* ---- Sub-nav rails (policies / access): [data-subnav] ------------------ */
  $$("[data-subnav]").forEach(function (rail) {
    var btns = $$("button", rail);
    var scope = rail.getAttribute("data-subnav");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var name = btn.getAttribute("data-section");
        btns.forEach(function (b) { b.classList.toggle("active", b === btn); });
        $$('[data-section-panel][data-scope="' + scope + '"]').forEach(function (p) {
          p.classList.toggle("active", p.getAttribute("data-section-panel") === name);
        });
        var label = rail.parentNode.querySelector("[data-subnav-here]");
        if (label) { label.textContent = btn.getAttribute("data-label") || btn.textContent.trim(); }
      });
    });
  });

  /* ---- Approval queue master-detail -------------------------------------- */
  $$("[data-queue]").forEach(function (q) {
    var items = $$(".queue-item", q);
    items.forEach(function (item) {
      item.addEventListener("click", function () {
        items.forEach(function (i) { i.classList.toggle("active", i === item); });
        var id = item.getAttribute("data-request");
        $$('[data-request-detail]').forEach(function (d) {
          d.classList.toggle("active", d.getAttribute("data-request-detail") === id);
        });
      });
    });
  });

  /* ---- Mobile drawer toggles inside device frames ------------------------ */
  $$("[data-m-burger]").forEach(function (b) {
    b.addEventListener("click", function () {
      var frame = b.closest(".device-screen");
      if (!frame) { return; }
      var drawer = $(".m-drawer", frame);
      if (drawer) { drawer.hidden = !drawer.hidden; }
    });
  });

  /* ---- Restore-confirm demo gate (typed confirmation) -------------------- */
  $$("[data-confirm-input]").forEach(function (input) {
    var target = $('[data-confirm-btn="' + input.getAttribute("data-confirm-input") + '"]');
    var phrase = input.getAttribute("data-confirm-phrase");
    if (!target) { return; }
    var sync = function () {
      var ok = input.value.trim() === phrase;
      target.toggleAttribute("disabled", !ok);
      target.setAttribute("aria-disabled", String(!ok));
    };
    input.addEventListener("input", sync);
    sync();
  });

  /* ---- Restore initial route from hash ----------------------------------- */
  var initial = (location.hash || "").replace(/^#/, "");
  var known = $$("[data-view]").map(function (v) { return v.getAttribute("data-view"); });
  setRoute(known.indexOf(initial) >= 0 ? initial : "review");
})();
