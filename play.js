/* ---- QR student page (play.html) ------------------------------------------
   A QR code printed in the book opens /q/<lv>/<month>/<slot> (or the
   play.html?l=&m=&s= fallback). The page reads that level/month's one
   content_pages row over REST and plays the slot's video — or offers the
   slot's game — on its own, with no link back into the teacher site.

   Loaded after video-source.js (shared data + URL parsers) and
   supabase-config.js (public URL + anon key; blanks itself on localhost
   unless craDevLive(true)). Read-only: there is no write call anywhere in
   this file, and no Storage request (no banners, backgrounds or covers). */

// How a domain-locked publisher video (tps-education.com/58?video=<id>) is
// played. Vimeo only allows those ids on tps-education.com, so:
//   "page"        frame the publisher page itself (works on any host — today)
//   "direct"      embed player.vimeo.com/video/<id> (only when this page is
//                 served from a tps-education.com subdomain)
//   "player-page" frame PUBLISHER_PLAYER_URL + <id> (a bare TPS player page)
const PUBLISHER_STRATEGY = "page";
// e.g. "https://tps-education.com/player?video=" once TPS builds that page.
// While empty, "player-page" behaves like "page".
const PUBLISHER_PLAYER_URL = "";

const YT_PLAYER_VARS = {
  autoplay: 1,
  controls: 0,
  rel: 0,
  modestbranding: 1,
  playsinline: 1,
  fs: 0,
  disablekb: 1,
  iv_load_policy: 3,
  // Not an official "off" value (only 1 is documented); harmless. The real
  // work is disableYouTubeCaptions (video-source.js), called from onReady,
  // PLAYING and onApiChange — keep all three, the module loads lazily.
  cc_load_policy: 0,
};

const playRoot = document.querySelector("#play");
const playLevel = document.querySelector("#playLevel");
const playMonth = document.querySelector("#playMonth");
const playTitle = document.querySelector("#playTitle");
const playStage = document.querySelector("#playStage");
const playFrame = document.querySelector("#playFrame");
const playStart = document.querySelector("#playStart");
const playClickLayer = document.querySelector("#playClickLayer");
const playCard = document.querySelector("#playCard");
const playCardEmoji = document.querySelector("#playCardEmoji");
const playCardTitle = document.querySelector("#playCardTitle");
const playCardText = document.querySelector("#playCardText");
const playRetry = document.querySelector("#playRetry");
const playGame = document.querySelector("#playGame");
const playEnd = document.querySelector("#playEnd");
const playAgain = document.querySelector("#playAgain");
const playNext = document.querySelector("#playNext");
const playNextInline = document.querySelector("#playNextInline");
const playList = document.querySelector("#playList");
const playFullscreen = document.querySelector("#playFullscreen");
const playFullscreenExit = document.querySelector("#playFullscreenExit");

const playState = {
  route: null, // { level, month, slot, solo }
  row: null, // { videos, labels } or null when the month has no row
  slot: "",
  playback: null, // resolvePlayback() result for the current slot
  player: null, // { play, pause, destroy } for YouTube / Vimeo SDK players
  paused: false,
  // Our tap layer only goes over a player once it has actually played: if a
  // mobile browser blocked autoplay, the first tap must reach the player's
  // own play button instead.
  layerArmed: false,
  listReady: false, // the month list is built once the row has loaded
  // Bumped by every teardown. A YouTube/Vimeo mount waits for its API script;
  // if the child tapped again meanwhile (even the same video), the older
  // mount's id is stale and it must not build a second, audible player.
  mountId: 0,
  // "native" (Fullscreen API on #playStage), "pseudo" (CSS, iPhone Safari
  // has no element Fullscreen API) or "" when not full screen.
  fullscreen: "",
};

/* ---- Pure helpers (exposed on window.craPlay for tests) ----------------- */

// "/q/<lv>/<month>/<slot>" (trailing slash allowed), else "?l=&m=&s=".
// Every token is case-insensitive; returns null for anything invalid.
function parsePlayRoute(pathname, search) {
  const params = new URLSearchParams(search || "");
  const match = String(pathname || "").match(
    /^\/q\/([^/]+)\/([^/]+)\/([^/]+)\/?$/i,
  );
  let tokens = [params.get("l"), params.get("m"), params.get("s")];
  if (match) {
    try {
      tokens = match.slice(1).map(decodeURIComponent);
    } catch {
      return null;
    }
  }
  const level = levelFromQrCode(tokens[0]);
  const month = monthFromNumber(tokens[1]);
  const slot = level ? slotFromQr(tokens[2], level) : null;
  if (!level || !month || !slot) return null;
  return { level, month, slot, solo: params.get("solo") === "1" };
}

// A phone on a dead connection can leave a request hanging far longer than a
// child will wait; after this the page shows "Can't load right now." + Try
// again instead of an endless loading state.
const FETCH_TIMEOUT_MS = 10000;

// One row of content_pages. null = the month has no row yet (not an error);
// throws on a missing config (offline dev), HTTP error (e.g. 402), network
// failure or the FETCH_TIMEOUT_MS limit.
async function fetchPageRow(level, month) {
  const base = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Supabase is not configured");
  const url =
    `${base}/rest/v1/content_pages` +
    `?level=eq.${encodeURIComponent(level)}` +
    `&month=eq.${encodeURIComponent(month)}` +
    "&select=videos,labels";
  const controller = new window.AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await window.fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return { videos: rows[0].videos || {}, labels: rows[0].labels || {} };
  } finally {
    window.clearTimeout(timer);
  }
}

// What to mount for a stored slot value. kind is the slot's kind ("video" or
// "game"). null = nothing to play (empty / whitespace).
function resolvePlayback(url, kind, strategy = PUBLISHER_STRATEGY) {
  const str = String(url || "").trim();
  if (!str) return null;
  if (kind === "game") return { type: "game", url: str };
  const parsed = parseVideoSource(str);
  if (!parsed) return null;
  if (parsed.kind === "youtube") return { type: "youtube", id: parsed.id };
  if (parsed.kind === "vimeo") {
    return parsed.id != null
      ? { type: "vimeo", id: parsed.id }
      : { type: "vimeo", url: parsed.url };
  }
  const vimeoId = publisherVimeoId(parsed.url);
  if (vimeoId != null && strategy === "direct") {
    return { type: "vimeo", id: vimeoId };
  }
  if (vimeoId != null && strategy === "player-page" && PUBLISHER_PLAYER_URL) {
    return { type: "frame", url: `${PUBLISHER_PLAYER_URL}${vimeoId}` };
  }
  return { type: "frame", url: parsed.url };
}

function slotKind(level, slot) {
  const item = toolbarButtons(level).find((b) => b.slot === slot);
  return item ? item.kind : "video";
}

// slotTitle(level, slot, labels) is in video-source.js (shared with
// scripts/make-qr-list.mjs, so the Naver QR list reads like this page).

function slotUrl(row, slot) {
  return (row && row.videos && row.videos[slot]) || "";
}

// The next slot after `slot` (board order: toolbar, then w1-Mon..w4-Fri)
// that has a playable VIDEO — games and empty/whitespace slots are skipped.
// null when nothing follows, so Next never leads to a "Coming soon".
function nextFilledSlot(row, level, slot) {
  if (!row) return null;
  const keys = allSlotKeys(level);
  const after = keys.slice(keys.indexOf(slot) + 1);
  return (
    after.find(
      (key) =>
        slotKind(level, key) === "video" &&
        resolvePlayback(slotUrl(row, key), "video") !== null,
    ) || null
  );
}

/* ---- Screen state -------------------------------------------------------- */

function setState(state) {
  playRoot.dataset.state = state;
  syncControls();
}

function syncControls() {
  const state = playRoot.dataset.state;
  const type = playState.playback && playState.playback.type;
  const solo = Boolean(playState.route && playState.route.solo);
  const next =
    !solo && playState.route
      ? nextFilledSlot(playState.row, playState.route.level, playState.slot)
      : null;
  playRoot.dataset.player = state === "playing" ? type || "" : "";
  playStart.hidden = !(
    (state === "ready" && type && type !== "game") ||
    (state === "playing" && playState.paused)
  );
  playClickLayer.hidden = !(
    state === "playing" &&
    playState.player &&
    playState.layerArmed &&
    !playState.paused
  );
  playEnd.hidden = state !== "ended";
  playNext.hidden = !next;
  playNextInline.hidden = !(
    next &&
    type === "frame" &&
    (state === "ready" || state === "playing")
  );
  playList.hidden = solo || !playState.listReady;
  playFullscreen.hidden = !(
    (state === "playing" || state === "ended") &&
    !playState.fullscreen
  );
  playFullscreenExit.hidden = !playState.fullscreen;
}

const CARDS = {
  invalid: {
    emoji: "🤔",
    title: "Oops! This code doesn't work.",
    text: "Try scanning it again.",
  },
  error: {
    emoji: "📡",
    title: "Can't load right now.",
    text: "Check the internet and try again.",
    retry: true,
  },
  empty: {
    emoji: "🎬",
    title: "Coming soon!",
    text: "This video isn't ready yet. Check back soon!",
  },
  game: { emoji: "🎮", title: "", text: "", game: true },
};

function showCard(name) {
  const card = CARDS[name];
  playRoot.dataset.card = name;
  playCardEmoji.textContent = card.emoji;
  playCardTitle.textContent = card.title;
  playCardText.textContent = card.text;
  playRetry.hidden = !card.retry;
  playGame.hidden = !card.game;
  playCard.hidden = false;
}

function hideCard() {
  delete playRoot.dataset.card;
  playCard.hidden = true;
}

/* ---- Players -------------------------------------------------------------- */

let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return ytApiPromise;
}

let vimeoApiPromise = null;
function loadVimeoApi() {
  if (window.Vimeo && window.Vimeo.Player) return Promise.resolve();
  if (vimeoApiPromise) return vimeoApiPromise;
  vimeoApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://player.vimeo.com/api/player.js";
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return vimeoApiPromise;
}

function teardownPlayer() {
  if (playState.player) {
    try {
      playState.player.destroy();
    } catch {
      /* ignore */
    }
  }
  playState.player = null;
  playState.paused = false;
  playState.layerArmed = false;
  playFrame.innerHTML = "";
  playState.mountId += 1;
}

function setPaused(paused) {
  playState.paused = paused;
  if (!paused) playState.layerArmed = true;
  syncControls();
}

// A YouTube/Vimeo video finished (a framed publisher page cannot tell us):
// stop and offer Watch again / Next over the player's end screen.
function showEnded() {
  if (!playState.playback || playState.playback.type === "game") return;
  setState("ended");
}

function mountFrame(url) {
  const frame = document.createElement("iframe");
  frame.src = url;
  frame.title = playTitle.textContent;
  frame.allow = "autoplay; fullscreen; picture-in-picture";
  frame.allowFullscreen = true;
  playFrame.appendChild(frame);
}

function mountYouTube(videoId) {
  const mountId = playState.mountId;
  loadYouTubeApi().then(() => {
    if (mountId !== playState.mountId) return; // superseded by a later tap
    const host = document.createElement("div");
    playFrame.appendChild(host);
    const yt = new window.YT.Player(host, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: YT_PLAYER_VARS,
      events: {
        onApiChange: () => disableYouTubeCaptions(yt),
        onReady: () => {
          disableYouTubeCaptions(yt);
          try {
            yt.playVideo();
          } catch {
            /* the player's own play button still works */
          }
        },
        onStateChange: (event) => {
          const S = window.YT.PlayerState;
          if (event.data === S.PLAYING) {
            disableYouTubeCaptions(yt);
            setPaused(false);
          } else if (event.data === S.PAUSED) {
            setPaused(true);
          } else if (event.data === S.ENDED) {
            showEnded();
          }
        },
      },
    });
    playState.player = {
      play: () => yt.playVideo(),
      pause: () => yt.pauseVideo(),
      destroy: () => yt.destroy(),
    };
  });
}

function mountVimeo(playback) {
  const mountId = playState.mountId;
  loadVimeoApi()
    .then(() => {
      if (mountId !== playState.mountId) return; // superseded by a later tap
      const player = new window.Vimeo.Player(playFrame, {
        ...(playback.id != null ? { id: playback.id } : { url: playback.url }),
        playsinline: true,
        responsive: false,
      });
      player.on("play", () => setPaused(false));
      player.on("pause", () => setPaused(true));
      player.on("ended", showEnded);
      player.play().catch(() => {});
      playState.player = {
        play: () => player.play().catch(() => {}),
        pause: () => player.pause().catch(() => {}),
        destroy: () => player.destroy(),
      };
    })
    .catch(() => {
      showCard("error");
      setState("error");
    });
}

// Runs inside a tap handler, so mobile browsers count it as a user gesture.
function startPlayback() {
  const playback = playState.playback;
  if (!playback || playback.type === "game") return;
  teardownPlayer();
  hideCard();
  setState("playing");
  if (playback.type === "frame") mountFrame(playback.url);
  else if (playback.type === "youtube") mountYouTube(playback.id);
  else mountVimeo(playback);
}

/* ---- Full screen ----------------------------------------------------------- */

function setFullscreen(mode) {
  playState.fullscreen = mode;
  if (mode) playRoot.dataset.fullscreen = mode;
  else delete playRoot.dataset.fullscreen;
  // Pseudo full screen is all CSS (play.css "Full screen"): the stage covers
  // the viewport, everything else is hidden and the page cannot scroll.
  document.body.classList.toggle("play-fullscreen", mode === "pseudo");
  syncControls();
}

// The stage (not the video iframe) goes full screen, so our own buttons stay
// on top of the picture. YouTube keeps fs:0 — this is the only way in.
function enterFullscreen() {
  if (document.fullscreenEnabled && playStage.requestFullscreen) {
    // fullscreenchange sets "native"; a refused request falls back.
    playStage.requestFullscreen().catch(() => setFullscreen("pseudo"));
  } else {
    setFullscreen("pseudo");
  }
}

function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else setFullscreen("");
}

/* ---- Slots ----------------------------------------------------------------- */

function showSlot(slot) {
  const { level } = playState.route;
  teardownPlayer();
  playState.slot = slot;
  playTitle.textContent = slotTitle(
    level,
    slot,
    playState.row && playState.row.labels,
  );
  const playback = resolvePlayback(
    slotUrl(playState.row, slot),
    slotKind(level, slot),
  );
  playState.playback = playback;
  if (!playback) {
    showCard("empty");
    setState("empty");
    return;
  }
  if (playback.type === "game") {
    showCard("game");
  } else {
    hideCard();
    // Fetch the API now so the player can be built sooner after the tap.
    if (playback.type === "youtube") loadYouTubeApi();
  }
  setState("ready");
}

// Keep the address bar on the slot being shown, in whichever form the page
// was opened (/q/... or play.html?...), so a refresh stays put.
function slotAddress(slot) {
  const { level, month } = playState.route;
  const { pathname, search } = window.location;
  if (/^\/q\//i.test(pathname)) return qrPath(level, month, slot) + search;
  const params = new URLSearchParams(search);
  params.set("s", slotToQr(slot));
  return `${pathname}?${params}`;
}

function markCurrent() {
  playList.querySelectorAll(".play-item").forEach((item) => {
    if (item.dataset.slot === playState.slot) {
      item.setAttribute("aria-current", "true");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

// Switch slots without another REST read (the row is cached). Called from a
// tap, so with `play` the video mounts straight away (user gesture).
function goToSlot(slot, { play = false } = {}) {
  showSlot(slot);
  playState.route.slot = slot;
  window.history.replaceState(null, "", slotAddress(slot));
  markCurrent();
  if (play && playRoot.dataset.state === "ready") startPlayback();
}

function listItem(level, slot, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "play-item";
  button.dataset.slot = slot;
  button.setAttribute(
    "aria-label",
    slotTitle(level, slot, playState.row && playState.row.labels),
  );
  const label = document.createElement("span");
  label.className = "play-item-label";
  label.textContent = text;
  button.append(label);
  if (!resolvePlayback(slotUrl(playState.row, slot), slotKind(level, slot))) {
    // Still tappable — it shows the Coming soon card.
    button.classList.add("is-empty");
    const soon = document.createElement("span");
    soon.className = "play-soon";
    soon.textContent = "Soon";
    button.append(soon);
  }
  return button;
}

// The month at a glance, shaped like the teacher board: toolbar slots, then
// one row per week with Mon-Fri.
function renderList() {
  const { level } = playState.route;
  const labels = playState.row && playState.row.labels;
  playList.innerHTML = "";

  const tools = document.createElement("div");
  tools.className = "play-list-tools";
  toolbarButtons(level).forEach((item) => {
    const button = listItem(
      level,
      item.slot,
      slotTitle(level, item.slot, labels),
    );
    button.classList.add("play-item-tool");
    tools.append(button);
  });
  playList.append(tools);

  for (let week = 1; week <= 4; week += 1) {
    const row = document.createElement("div");
    row.className = "play-week-row";
    const weekLabel = document.createElement("span");
    weekLabel.className = "play-week";
    weekLabel.innerHTML = `${week}<span class="play-week-word"> week</span>`;
    row.append(weekLabel);
    weekdays.forEach((day) => {
      const button = listItem(level, `w${week}-${day}`, day);
      button.classList.add("play-item-day");
      row.append(button);
    });
    playList.append(row);
  }
  playState.listReady = true;
  markCurrent();
}

async function loadRow() {
  const { level, month } = playState.route;
  hideCard();
  playState.listReady = false;
  setState("loading");
  try {
    playState.row = await fetchPageRow(level, month);
  } catch {
    showCard("error");
    setState("error");
    return;
  }
  playState.slot = playState.route.slot;
  renderList();
  showSlot(playState.route.slot);
}

/* ---- Events + boot --------------------------------------------------------- */

playStart.addEventListener("click", () => {
  if (playState.player && playState.paused) playState.player.play();
  else startPlayback();
});

playClickLayer.addEventListener("click", () => {
  if (playState.player) playState.player.pause();
});

playRetry.addEventListener("click", loadRow);

playAgain.addEventListener("click", startPlayback);

function playNextSlot() {
  const next = nextFilledSlot(
    playState.row,
    playState.route.level,
    playState.slot,
  );
  if (next) goToSlot(next, { play: true });
}
playNext.addEventListener("click", playNextSlot);
playNextInline.addEventListener("click", playNextSlot);

playFullscreen.addEventListener("click", enterFullscreen);
playFullscreenExit.addEventListener("click", exitFullscreen);

// Native full screen also ends by the phone's back gesture or Esc.
document.addEventListener("fullscreenchange", () => {
  setFullscreen(document.fullscreenElement === playStage ? "native" : "");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && playState.fullscreen === "pseudo") {
    setFullscreen("");
  }
});

playList.addEventListener("click", (event) => {
  const item = event.target.closest(".play-item");
  if (item) goToSlot(item.dataset.slot, { play: true });
});

playGame.addEventListener("click", () => {
  // Same tab, so the phone's back button returns here. Game pages are
  // responsive (checked at 375px), unlike the teacher site's 1280x720 modal.
  if (playState.playback && playState.playback.type === "game") {
    window.location.assign(playState.playback.url);
  }
});

window.craPlay = {
  parsePlayRoute,
  fetchPageRow,
  resolvePlayback,
  slotTitle,
  nextFilledSlot,
  showEnded,
};

playState.route = parsePlayRoute(
  window.location.pathname,
  window.location.search,
);
if (!playState.route) {
  showCard("invalid");
  setState("invalid");
} else {
  document.body.dataset.level = playState.route.level; // per-level colors
  if (playState.route.solo) playRoot.dataset.solo = "1"; // (A) layout
  playLevel.textContent = levelLabel(playState.route.level);
  playMonth.textContent = String(monthNumber(playState.route.month));
  document.title = `${levelLabel(playState.route.level)} ${monthNumber(
    playState.route.month,
  )} · Cambridge Reading Adventures`;
  loadRow();
}
