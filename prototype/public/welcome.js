/**
 * THE WAY IN: landing page (#/welcome) → sign in (#/login) → Home.
 *
 *   1. Landing page: every sign-in link goes to SIGN_IN_HREF. Once signed in,
 *      those links say "Open spine.ai" and go straight to Home instead.
 *   2. Sign in: a work email (and a name, optional) is recorded in this
 *      browser through window.spineAuth (index.html's head script), then the
 *      app opens — at the page that sent the visitor here, or Home.
 *   3. Sign out, in the sidebar: forget who is signed in, back to the landing.
 *
 * There are no accounts on the server yet, so none of this protects anything;
 * it decides which page a visitor sees first. A real sign-in replaces
 * spineAuth's signIn/user and the form handler below.
 *
 * In-page links (#proof) scroll instead of navigating: the app routes on the
 * hash, so a plain "#proof" would be read as a view called "proof".
 */
(function () {
  "use strict";

  /** Where "Sign in" and "Start a run" go while signed out. */
  const SIGN_IN_HREF = "#/login";
  /** Where they go once signed in, and where signing in lands by default. */
  const APP_HREF = "#/home";

  const auth = window.spineAuth;
  if (!auth) return;
  const $ = (sel) => document.querySelector(sel);

  // ── 1. the landing page's links ──────────────────────────────────────────
  function syncLanding() {
    const signedIn = !!auth.user();
    for (const link of document.querySelectorAll("#view-welcome [data-signin]")) {
      link.setAttribute("href", signedIn ? APP_HREF : SIGN_IN_HREF);
    }
    for (const label of document.querySelectorAll("#view-welcome [data-signin-label]")) {
      label.textContent = signedIn ? "Open spine.ai" : "Sign in";
    }
  }

  $("#view-welcome")?.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || link.hasAttribute("data-signin")) return;
    const id = link.getAttribute("href").slice(1);
    if (!id || id.startsWith("/")) return; // a route, not a section
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  });

  // ── 2. sign in ───────────────────────────────────────────────────────────
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** "aanya.singhal@procol.in" → "Aanya Singhal", when no name is given. */
  function nameFromEmail(email) {
    return email
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  /** The page that sent the visitor to sign in (?next=…), if it is an app page. */
  function nextHref() {
    const q = location.hash.split("?")[1] || "";
    const next = new URLSearchParams(q).get("next") || "";
    const view = auth.route(next);
    return next.startsWith("#/") && view && !auth.isPublic(view) ? next : APP_HREF;
  }

  function showError(text) {
    const box = $("#lp-login-error");
    const input = $("#lp-email");
    if (box) {
      box.textContent = text;
      box.hidden = !text;
    }
    if (input) input.setAttribute("aria-invalid", text ? "true" : "false");
  }

  $("#lp-login-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = String($("#lp-email")?.value || "").trim().toLowerCase();
    const name = String($("#lp-name")?.value || "").trim();
    if (!email) {
      showError("Enter your work email.");
      $("#lp-email")?.focus();
      return;
    }
    if (!EMAIL.test(email)) {
      showError("That doesn't look like an email address — check it and try again.");
      $("#lp-email")?.focus();
      return;
    }
    showError("");
    auth.signIn({ email, name: name || nameFromEmail(email), at: new Date().toISOString() });
    syncSignedIn();
    location.hash = nextHref();
  });
  $("#lp-email")?.addEventListener("input", () => showError(""));

  // ── 3. who is signed in, and signing out (sidebar) ───────────────────────
  function syncSignedIn() {
    const u = auth.user();
    const who = $("#sb-user");
    const btn = $("#sb-signout");
    if (who) who.textContent = u ? String(u.name || u.email).split(" ")[0] : "";
    if (btn) {
      btn.title = u ? `Signed in as ${u.email}. Sign out` : "Sign out";
      btn.setAttribute("aria-label", u ? `Sign out ${u.email}` : "Sign out");
    }
    syncLanding();
  }

  $("#sb-signout")?.addEventListener("click", () => {
    auth.signOut();
    syncSignedIn();
    location.hash = "#/welcome";
  });

  // Arriving on sign-in puts the cursor in the email box.
  function focusLogin() {
    if (auth.route(location.hash) === "login") setTimeout(() => $("#lp-email")?.focus(), 0);
  }
  window.addEventListener("hashchange", () => {
    syncSignedIn();
    focusLogin();
  });
  // Another tab signing in or out changes this one too.
  window.addEventListener("storage", (e) => {
    if (e.key !== auth.KEY) return;
    syncSignedIn();
    const go = auth.resolve(location.hash);
    if (go) location.replace(go);
  });

  syncSignedIn();
  focusLogin();
})();
