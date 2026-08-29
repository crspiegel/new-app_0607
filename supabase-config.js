// Public Supabase config. The anon key is safe to expose — the database's
// row-level security is what protects writes. NEVER put the service_role key here.
window.SUPABASE_URL = "https://jguuexcgyvyljbcqfpib.supabase.co";
window.SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXVleGNneXZ5bGpiY3FmcGliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzA0MjYsImV4cCI6MjA5NjY0NjQyNn0.HiogLNMOssicMfm1c7qYlYaC_bfrbRmoC0TP4XdNijU";

// Local development defaults to OFFLINE.
//
// Every cold page load pulls each banner and background straight from Storage,
// and that egress is billed against the same free quota that one `npm run qa`
// already emptied once (28.19 GB of cached egress out of a 39 MB bucket, on a
// single monthly active user). The grace period that came with that incident is
// spent, so the next overage restricts the project immediately, with no warning.
// Browsing localhost is a smaller tap than the test suite, but it is the same
// tap, and nothing was closing it.
//
// Blanking the two globals is not a special case: `app.js` already treats a
// missing URL or key as "no client" and renders the static site without one.
// That is the path the site ran on for the whole 402 outage.
//
// To work against real content — checking banners, backgrounds or an upload —
// run `craDevLive(true)` in the console and reload; `craDevLive(false)` goes
// back. Playwright opts in the same way (see tests/smoke.spec.js): the suite is
// tuned against real REST latency, and stubbing REST was tried and rejected.
//
// Production is untouched. The hostname check only ever matches a dev server.
(function () {
  const LIVE_KEY = "cra:dev-live";
  if (!["127.0.0.1", "localhost", "::1", ""].includes(location.hostname)) return;

  // A blocked or unavailable localStorage must fail closed: staying offline
  // costs a developer one console command, while failing open costs egress.
  const readLive = () => {
    try {
      return localStorage.getItem(LIVE_KEY) === "1";
    } catch {
      return false;
    }
  };

  window.craDevLive = function (on = true) {
    try {
      if (on) localStorage.setItem(LIVE_KEY, "1");
      else localStorage.removeItem(LIVE_KEY);
    } catch {
      console.warn("[cra] localStorage is unavailable — dev mode cannot persist.");
      return;
    }
    console.info(`[cra] dev live mode ${on ? "ON" : "OFF"} — reload to apply.`);
  };

  if (readLive()) {
    console.warn(
      "[cra] dev LIVE — this tab reads the production Supabase project and " +
        "spends its egress quota. craDevLive(false) + reload to stop.",
    );
    return;
  }

  window.SUPABASE_URL = "";
  window.SUPABASE_ANON_KEY = "";
  console.info(
    "[cra] dev OFFLINE — Supabase disabled, no egress spent. " +
      "craDevLive(true) + reload to load real content.",
  );
})();
