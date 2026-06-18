const pageButtons = Array.from(document.querySelectorAll("[data-route]"));
const pages = Array.from(document.querySelectorAll("[data-page]"));
const roleSelect = document.querySelector("[data-role]");
const densityButton = document.querySelector("[data-density-toggle]");
const navResizer = document.querySelector("[data-nav-resizer]");
const treeToggleSelector = "[data-tree-toggle], .nav-folder[aria-expanded], .content-folder[aria-expanded], .tree-folder[aria-expanded], button.tree-folder, [role='button'][aria-expanded]";
const treeChildrenSelector = "[data-tree-children], .tree-children, .nav-branch, .content-branch";
const treeFolderSelector = "[data-tree-folder], [data-tree-node], .nav-branch, .content-branch, .tree-folder, li";
const navWidthStorageKey = "agentic-cms-main-nav-width";

function readCssPixel(name, fallback) {
  const value = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue(name), 10);
  return Number.isFinite(value) ? value : fallback;
}

function clampNavWidth(width) {
  const min = readCssPixel("--nav-min", 240);
  const max = readCssPixel("--nav-max", 420);
  const viewportMax = window.innerWidth > 920 ? Math.min(max, Math.max(min, window.innerWidth - 520)) : max;
  return Math.min(viewportMax, Math.max(min, Math.round(width)));
}

function setNavWidth(width, options = {}) {
  const nextWidth = clampNavWidth(width);
  document.documentElement.style.setProperty("--nav", `${nextWidth}px`);
  navResizer?.setAttribute("aria-valuenow", String(nextWidth));

  if (options.persist !== false) {
    localStorage.setItem(navWidthStorageKey, String(nextWidth));
  }
}

function restoreNavWidth() {
  const storedWidth = Number.parseInt(localStorage.getItem(navWidthStorageKey) || "", 10);
  if (Number.isFinite(storedWidth)) {
    setNavWidth(storedWidth, { persist: false });
  }
}

function resizeNavFromPointer(event) {
  const nav = document.querySelector(".side-nav");
  if (!nav) return;

  const navLeft = nav.getBoundingClientRect().left;
  setNavWidth(event.clientX - navLeft);
}

function startNavResize(event) {
  if (!navResizer || event.button !== 0) return;

  event.preventDefault();
  navResizer.setPointerCapture(event.pointerId);
  document.documentElement.classList.add("is-resizing-nav");
  resizeNavFromPointer(event);

  const handlePointerMove = (moveEvent) => resizeNavFromPointer(moveEvent);
  const stopResize = () => {
    document.documentElement.classList.remove("is-resizing-nav");
    navResizer.removeEventListener("pointermove", handlePointerMove);
    navResizer.removeEventListener("pointerup", stopResize);
    navResizer.removeEventListener("pointercancel", stopResize);
  };

  navResizer.addEventListener("pointermove", handlePointerMove);
  navResizer.addEventListener("pointerup", stopResize);
  navResizer.addEventListener("pointercancel", stopResize);
}

function handleNavResizeKeydown(event) {
  if (!navResizer) return;

  const currentWidth = readCssPixel("--nav", 292);
  const step = event.shiftKey ? 32 : 16;
  const min = readCssPixel("--nav-min", 240);
  const max = readCssPixel("--nav-max", 420);

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setNavWidth(currentWidth - step);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    setNavWidth(currentWidth + step);
  } else if (event.key === "Home") {
    event.preventDefault();
    setNavWidth(min);
  } else if (event.key === "End") {
    event.preventDefault();
    setNavWidth(max);
  }
}

function escapeSelector(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function normalizeRoute(route) {
  return route && document.querySelector(`[data-page="${route}"]`) ? route : "library";
}

function findTreeChildren(toggle) {
  const controls = toggle.getAttribute("aria-controls");
  if (controls) {
    const controlled = document.getElementById(controls);
    if (controlled) return controlled;
  }

  const key = toggle.dataset.treeToggle;
  if (key) {
    const keyed = document.querySelector(`[data-tree-folder="${escapeSelector(key)}"], [data-tree-children="${escapeSelector(key)}"]`);
    if (keyed && keyed !== toggle) {
      const nestedChildren = keyed.querySelector(treeChildrenSelector);
      if (keyed.contains(toggle)) return nestedChildren;
      return keyed.matches(treeChildrenSelector) ? keyed : nestedChildren || keyed;
    }
  }

  if (toggle.matches(".nav-folder, .content-folder")) {
    return toggle.nextElementSibling?.matches(treeChildrenSelector) ? toggle.nextElementSibling : null;
  }

  if (toggle.nextElementSibling?.matches(`${treeChildrenSelector}, [data-tree-folder]`)) {
    return toggle.nextElementSibling;
  }

  const folder = toggle.closest(treeFolderSelector);
  if (folder && folder !== toggle) {
    return folder.querySelector(`:scope > ${treeChildrenSelector}, :scope > ul, :scope > ol`) || folder.querySelector(treeChildrenSelector);
  }

  return toggle.querySelector(treeChildrenSelector);
}

function setTreeExpanded(toggle, expanded) {
  const children = findTreeChildren(toggle);
  const twisty = toggle.querySelector(":scope > .twisty");

  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.classList.toggle("collapsed", !expanded);
  toggle.classList.toggle("is-collapsed", !expanded);
  toggle.classList.toggle("is-open", expanded);
  if (twisty) twisty.textContent = expanded ? "v" : ">";

  if (!children) return;

  children.hidden = !expanded;
  children.classList.toggle("collapsed", !expanded);
  children.classList.toggle("is-collapsed", !expanded);
  children.setAttribute("aria-hidden", String(!expanded));
}

function findFolderToggle(folder) {
  if (folder.matches(treeToggleSelector)) return folder;
  return folder.querySelector(`:scope > ${treeToggleSelector}`) || folder.querySelector(treeToggleSelector);
}

function syncTreeFromMarkup() {
  document.querySelectorAll(treeToggleSelector).forEach((toggle) => {
    if (!toggle.matches("button, [role='button']")) {
      toggle.setAttribute("role", "button");
      toggle.tabIndex = 0;
    }

    if (toggle.hasAttribute("aria-expanded")) {
      setTreeExpanded(toggle, toggle.getAttribute("aria-expanded") !== "false");
    }
  });
}

function updateTreeActiveState(target) {
  document.querySelectorAll(`${treeToggleSelector}, [data-tree-folder], [data-tree-node], .tree-folder, .active-ancestor, .is-active-ancestor`).forEach((element) => {
    element.classList.remove("active-ancestor", "is-active-ancestor");
    if (element.matches(treeToggleSelector) && !element.matches("[data-route]")) element.classList.remove("active");
  });

  pageButtons
    .filter((button) => button.dataset.route === target)
    .forEach((leaf) => {
      leaf.classList.add("active");
      leaf.setAttribute("aria-current", "page");

      for (let element = leaf.parentElement; element && element !== document.body; element = element.parentElement) {
        if (!element.matches(treeFolderSelector)) continue;

        const toggle = findFolderToggle(element);
        if (!toggle || toggle === leaf) continue;

        element.classList.add("active-ancestor", "is-active-ancestor");
        toggle.classList.add("active", "active-ancestor", "is-active-ancestor");
        setTreeExpanded(toggle, true);
      }
    });
}

function showRoute(route) {
  const target = normalizeRoute(route);

  pages.forEach((page) => {
    page.classList.toggle("active", page.dataset.page === target);
  });

  pageButtons.forEach((button) => {
    const isActive = button.dataset.route === target;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  updateTreeActiveState(target);

  const heading = document.querySelector(`[data-page="${target}"] h1`);
  document.title = heading ? `${heading.textContent} - Agentic CMS Mockups` : "Agentic CMS Mockups";
}

function applyRole(role) {
  document.documentElement.dataset.role = role;
  document.querySelectorAll("[data-min-role]").forEach((element) => {
    const minRole = element.dataset.minRole;
    const rank = { reader: 1, maintainer: 2, admin: 3 };
    element.hidden = rank[role] < rank[minRole];
  });
}

window.addEventListener("hashchange", () => {
  showRoute(location.hash.replace("#", ""));
});

pageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    location.hash = button.dataset.route;
  });
});

roleSelect?.addEventListener("change", (event) => {
  applyRole(event.target.value);
});

densityButton?.addEventListener("click", () => {
  const current = document.documentElement.dataset.density || "comfortable";
  const next = current === "comfortable" ? "compact" : "comfortable";
  document.documentElement.dataset.density = next;
  densityButton.textContent = next === "comfortable" ? "Comfortable" : "Compact";
});

navResizer?.addEventListener("pointerdown", startNavResize);
navResizer?.addEventListener("keydown", handleNavResizeKeydown);

window.addEventListener("resize", () => {
  const currentWidth = readCssPixel("--nav", 292);
  setNavWidth(currentWidth, { persist: false });
});

document.addEventListener("click", (event) => {
  const toggle = event.target.closest(treeToggleSelector);
  if (!toggle || !findTreeChildren(toggle)) return;

  setTreeExpanded(toggle, toggle.getAttribute("aria-expanded") === "false");
});

document.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;

  const toggle = event.target.closest(treeToggleSelector);
  if (!toggle || !findTreeChildren(toggle)) return;

  event.preventDefault();
  setTreeExpanded(toggle, toggle.getAttribute("aria-expanded") === "false");
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = original;
      }, 900);
    } catch {
      button.textContent = "Copy failed";
    }
  });
});

restoreNavWidth();
applyRole(roleSelect?.value || "admin");
syncTreeFromMarkup();
showRoute(location.hash.replace("#", ""));
