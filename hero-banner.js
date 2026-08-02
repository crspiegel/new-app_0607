/* ==== Hero banner carousel (viewer) + admin panel ========================
   Loaded AFTER app.js as a classic script, so it shares app.js's top-level
   lexical scope (sb, isAdmin) the same way background-editor.js does.

   Layer model (see index.html / styles.css):
     .hero-section
       .hero-slides   z-index:1   ← slides live here and animate freely
       svg.hero-wave  z-index:2   ← ONE fixed layer, never part of a slide
   Because an animating slide makes its own stacking context, keeping the wave
   outside the slide layer is what guarantees it always paints on top.

   The default hero (copy + character rig) is slide 1 and stays in normal flow
   so it keeps defining the hero height at every breakpoint; banner slides are
   absolutely positioned over it. With zero banners nothing is built at all —
   no DOM, no timer, no classes — so the hero is exactly as it was before. */

const HERO_SETTINGS_KEY = "hero_banner";
const HERO_BUCKET = "backgrounds";
const HERO_PREFIX = "banners";
const HERO_MAX_BYTES = 5 * 1024 * 1024;
const HERO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const HERO_INTERVALS = [3, 5, 7, 10];
// Transition length, in seconds. 600ms read as an abrupt cut rather than a
// cross-fade, so the admin picks this; it drives both fade and slide.
const HERO_DURATIONS = [1, 2, 3, 4, 5];
const HERO_MODES = ["slide", "fade"];
const HERO_FOCUS = ["top", "center", "bottom"];

const heroSlides = document.querySelector("#heroSlides");
const heroDefaultSlide = heroSlides
  ? heroSlides.querySelector(".hero-slide--default")
  : null;

// Admin panel refs (absent on any page that doesn't ship the admin markup).
const heroBannerList = document.querySelector("#heroBannerList");
const heroBannerUpload = document.querySelector("#heroBannerUpload");
const heroBannerSave = document.querySelector("#heroBannerSave");
const heroBannerStatus = document.querySelector("#heroBannerStatus");
const heroModeInputs = [
  ...document.querySelectorAll('input[name="heroBannerMode"]'),
];
const heroIntervalInputs = [
  ...document.querySelectorAll('input[name="heroBannerInterval"]'),
];
const heroDurationInputs = [
  ...document.querySelectorAll('input[name="heroBannerDuration"]'),
];

/* ---- config ------------------------------------------------------------ */

function heroDefaultConfig() {
  return { mode: "slide", interval: 5, duration: 2, banners: [] };
}

// Anything unexpected in the row falls back to a safe value rather than
// breaking the home page — this is public, user-facing data.
function normalizeHeroConfig(raw) {
  const out = heroDefaultConfig();
  if (!raw || typeof raw !== "object") return out;
  if (HERO_MODES.includes(raw.mode)) out.mode = raw.mode;
  if (HERO_INTERVALS.includes(Number(raw.interval)))
    out.interval = Number(raw.interval);
  if (HERO_DURATIONS.includes(Number(raw.duration)))
    out.duration = Number(raw.duration);
  if (Array.isArray(raw.banners)) {
    out.banners = raw.banners
      .filter((b) => b && typeof b.src === "string" && b.src)
      .map((b) => ({
        src: b.src,
        focus: HERO_FOCUS.includes(b.focus) ? b.focus : "center",
        alt: typeof b.alt === "string" ? b.alt : "",
      }));
  }
  return out;
}

const heroState = {
  config: heroDefaultConfig(),
  slides: [], // .hero-slide elements, index 0 = default hero
  index: 0,
  timer: 0,
  running: false,
};

/* ---- viewer carousel --------------------------------------------------- */

function heroClearTimer() {
  if (heroState.timer) window.clearTimeout(heroState.timer);
  heroState.timer = 0;
}

// Rotation only makes sense while the home screen is the visible one.
// ⚠ A fresh load of "/" never calls showScreen() — #homeScreen ships with
// .screen-active in the markup — so body[data-screen] is ABSENT, not "home".
// Treating absent as home is what makes the carousel run on first paint.
function heroOnHome() {
  const screen = document.body.dataset.screen;
  return !screen || screen === "home";
}

function heroScheduleNext() {
  heroClearTimer();
  if (!heroState.running || heroState.slides.length < 2) return;
  if (document.hidden || !heroOnHome()) return;
  // Cycle = duration + interval, so "유지 시간" means the time a banner is
  // FULLY visible. Folding the transition into the interval instead would let
  // a long cross-fade eat most of a short interval (5s hold + 4s fade would
  // leave 1s of stillness), which is not what the label promises.
  heroState.timer = window.setTimeout(
    () => heroGoTo(heroState.index + 1),
    (heroState.config.interval + heroState.config.duration) * 1000,
  );
}

function heroGoTo(next) {
  const total = heroState.slides.length;
  if (total < 2) return;
  const target = ((next % total) + total) % total;
  if (target === heroState.index) return;
  const current = heroState.slides[heroState.index];
  const incoming = heroState.slides[target];
  if (current) {
    current.classList.remove("is-active");
    // is-leaving sends it out to the LEFT; without it a deactivated slide
    // would jump to the right-hand waiting position instead of exiting.
    current.classList.add("is-leaving");
    window.setTimeout(
      () => current.classList.remove("is-leaving"),
      heroState.config.duration * 1000 + 20,
    );
  }
  if (incoming) {
    incoming.classList.remove("is-leaving");
    incoming.classList.add("is-active");
  }
  heroState.index = target;
  heroScheduleNext();
}

function heroBuildBannerSlide(item) {
  const slide = document.createElement("div");
  slide.className = "hero-slide hero-slide--banner";
  const img = document.createElement("img");
  img.className = "hero-banner-img";
  img.src = item.src;
  img.alt = item.alt || "";
  img.draggable = false;
  img.style.objectPosition = `center ${item.focus}`;
  // A deleted storage object must never leave a blank slide in the rotation.
  img.addEventListener("error", () => heroDropSlide(slide));
  slide.append(img);
  return slide;
}

function heroDropSlide(slide) {
  const at = heroState.slides.indexOf(slide);
  if (at < 0) return;
  heroState.slides.splice(at, 1);
  slide.remove();
  if (heroState.index >= heroState.slides.length) heroState.index = 0;
  if (heroState.slides.length < 2) heroStop();
  else heroScheduleNext();
}

function heroStop() {
  heroState.running = false;
  heroClearTimer();
}

// Rebuild the carousel from a config. Safe to call repeatedly (the admin
// preview does), and a zero-banner config tears everything back down.
function applyHeroBanner(rawConfig) {
  if (!heroSlides || !heroDefaultSlide) return;
  heroStop();
  heroState.config = normalizeHeroConfig(rawConfig);
  heroSlides
    .querySelectorAll(".hero-slide--banner")
    .forEach((el) => el.remove());
  heroSlides.classList.remove("hero-carousel--slide", "hero-carousel--fade");
  heroSlides.style.removeProperty("--hero-transition");
  heroDefaultSlide.classList.add("is-active");
  heroDefaultSlide.classList.remove("is-leaving");
  heroState.slides = [heroDefaultSlide];
  heroState.index = 0;
  if (!heroState.config.banners.length) return;
  heroState.config.banners.forEach((item) => {
    const slide = heroBuildBannerSlide(item);
    heroSlides.append(slide);
    heroState.slides.push(slide);
  });
  heroSlides.style.setProperty(
    "--hero-transition",
    `${heroState.config.duration * 1000}ms`,
  );
  heroSlides.classList.add(`hero-carousel--${heroState.config.mode}`);
  heroState.running = true;
  heroScheduleNext();
}

document.addEventListener("visibilitychange", heroScheduleNext);

// Pause when the user navigates away from home. showScreen() already writes
// body[data-screen], so watching that attribute keeps app.js untouched.
if (heroSlides) {
  new window.MutationObserver(heroScheduleNext).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-screen"],
  });
}

// "settled" = the fetch attempt finished (success OR failure), matching
// craBg.settled — tests wait on it before seeding a known config.
async function hydrateHeroBanner() {
  if (!sb) {
    window.craHero.settled = true;
    return;
  }
  const { data, error } = await sb
    .from("site_settings")
    .select("value")
    .eq("key", HERO_SETTINGS_KEY)
    .maybeSingle();
  window.craHero.settled = true;
  if (error || !data) return;
  applyHeroBanner(data.value);
}

/* ---- admin panel ------------------------------------------------------- */

function setHeroStatus(text) {
  if (heroBannerStatus) heroBannerStatus.textContent = text || "";
}

// The panel edits this draft; nothing reaches site_settings until 저장.
let heroDraft = heroDefaultConfig();

function heroPublicUrl(path) {
  return sb.storage.from(HERO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function renderHeroBannerList() {
  if (!heroBannerList) return;
  heroBannerList.innerHTML = "";
  if (!heroDraft.banners.length) {
    heroBannerList.innerHTML =
      '<p class="admin-banner-empty">등록된 배너가 없습니다 — 업로드로 시작하세요.</p>';
    return;
  }
  heroDraft.banners.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "admin-banner-item";

    const num = document.createElement("span");
    num.className = "admin-banner-num";
    num.textContent = String(index + 2); // slide 1 is always the default hero

    const thumb = document.createElement("div");
    thumb.className = "admin-banner-thumb";
    const img = document.createElement("img");
    img.src = item.src;
    img.alt = "";
    img.loading = "lazy";
    thumb.append(img);

    const focus = document.createElement("div");
    focus.className = "admin-banner-focus";
    const focusLabel = document.createElement("span");
    focusLabel.textContent = "초점";
    focus.append(focusLabel);
    [
      ["top", "위"],
      ["center", "가운데"],
      ["bottom", "아래"],
    ].forEach(([value, text]) => {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `heroFocus${index}`;
      radio.value = value;
      radio.checked = item.focus === value;
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        item.focus = value;
        setHeroStatus("변경됨 — 저장이 필요합니다.");
      });
      label.append(radio, document.createTextNode(` ${text}`));
      focus.append(label);
    });

    const acts = document.createElement("div");
    acts.className = "admin-banner-acts";
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "▲";
    up.title = "위로";
    up.disabled = index === 0;
    up.addEventListener("click", () => heroMove(index, -1));
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "▼";
    down.title = "아래로";
    down.disabled = index === heroDraft.banners.length - 1;
    down.addEventListener("click", () => heroMove(index, 1));
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "삭제";
    del.addEventListener("click", () => {
      heroDraft.banners.splice(index, 1);
      setHeroStatus("변경됨 — 저장이 필요합니다.");
      renderHeroBannerList();
    });
    acts.append(up, down, del);

    row.append(num, thumb, focus, acts);
    heroBannerList.append(row);
  });
}

function heroMove(index, delta) {
  const to = index + delta;
  const list = heroDraft.banners;
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
  setHeroStatus("변경됨 — 저장이 필요합니다.");
  renderHeroBannerList();
}

function syncHeroPanel() {
  heroModeInputs.forEach((input) => {
    input.checked = input.value === heroDraft.mode;
  });
  heroIntervalInputs.forEach((input) => {
    input.checked = Number(input.value) === heroDraft.interval;
  });
  heroDurationInputs.forEach((input) => {
    input.checked = Number(input.value) === heroDraft.duration;
  });
  renderHeroBannerList();
}

heroModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    heroDraft.mode = input.value;
    setHeroStatus("변경됨 — 저장이 필요합니다.");
  });
});

heroIntervalInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    heroDraft.interval = Number(input.value);
    setHeroStatus("변경됨 — 저장이 필요합니다.");
  });
});

heroDurationInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    heroDraft.duration = Number(input.value);
    setHeroStatus("변경됨 — 저장이 필요합니다.");
  });
});

async function heroUploadFile(file, quiet) {
  if (!HERO_TYPES.includes(file.type)) {
    setHeroStatus(`"${file.name}"은 PNG / JPG / WebP가 아니라 건너뜁니다.`);
    return false;
  }
  if (file.size > HERO_MAX_BYTES) {
    setHeroStatus(`"${file.name}"은 5MB를 넘어 건너뜁니다.`);
    return false;
  }
  if (!quiet) setHeroStatus("업로드 중…");
  const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const path = `${HERO_PREFIX}/${Date.now()}-${safe}`;
  const { error } = await sb.storage
    .from(HERO_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) {
    setHeroStatus("업로드 실패.");
    return false;
  }
  heroDraft.banners.push({
    src: heroPublicUrl(path),
    focus: "center",
    alt: "",
  });
  renderHeroBannerList();
  return true;
}

if (heroBannerUpload) {
  heroBannerUpload.addEventListener("click", () => {
    if (!sb || !isAdmin) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = HERO_TYPES.join(",");
    input.multiple = true;
    input.addEventListener("change", async () => {
      const files = [...input.files];
      let ok = 0;
      for (let i = 0; i < files.length; i += 1) {
        if (files.length > 1)
          setHeroStatus(`업로드 중… (${i + 1}/${files.length})`);
        if (await heroUploadFile(files[i], files.length > 1)) ok += 1;
      }
      setHeroStatus(
        files.length > 1
          ? `업로드 완료 (${ok}/${files.length}) — 저장을 눌러 반영하세요.`
          : "업로드 완료 — 저장을 눌러 반영하세요.",
      );
    });
    input.click();
  });
}

if (heroBannerSave) {
  heroBannerSave.addEventListener("click", async () => {
    if (!sb || !isAdmin) return;
    setHeroStatus("저장 중…");
    const value = normalizeHeroConfig(heroDraft);
    const { error } = await sb
      .from("site_settings")
      .upsert({ key: HERO_SETTINGS_KEY, value });
    if (error) {
      setHeroStatus("저장 실패.");
      return;
    }
    // Reflect it on the live hero right away — admin mirrors the user screen.
    applyHeroBanner(value);
    heroDraft = normalizeHeroConfig(value);
    syncHeroPanel();
    setHeroStatus("저장 완료.");
  });
}

// Opening the 배너 tab loads the current config into the draft, so the panel
// always reflects what is live rather than a stale edit from earlier.
document
  .querySelectorAll('.admin-menu-btn[data-admin-view="banner"]')
  .forEach((btn) => {
    btn.addEventListener("click", async () => {
      setHeroStatus("");
      heroDraft = normalizeHeroConfig(heroState.config);
      syncHeroPanel();
      if (!sb) return;
      const { data, error } = await sb
        .from("site_settings")
        .select("value")
        .eq("key", HERO_SETTINGS_KEY)
        .maybeSingle();
      if (error || !data) return;
      heroDraft = normalizeHeroConfig(data.value);
      syncHeroPanel();
    });
  });

/* ---- bridge for Playwright (mirrors craBg / craContent) ---------------- */

window.craHero = {
  settled: false,
  applyHeroBanner,
  normalizeHeroConfig,
  goTo: heroGoTo,
  state: () => ({
    index: heroState.index,
    count: heroState.slides.length,
    mode: heroState.config.mode,
    interval: heroState.config.interval,
    duration: heroState.config.duration,
    running: heroState.running,
  }),
};

hydrateHeroBanner();
