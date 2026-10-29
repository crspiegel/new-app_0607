/* ---- QR student page (play.html) ------------------------------------------
   One printed QR per BOOK: /q/<lv>/<month>/<book> (or the play.html?l=&m=&b=
   fallback). The page reads that level/month's one content_pages row over
   REST and shows the teacher 페이지2 board for THAT BOOK ONLY (board-view.js
   markup + board.css): the book's toolbar slots, its cover, its weeks.
   Tapping a button opens the player overlay (video) or offers the game. No
   link back into the teacher site, no other month, level or book.

   Loaded after video-source.js (shared data + URL parsers), board-view.js
   (shared DOM builders) and supabase-config.js (public URL + anon key; blanks
   itself on localhost unless craDevLive(true)). Read-only: there is no write
   call anywhere in this file, and no Storage request (covers are static
   files under /assets/covers, see coverAssetPath). */

// How a domain-locked publisher video (tps-education.com/58?video=<id>) is
// played. Vimeo only allows those ids on tps-education.com, so:
//   "page"        frame the publisher page itself (works on any host)
//   "direct"      embed player.vimeo.com/video/<id> (only when this page is
//                 served from a tps-education.com host — play.tps-education.com)
//   "player-page" frame PUBLISHER_PLAYER_URL + <id> (a bare TPS player page)
// Picked by host, so one deploy serves both www.cambridgereading.com/q/…
// ("page") and play.tps-education.com/q/… ("direct").
const PUBLISHER_STRATEGY = publisherStrategy(
  playHost(window.location.hostname, window.location.search),
);
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

const $ = (selector) => document.querySelector(selector);

const playRoot = $("#play");
// Page-level notice (invalid code / could not load).
const playNotice = $("#playNotice");
const playNoticeEmoji = $("#playNoticeEmoji");
const playNoticeTitle = $("#playNoticeTitle");
const playNoticeText = $("#playNoticeText");
const playRetry = $("#playRetry");
// The board (same ids as the teacher 페이지2).
const boardScreen = $("#contentScreen");
const contentLevelName = $("#contentLevelName");
const contentBannerMonthNumber = $("#contentBannerMonthNumber");
const contentMainMonthNumber = $("#contentMainMonthNumber");
const contentTitle = $("#contentTitle");
const contentPathTag = $("#contentPathTag");
const contentToolbar = $("#contentScreen .content-toolbar");
const lessonGrid = $("#lessonGrid");
// The player overlay.
const playOverlay = $("#playOverlay");
const playClose = $("#playClose");
const playStage = $("#playStage");
const playFrame = $("#playFrame");
const playStart = $("#playStart");
const playClickLayer = $("#playClickLayer");
const playCard = $("#playCard");
const playCardEmoji = $("#playCardEmoji");
const playCardTitle = $("#playCardTitle");
const playCardText = $("#playCardText");
const playGame = $("#playGame");
const playEnd = $("#playEnd");
const playAgain = $("#playAgain");
const playNext = $("#playNext");
const playNextInline = $("#playNextInline");
const playTitle = $("#playTitle");
const playFullscreen = $("#playFullscreen");
const playFullscreenExit = $("#playFullscreenExit");

const playState = {
  route: null, // { level, month, book }
  row: null, // { videos, labels } or null when the month has no row
  slot: "", // the slot on the player (overlay open)
  playback: null, // resolvePlayback() result for the current slot
  player: null, // { play, pause, destroy } for YouTube / Vimeo SDK players
  paused: false,
  // Our tap layer only goes over a player once it has actually played: if a
  // mobile browser blocked autoplay, the first tap must reach the player's
  // own play button instead.
  layerArmed: false,
  // Bumped by every teardown. A YouTube/Vimeo mount waits for its API script;
  // if the child tapped again meanwhile (even the same video), the older
  // mount's id is stale and it must not build a second, audible player.
  mountId: 0,
  // "native" (Fullscreen API on #playStage), "pseudo" (CSS, iPhone Safari
  // has no element Fullscreen API) or "" when not full screen.
  fullscreen: "",
  open: false, // overlay showing
  // One history entry is pushed when the overlay opens, so the phone's back
  // button closes it (popstate) instead of leaving the page.
  pushed: false,
};

/* ---- Pure helpers (exposed on window.craPlay for tests) ----------------- */

function publisherStrategy(hostname) {
  return /(^|\.)tps-education\.com$/i.test(String(hostname || ""))
    ? "direct"
    : "page";
}

// A Vimeo link we can embed ourselves: vimeo.com/<id>, vimeo.com/<id>/<hash>
// (a private link) or player.vimeo.com/video/<id>?h=<hash>. null for any
// other shape (showcase, channel ...), which the SDK then looks up by URL.
function vimeoLink(str) {
  let url;
  try {
    url = new window.URL(String(str || "").trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id = null;
  let hash = null;
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const match = url.pathname.match(/^\/(\d+)(?:\/([0-9a-f]+))?\/?$/i);
    if (match) [, id, hash] = match;
  } else if (host === "player.vimeo.com") {
    const match = url.pathname.match(/^\/video\/(\d+)\/?$/);
    if (match) [, id] = match;
    hash = url.searchParams.get("h");
  }
  if (id == null) return null;
  return hash && /^[0-9a-f]+$/i.test(hash)
    ? { id: Number(id), hash }
    : { id: Number(id) };
}

// No Fullscreen API at all (iPhone Safari, in-app browsers on iPhone): there
// a Vimeo video plays with playsinline=0, so iOS shows it in its own real
// full screen instead of our pseudo one. Read at play time.
function noFullscreenApi() {
  return !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

// The host the page acts as. On a dev machine `?host=play.tps-education.com`
// stands in for the real host (Playwright checks direct mode with it); a
// live host ignores the parameter.
function playHost(hostname, search) {
  if (hostname !== "127.0.0.1" && hostname !== "localhost") return hostname;
  return new URLSearchParams(search || "").get("host") || hostname;
}

// "/q/<lv>/<month>/<book>" (trailing slash allowed), else "?l=&m=&b=".
// Level and month tokens are case-insensitive (video-source.js); the book
// must be one the level has (Beginner: 1 only). null for anything else —
// including the first-generation weekday tokens (/q/b/3/w1-mon), which were
// never printed or registered.
function parsePlayRoute(pathname, search) {
  const params = new URLSearchParams(search || "");
  const match = String(pathname || "").match(
    /^\/q\/([^/]+)\/([^/]+)\/([^/]+)\/?$/i,
  );
  let tokens = [params.get("l"), params.get("m"), params.get("b")];
  if (match) {
    try {
      tokens = match.slice(1).map(decodeURIComponent);
    } catch {
      return null;
    }
  }
  const level = levelFromQrCode(tokens[0]);
  const month = monthFromNumber(tokens[1]);
  const bookToken = String(tokens[2] == null ? "" : tokens[2]).trim();
  const book =
    level && /^\d$/.test(bookToken) ? bookEntry(level, bookToken) : null;
  if (!level || !month || !book) return null;
  return { level, month, book: book.book };
}

// A phone on a dead connection can leave a request hanging far longer than a
// child will wait; after this the page shows "Can't load right now." + Try
// again instead of an endless loading state.
const FETCH_TIMEOUT_MS = 10000;

// One row of content_pages. null = the month has no row yet (not an error);
// throws on a missing config (offline dev), HTTP error (e.g. 402), network
// failure or the FETCH_TIMEOUT_MS limit. The row holds every slot of the
// month; the page only ever uses this book's keys (bookSlotKeys).
// Until supabase/levels/01-rename.sql has run the row may still carry the old
// level key, so ONE read asks for both (levelDbKeys) and the new-key row wins.
async function fetchPageRow(level, month) {
  const base = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Supabase is not configured");
  // PostgREST list: a value with a space ("Level 2") must be double-quoted.
  const levels = levelDbKeys(level)
    .map((value) => (/^[a-z0-9-]+$/.test(value) ? value : `"${value}"`))
    .join(",");
  const url =
    `${base}/rest/v1/content_pages` +
    `?level=in.${encodeURIComponent(`(${levels})`)}` +
    `&month=eq.${encodeURIComponent(month)}` +
    "&select=level,videos,labels";
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
    const row = rows.find((item) => item.level === level) || rows[0];
    return { videos: row.videos || {}, labels: row.labels || {} };
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
  const parsed = parseVideoSource(str, { publisher: strategy });
  if (!parsed) return null;
  // A game URL in a video (weekday) slot: same as the toolbar game slot.
  if (parsed.kind === "game") return { type: "game", url: parsed.url };
  if (parsed.kind === "youtube") return { type: "youtube", id: parsed.id };
  if (parsed.kind === "vimeo") {
    if (parsed.id != null) return { type: "vimeo", id: parsed.id };
    const link = vimeoLink(parsed.url);
    return link
      ? { type: "vimeo", ...link }
      : { type: "vimeo", url: parsed.url };
  }
  const vimeoId = publisherVimeoId(parsed.url);
  if (vimeoId != null && strategy === "player-page" && PUBLISHER_PLAYER_URL) {
    return { type: "frame", url: `${PUBLISHER_PLAYER_URL}${vimeoId}` };
  }
  return { type: "frame", url: parsed.url };
}

function slotKind(level, slot) {
  const item = toolbarButtons(level).find((b) => b.slot === slot);
  return item ? item.kind : "video";
}

function slotUrl(row, slot) {
  return (row && row.videos && row.videos[slot]) || "";
}

// The next slot after `slot` in THIS BOOK (board order: its toolbar slots,
// then its weeks Mon..Fri) that has a playable VIDEO — games and
// empty/whitespace slots are skipped. null when nothing follows in the book,
// so Next never leads to a "Coming soon" or into the other book.
function nextFilledSlot(row, level, book, slot) {
  if (!row) return null;
  const keys = bookSlotKeys(level, book);
  const after = keys.slice(keys.indexOf(slot) + 1);
  return (
    after.find(
      (key) =>
        slotKind(level, key) === "video" &&
        resolvePlayback(slotUrl(row, key), "video") !== null,
    ) || null
  );
}

/* ---- Page state (loading / invalid / error / board) ---------------------- */

const NOTICES = {
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
};

function setState(state) {
  playRoot.dataset.state = state;
}

function showNotice(name) {
  const notice = NOTICES[name];
  playNoticeEmoji.textContent = notice.emoji;
  playNoticeTitle.textContent = notice.title;
  playNoticeText.textContent = notice.text;
  playRetry.hidden = !notice.retry;
  playNotice.hidden = false;
}

function hideNotice() {
  playNotice.hidden = true;
}

/* ---- Overlay state ------------------------------------------------------- */

function setOverlayState(state) {
  if (state) playOverlay.dataset.state = state;
  else delete playOverlay.dataset.state;
  syncControls();
}

function syncControls() {
  const state = playOverlay.dataset.state || "";
  const type = playState.playback && playState.playback.type;
  const next =
    playState.route && playState.slot
      ? nextFilledSlot(
          playState.row,
          playState.route.level,
          playState.route.book,
          playState.slot,
        )
      : null;
  playOverlay.dataset.player = state === "playing" ? type || "" : "";
  playStart.hidden = !(
    (state === "ready" && type && type !== "game") ||
    (state === "playing" && playState.paused)
  );
  // Paused too: a paused player shows links out (Vimeo logo; YouTube title,
  // logo, more videos), so the layer keeps covering it and a tap resumes.
  playClickLayer.hidden = !(
    state === "playing" &&
    playState.player &&
    playState.layerArmed
  );
  playEnd.hidden = state !== "ended";
  playNext.hidden = !next;
  playNextInline.hidden = !(
    next &&
    type === "frame" &&
    (state === "ready" || state === "playing")
  );
  // iPhone + Vimeo: iOS's own full screen replaces ours (see noFullscreenApi).
  playFullscreen.hidden = !(
    (state === "playing" || state === "ended") &&
    !playState.fullscreen &&
    !(type === "vimeo" && noFullscreenApi())
  );
  playFullscreenExit.hidden = !playState.fullscreen;
  // Full screen has its own ✕ on the stage.
  playClose.hidden = Boolean(playState.fullscreen);
}

const CARDS = {
  empty: {
    emoji: "🎬",
    title: "Coming soon!",
    text: "This video isn't ready yet. Check back soon!",
  },
  game: { emoji: "🎮", title: "", text: "", game: true },
};

function showCard(name) {
  const card = CARDS[name];
  playOverlay.dataset.card = name;
  playCardEmoji.textContent = card.emoji;
  playCardTitle.textContent = card.title;
  playCardText.textContent = card.text;
  playGame.hidden = !card.game;
  playCard.hidden = false;
}

function hideCard() {
  delete playOverlay.dataset.card;
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
  if (!playState.open || !playState.playback) return;
  if (playState.playback.type === "game") return;
  setOverlayState("ended");
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

// A Vimeo id plays in our own player.vimeo.com iframe, which the SDK then
// wraps — it never has to look the id up first. On a tps-education.com host
// this is how the publisher's domain-locked videos play ("direct").
function vimeoFrame(id, hash) {
  const frame = document.createElement("iframe");
  const params = new URLSearchParams();
  if (hash) params.set("h", hash);
  // No title / uploader / portrait links out (honoured on free plans too;
  // the Vimeo logo stays, under our tap layer).
  params.set("title", "0");
  params.set("byline", "0");
  params.set("portrait", "0");
  params.set("playsinline", noFullscreenApi() ? "0" : "1");
  frame.src = `https://player.vimeo.com/video/${id}?${params}`;
  frame.title = playTitle.textContent;
  frame.allow = "autoplay; fullscreen; picture-in-picture";
  frame.allowFullscreen = true;
  return frame;
}

function mountVimeo(playback) {
  const mountId = playState.mountId;
  const frame =
    playback.id != null ? vimeoFrame(playback.id, playback.hash) : null;
  if (frame) playFrame.appendChild(frame);
  loadVimeoApi()
    .then(() => {
      if (mountId !== playState.mountId) return; // superseded by a later tap
      const player = frame
        ? new window.Vimeo.Player(frame)
        : new window.Vimeo.Player(playFrame, {
            url: playback.url,
            title: false,
            byline: false,
            portrait: false,
            playsinline: !noFullscreenApi(),
            responsive: false,
          });
      player.on("play", () => setPaused(false));
      player.on("pause", () => setPaused(true));
      player.on("ended", showEnded);
      // Captions off, like YouTube (a no-op when the video has none).
      player.disableTextTrack().catch(() => {});
      player.play().catch(() => {});
      playState.player = {
        play: () => player.play().catch(() => {}),
        pause: () => player.pause().catch(() => {}),
        destroy: () => player.destroy(),
      };
    })
    .catch(() => {
      // The SDK could not load: fall back to the page-level notice.
      closeOverlay({ viaHistory: true });
      showNotice("error");
      setState("error");
    });
}

// Runs inside a tap handler, so mobile browsers count it as a user gesture.
function startPlayback() {
  const playback = playState.playback;
  if (!playback || playback.type === "game") return;
  teardownPlayer();
  hideCard();
  setOverlayState("playing");
  if (playback.type === "frame") mountFrame(playback.url);
  else if (playback.type === "youtube") mountYouTube(playback.id);
  else mountVimeo(playback);
}

/* ---- Full screen ----------------------------------------------------------- */

function setFullscreen(mode) {
  playState.fullscreen = mode;
  if (mode) playOverlay.dataset.fullscreen = mode;
  else delete playOverlay.dataset.fullscreen;
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

/* ---- Overlay open / close --------------------------------------------------- */

function openOverlay() {
  if (playState.open) return;
  playState.open = true;
  playOverlay.hidden = false;
  document.body.classList.add("play-overlay-open");
  if (!playState.pushed) {
    window.history.pushState({ playOverlay: true }, "");
    playState.pushed = true;
  }
}

// ✕ and Esc go back through history (so the entry pushed on open is consumed
// and the next back leaves the page as expected); popstate then lands here
// with viaHistory and does the actual closing.
function closeOverlay({ viaHistory = false } = {}) {
  if (!playState.open) return;
  if (!viaHistory && playState.pushed) {
    window.history.back();
    return;
  }
  playState.pushed = false;
  if (playState.fullscreen) exitFullscreen();
  teardownPlayer();
  hideCard();
  playState.open = false;
  playState.playback = null;
  playState.slot = "";
  playTitle.textContent = "";
  playOverlay.hidden = true;
  document.body.classList.remove("play-overlay-open");
  setOverlayState("");
}

/* ---- Board ----------------------------------------------------------------- */

function labelsOf() {
  return (playState.row && playState.row.labels) || {};
}

// Paint the static cover (coverAssetPath) only once it has loaded, so a
// missing file leaves the white placeholder like the teacher site does.
function applyCover(card, level, month, book) {
  const src = coverAssetPath(level, month, book);
  if (!src) return;
  const img = new window.Image();
  img.addEventListener("load", () => {
    card.classList.add("has-cover");
    card.style.backgroundImage = `url("/${src}")`;
  });
  img.src = `/${src}`;
}

// The teacher 페이지2 board for this book: banner + title block, the book's
// toolbar slots, its cover card and its week rows — same builders and class
// names as index.html, so board.css styles both identically.
function renderBoard() {
  const { level, month, book } = playState.route;
  const entry = bookEntry(level, book);
  const labels = labelsOf();
  boardScreen.className = `screen screen-active ${levelThemeClass(level)}`;
  boardScreen.dataset.month = month;
  const number = String(monthNumber(month));
  contentLevelName.textContent = levelLabel(level);
  contentBannerMonthNumber.textContent = number;
  contentMainMonthNumber.textContent = number;
  contentTitle.textContent = `${month} Reading Plan`;
  contentPathTag.textContent = levelLabel(level);

  const buttons = bookToolbarButtons(level, book);
  contentToolbar.innerHTML = "";
  // 6-button levels get a 2-row grid on the teacher site; a book shows 4.
  contentToolbar.classList.toggle("content-toolbar--wide", buttons.length > 4);
  buttons.forEach((item, index) => {
    contentToolbar.append(
      buildToolbarButton(item, labels[item.slot] || item.label, {
        active: index === 0,
      }),
    );
  });

  const title = bookTitle(level, book, labels);
  lessonGrid.innerHTML = "";
  const card = buildCoverCard(entry.book, title);
  applyCover(card, level, month, book);
  lessonGrid.append(card);
  entry.weeks.forEach((week) => {
    const row = buildWeekRow(week, title);
    lessonGrid.append(row.label, ...row.buttons);
  });
}

// A board tap: open the overlay and play (the tap is the user gesture), or
// show the game / coming-soon card.
function openSlot(slot) {
  const { level } = playState.route;
  teardownPlayer();
  playState.slot = slot;
  playTitle.textContent = slotTitle(level, slot, labelsOf());
  const playback = resolvePlayback(
    slotUrl(playState.row, slot),
    slotKind(level, slot),
  );
  playState.playback = playback;
  openOverlay();
  if (!playback) {
    showCard("empty");
    setOverlayState("empty");
    return;
  }
  if (playback.type === "game") {
    showCard("game");
    setOverlayState("ready");
    return;
  }
  hideCard();
  startPlayback();
}

async function loadRow() {
  const { level, month } = playState.route;
  hideNotice();
  setState("loading");
  try {
    playState.row = await fetchPageRow(level, month);
  } catch {
    showNotice("error");
    setState("error");
    return;
  }
  renderBoard();
  setState("board");
}

/* ---- Events + boot --------------------------------------------------------- */

// Toolbar + weekday taps (delegated — the buttons are re-rendered per book).
if (contentToolbar) {
  contentToolbar.addEventListener("click", (event) => {
    const button = event.target.closest(".content-type");
    if (!button || !button.dataset.slot) return;
    contentToolbar
      .querySelectorAll(".content-type")
      .forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    openSlot(button.dataset.slot);
  });
}

lessonGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".lesson-button");
  if (button && button.dataset.slot) openSlot(button.dataset.slot);
});

playClose.addEventListener("click", () => closeOverlay());

window.addEventListener("popstate", () => {
  if (playState.open) closeOverlay({ viaHistory: true });
  else playState.pushed = false;
});

playStart.addEventListener("click", () => {
  if (playState.player && playState.paused) playState.player.play();
  else startPlayback();
});

playClickLayer.addEventListener("click", () => {
  if (!playState.player) return;
  if (playState.paused) playState.player.play();
  else playState.player.pause();
});

playRetry.addEventListener("click", loadRow);

playAgain.addEventListener("click", startPlayback);

function playNextSlot() {
  const next = nextFilledSlot(
    playState.row,
    playState.route.level,
    playState.route.book,
    playState.slot,
  );
  if (next) openSlot(next);
}
playNext.addEventListener("click", playNextSlot);
playNextInline.addEventListener("click", playNextSlot);

playFullscreen.addEventListener("click", enterFullscreen);
playFullscreenExit.addEventListener("click", exitFullscreen);

// Native full screen also ends by the phone's back gesture or Esc.
document.addEventListener("fullscreenchange", () => {
  setFullscreen(document.fullscreenElement === playStage ? "native" : "");
});

// Esc leaves pseudo full screen first, then closes the overlay.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (playState.fullscreen === "pseudo") setFullscreen("");
  else if (playState.open && !playState.fullscreen) closeOverlay();
});

playGame.addEventListener("click", () => {
  // Same tab, so the phone's back button returns here. Game pages are
  // responsive (checked at 375px), unlike the teacher site's 1280x720 modal.
  if (playState.playback && playState.playback.type === "game") {
    window.location.assign(playState.playback.url);
  }
});

window.craPlay = {
  publisherStrategy,
  playHost,
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
  showNotice("invalid");
  setState("invalid");
} else {
  document.body.dataset.level = playState.route.level; // per-level colors
  document.title = `${levelLabel(playState.route.level)} ${monthNumber(
    playState.route.month,
  )} · Book ${playState.route.book} · Cambridge Reading Adventures`;
  loadRow();
}
