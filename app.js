import { songIndex } from "./songs-index.js";

const DB_NAME = "cristo-rey-cancionero";
const DB_VERSION = 1;
const STORE = "songs";
const FAVORITES = "favorites";
const RECENTS = "recents";
const TONES = "tones";
const TONE_MODES = "tone-modes";
const SETTINGS = "settings";
const APP_VERSION = "2026.06.03.82";
const APP_VERSION_KEY = "app-version";
const SEED_VERSION = "himnos-221-v82";
const SEED_VERSION_KEY = "seed-version";
const FULL_DATA_URL = "./songs-data.js?v=82";
const PUBLIC_APP_URL = "https://himnoscristoelrey.web.app/";
const INSTALL_DISMISSED_KEY = "install-dismissed-version";
const SCROLL_TOP_ON_BACK_KEY = "scroll-top-on-next-back";
const TONE_OPTIONS = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si", "Eliminar tonalidad"];
const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
const NOTE_ALIASES = {
  do: 0,
  "do#": 1,
  reb: 1,
  re: 2,
  "re#": 3,
  mib: 3,
  mi: 4,
  fa: 5,
  "fa#": 6,
  solb: 6,
  sol: 7,
  "sol#": 8,
  lab: 8,
  la: 9,
  "la#": 10,
  sib: 10,
  si: 11,
  c: 0,
  "c#": 1,
  db: 1,
  d: 2,
  "d#": 3,
  eb: 3,
  e: 4,
  f: 5,
  "f#": 6,
  gb: 6,
  g: 7,
  "g#": 8,
  ab: 8,
  a: 9,
  "a#": 10,
  bb: 10,
  b: 11,
};
const GUITAR_CHORDS = {
  Do: ["x", 3, 2, 0, 1, 0],
  "Do#": ["x", 4, 3, 1, 2, 1],
  Re: ["x", "x", 0, 2, 3, 2],
  "Re#": ["x", "x", 1, 3, 4, 3],
  Mi: [0, 2, 2, 1, 0, 0],
  Fa: [1, 3, 3, 2, 1, 1],
  "Fa#": [2, 4, 4, 3, 2, 2],
  Sol: [3, 2, 0, 0, 0, 3],
  "Sol#": [4, 3, 1, 1, 1, 4],
  La: ["x", 0, 2, 2, 2, 0],
  "La#": ["x", 1, 3, 3, 3, 1],
  Si: ["x", 2, 4, 4, 4, 2],
};

const defaultSettings = {
  fontSize: "md",
  theme: "light",
  align: "center",
  fullscreen: true,
  musicianMode: false,
};

const fontScale = {
  xs: "0.82rem",
  sm: "0.94rem",
  md: "1rem",
  lg: "1.12rem",
  xl: "1.28rem",
};

const state = {
  songs: [],
  favorites: new Set(readStoredJson(FAVORITES, [])),
  recents: readStoredJson(RECENTS, []),
  tones: readStoredJson(TONES, {}),
  toneModes: readStoredJson(TONE_MODES, {}),
  settings: { ...defaultSettings, ...readStoredJson(SETTINGS, {}) },
  pendingSettings: null,
  screen: "home",
  query: "",
  currentSong: null,
  toneTarget: null,
  swipe: null,
  returnedSongId: null,
  awaitingTopBack: false,
  topBackTimer: null,
  fullSongsLoaded: false,
  fullSongsPromise: null,
  fullSongsScheduled: false,
};

const els = {
  menuButton: document.querySelector("#menuButton"),
  backButton: document.querySelector("#backButton"),
  settingsButton: document.querySelector("#settingsButton"),
  screenTitle: document.querySelector("#screenTitle"),
  drawer: document.querySelector("#drawer"),
  drawerScrim: document.querySelector("#drawerScrim"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  songList: document.querySelector("#songList"),
  emptyState: document.querySelector("#emptyState"),
  offlineStatus: document.querySelector("#offlineStatus"),
  songSheet: document.querySelector("#songSheet"),
  sheetPanel: document.querySelector(".sheet-panel"),
  closeSheet: document.querySelector("#closeSheet"),
  favoriteButton: document.querySelector("#favoriteButton"),
  shareSongButton: document.querySelector("#shareSongButton"),
  songTone: document.querySelector("#songTone"),
  musicianToolbar: document.querySelector("#musicianToolbar"),
  songNumber: document.querySelector("#songNumber"),
  songTitle: document.querySelector("#songTitle"),
  songLyrics: document.querySelector("#songLyrics"),
  toneDialog: document.querySelector("#toneDialog"),
  closeToneDialog: document.querySelector("#closeToneDialog"),
  toneOptions: document.querySelector("#toneOptions"),
  chordDialog: document.querySelector("#chordDialog"),
  closeChordDialog: document.querySelector("#closeChordDialog"),
  chordTitle: document.querySelector("#chordTitle"),
  chordDiagram: document.querySelector("#chordDiagram"),
  chordHelp: document.querySelector("#chordHelp"),
  settingsPreview: document.querySelector("#settingsPreview"),
  applySettingsButton: document.querySelector("#applySettings"),
  resetSettingsButton: document.querySelector("#resetSettings"),
  installPrompt: document.querySelector("#installPrompt"),
  installPromptText: document.querySelector("#installPromptText"),
  installApp: document.querySelector("#installApp"),
  dismissInstall: document.querySelector("#dismissInstall"),
};

let db;
let deferredInstallPrompt = null;

init();

function readStoredJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    return JSON.parse(value);
  } catch (error) {
    console.warn(`Se limpio una preferencia local invalida: ${key}`, error);
    localStorage.removeItem(key);
    return fallback;
  }
}

async function init() {
  try {
    db = await openDatabase();
    await ensureFastSongIndex();
    state.songs = songIndex.map(normalizeSong).sort(sortSongs);
  } catch (error) {
    console.warn("No se pudo iniciar IndexedDB; usando listado local", error);
    state.songs = songIndex.map(normalizeSong).sort(sortSongs);
    setOfflineStatus("Listado cargado. El modo offline se reintentara al actualizar.");
  }

  state.fullSongsLoaded = false;
  bindEvents();
  renderToneOptions();
  applySettings();
  render();
  await registerServiceWorker();
  await checkForAppUpdates();
  prepareInitialHistory();
  openSongFromUrl({ prepareHistory: true });
  scheduleFullSongsDownload();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("number", "number", { unique: false });
        store.createIndex("title", "title", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txStore(mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function ensureFastSongIndex() {
  const count = await countSongs();
  const storedVersion = localStorage.getItem(SEED_VERSION_KEY);
  if (count >= songIndex.length && storedVersion === SEED_VERSION) return;
  await replaceSongs(songIndex);
  localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
}

function countSongs() {
  return new Promise((resolve, reject) => {
    const request = txStore().count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllSongs() {
  return new Promise((resolve, reject) => {
    const request = txStore().getAll();
    request.onsuccess = () => resolve(request.result.sort(sortSongs));
    request.onerror = () => reject(request.error);
  });
}

function getSongById(id) {
  return new Promise((resolve, reject) => {
    const request = txStore().get(id);
    request.onsuccess = () => resolve(request.result ? normalizeSong(request.result) : null);
    request.onerror = () => reject(request.error);
  });
}

function getSongByNumber(number) {
  return new Promise((resolve, reject) => {
    const request = txStore().index("number").get(String(number));
    request.onsuccess = () => resolve(request.result ? normalizeSong(request.result) : null);
    request.onerror = () => reject(request.error);
  });
}

function saveSongs(songs) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    songs.map(normalizeSong).forEach((song) => store.put(song));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function replaceSongs(songs) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    store.clear();
    songs.map(normalizeSong).forEach((song) => store.put(song));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function mergeBundledSongs(bundledSongs) {
  const currentSongs = await getAllSongs();
  const currentByNumber = new Map(currentSongs.map((song) => [String(song.number), song]));
  const currentById = new Map(currentSongs.map((song) => [song.id, song]));
  const merged = bundledSongs.map((song, index) => {
    const bundled = normalizeSong(song, index);
    const current = currentByNumber.get(String(bundled.number)) || currentById.get(bundled.id);
    if (!current) return bundled;
    return {
      ...current,
      ...bundled,
      source: "bundled",
    };
  });
  await replaceSongs(merged);
}

async function loadFullSongsInBackground() {
  if (state.fullSongsLoaded) return state.songs;
  if (state.fullSongsPromise) return state.fullSongsPromise;
  state.fullSongsScheduled = true;

  state.fullSongsPromise = hydrateFullSongsFromStorage()
    .then((loadedFromStorage) => {
      if (loadedFromStorage) return state.songs;
      return import(FULL_DATA_URL);
    })
    .then(async (result) => {
      if (!result?.seedSongs) return result;
      const { seedSongs } = result;
      setOfflineStatus("Descargando letras para uso offline...");
      await mergeBundledSongs(seedSongs);
      localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
      state.songs = await getAllSongs();
      state.fullSongsLoaded = true;
      renderSongs();
      setOfflineStatus("Letras listas para usar sin conexion");
      return state.songs;
    })
    .catch((error) => {
      console.warn("No se pudieron descargar las letras completas", error);
      setOfflineStatus(navigator.onLine ? "Listado listo. Letras completas pendientes." : "Estas usando la app sin conexion");
      state.fullSongsPromise = null;
      state.fullSongsScheduled = false;
      return state.songs;
    });

  return state.fullSongsPromise;
}

async function hydrateFullSongsFromStorage() {
  if (!db) return false;
  const storedSongs = await getAllSongs();
  if (!hasFullLyrics(storedSongs)) return false;

  state.songs = storedSongs;
  state.fullSongsLoaded = true;
  renderSongs();
  return true;
}

async function loadStoredFullSong(song) {
  if (!db || !song) return null;
  try {
    const byNumber = song.number ? await getSongByNumber(song.number) : null;
    const byId = !byNumber && song.id ? await getSongById(song.id) : null;
    const storedSong = byNumber || byId;
    return storedSong?.lyrics ? storedSong : null;
  } catch (error) {
    console.warn("No se pudo leer la letra guardada", error);
    return null;
  }
}

function scheduleFullSongsDownload() {
  if (state.fullSongsLoaded || state.fullSongsScheduled) return;
  if (!navigator.onLine) return;
  state.fullSongsScheduled = true;

  const download = () => loadFullSongsInBackground();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(download, { timeout: 4500 });
    return;
  }
  window.setTimeout(download, 1800);
}

function hasFullLyrics(songs) {
  return songs.length >= songIndex.length && songs.every((song) => song.lyrics && song.lyrics.length > 20);
}

function normalizeSong(song, index = 0) {
  const number = String(song.number ?? song.numero ?? song.nro ?? "").trim();
  const title = String(song.title ?? song.titulo ?? song.nombre ?? `Cancion ${index + 1}`).trim();
  const lyrics = String(song.lyrics ?? song.letra ?? song.texto ?? "").trim();
  const chordedLyrics = String(song.chordedLyrics ?? song.lyricsWithChords ?? song.letraConAcordes ?? song.acordes ?? "").trim();
  const originalTone = normalizeToneName(song.originalTone ?? song.originalKey ?? song.tonoOriginal ?? song.tonalidadOriginal ?? song.tone ?? song.key ?? song.tono ?? song.tonalidad ?? "");
  const preview = String(song.preview ?? buildPreview(lyrics)).trim();
  const id = slugify(song.id ?? `${number || index + 1}-${title}`);
  const source = song.source || "bundled";
  return { id, number, title, lyrics, chordedLyrics, originalTone, preview, source, updatedAt: song.updatedAt || new Date().toISOString() };
}

function buildPreview(text) {
  return String(text || "")
    .split(/\n\s*\n|\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortSongs(a, b) {
  const aNumber = String(a.number || "").trim();
  const bNumber = String(b.number || "").trim();
  const aNum = /^\d+$/.test(aNumber) ? Number(aNumber) : Number.NaN;
  const bNum = /^\d+$/.test(bNumber) ? Number(bNumber) : Number.NaN;
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
  if (Number.isFinite(aNum)) return -1;
  if (Number.isFinite(bNum)) return 1;
  return a.title.localeCompare(b.title, "es");
}

function bindEvents() {
  els.menuButton.addEventListener("click", openDrawer);
  els.drawerScrim.addEventListener("click", closeDrawer);
  els.backButton.addEventListener("click", () => navigateHome());
  els.settingsButton.addEventListener("click", () => navigateScreen("settings"));
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateScreen(button.dataset.nav);
      closeDrawer();
    });
  });

  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    if (state.query && !state.fullSongsLoaded) loadFullSongsInBackground();
    renderSongs();
  });
  els.clearSearch.addEventListener("click", () => {
    state.query = "";
    els.searchInput.value = "";
    renderSongs();
  });

  els.closeSheet.addEventListener("click", closeSong);
  els.favoriteButton.addEventListener("click", () => toggleFavorite(state.currentSong?.id));
  els.shareSongButton.addEventListener("click", shareCurrentSong);
  els.songTone.addEventListener("click", () => {
    if (state.currentSong) openToneDialog(state.currentSong);
  });
  els.musicianToolbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-transpose]");
    if (!button || !state.currentSong) return;
    transposeCurrentSong(Number(button.dataset.transpose));
  });
  els.songLyrics.addEventListener("click", (event) => {
    const chord = event.target.closest(".chord-note");
    if (!chord) return;
    openChordDialog(chord.dataset.chord || chord.textContent);
  });
  els.sheetPanel.addEventListener("pointerdown", startSongSwipe);
  els.sheetPanel.addEventListener("pointerup", finishSongSwipe);
  els.sheetPanel.addEventListener("pointercancel", cancelSongSwipe);
  els.sheetPanel.addEventListener("touchstart", startSongTouchSwipe, { passive: true });
  els.sheetPanel.addEventListener("touchend", finishSongTouchSwipe, { passive: true });
  els.sheetPanel.addEventListener("touchcancel", cancelSongSwipe, { passive: true });
  document.querySelector("[data-close-sheet]").addEventListener("click", closeSong);
  els.closeToneDialog.addEventListener("click", () => els.toneDialog.close());
  els.toneDialog.addEventListener("click", (event) => {
    if (event.target === els.toneDialog) els.toneDialog.close();
  });
  els.closeChordDialog.addEventListener("click", () => els.chordDialog.close());
  els.chordDialog.addEventListener("click", (event) => {
    if (event.target === els.chordDialog) els.chordDialog.close();
  });
  window.addEventListener("popstate", handleHistoryBack);
  window.addEventListener("hashchange", handleHashBack);

  document.querySelectorAll("input[name='fontSize'], input[name='theme'], input[name='align'], input[name='fullscreen'], input[name='musicianMode']").forEach((input) => {
    input.addEventListener("change", () => {
      state.pendingSettings[input.name] = input.type === "checkbox" ? input.checked : input.value;
      applyPreviewSettings(state.pendingSettings);
      updateSettingsControls(state.pendingSettings);
    });
  });

  els.applySettingsButton.addEventListener("click", () => {
    state.settings = { ...state.pendingSettings };
    localStorage.setItem(SETTINGS, JSON.stringify(state.settings));
    applySettings();
    if (!state.settings.fullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigateHome();
    renderCurrentSong();
  });

  els.resetSettingsButton.addEventListener("click", () => {
    state.settings = { ...defaultSettings };
    state.pendingSettings = { ...defaultSettings };
    localStorage.setItem(SETTINGS, JSON.stringify(state.settings));
    applySettings();
    renderSongs();
    renderCurrentSong();
  });

  els.installApp.addEventListener("click", installApp);
  els.dismissInstall.addEventListener("click", dismissInstallPrompt);
}

function render() {
  showScreen(state.screen);
  renderSongs();
}

function showScreen(screen) {
  state.screen = screen;
  document.querySelectorAll(".screen").forEach((item) => item.classList.remove("active"));
  document.querySelector(`#${screen === "favorites" ? "home" : screen}Screen`).classList.add("active");

  const isRoot = screen === "home" || screen === "favorites";
  els.menuButton.classList.toggle("hidden", !isRoot);
  els.backButton.classList.toggle("hidden", isRoot);
  els.settingsButton.classList.toggle("hidden", screen === "settings");
  els.screenTitle.textContent = screen === "favorites" ? "Himnos Favoritos" : screen === "about" ? "Sobre Nosotros" : screen === "settings" ? "Configuracion" : "Himnarios Cristo El Rey";
  renderSongs();
}

function navigateScreen(screen) {
  if (screen === "home") {
    navigateHome();
    return;
  }
  showScreen(screen);
  pushScreenState(screen);
}

function navigateHome(options = {}) {
  showScreen("home");
  pushScreenState("home", { replace: options.replace !== false });
}

function pushScreenState(screen, options = {}) {
  if (!history.pushState || !history.replaceState) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("himno");
  url.hash = screen === "home" ? "" : screen;
  const payload = { screen, listTop: screen === "home" };
  if (options.replace) history.replaceState(payload, "", url);
  else history.pushState(payload, "", url);
}

function renderSongs() {
  const songs = filteredSongs();
  els.emptyState.classList.toggle("hidden", songs.length > 0);
  els.songList.innerHTML = "";

  for (const song of songs) {
    const row = document.createElement("article");
    row.className = "song-row";
    row.dataset.songId = song.id;
    row.innerHTML = `
      <div class="tone-cell">
        <button class="tone-button" type="button" aria-label="Seleccionar tonalidad">
          <span class="note-icon" aria-hidden="true">♪</span>
        </button>
        <span>${escapeHtml(getToneLabel(song))}</span>
      </div>
      <button class="song-main" type="button">
        <span class="number">${escapeHtml(song.number || "")}</span>
        <h2>${escapeHtml(song.title)}</h2>
        <p>${escapeHtml(song.preview || song.lyrics || "Letra disponible al abrir el himno")}</p>
      </button>
      <button class="favorite-toggle ${state.favorites.has(song.id) ? "active" : ""}" type="button" aria-label="Marcar favorito">${state.favorites.has(song.id) ? "★" : "☆"}</button>
    `;

    const main = row.querySelector(".song-main");
    const favorite = row.querySelector(".favorite-toggle");
    const toneButton = row.querySelector(".tone-button");
    main.addEventListener("click", () => openSong(song));
    favorite.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(song.id);
    });
    toneButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openToneDialog(song);
    });
    els.songList.append(row);
  }
}

function filteredSongs() {
  let songs = state.screen === "favorites" ? state.songs.filter((song) => state.favorites.has(song.id)) : [...state.songs];
  if (!state.query) return songs;
  if (!state.fullSongsLoaded) loadFullSongsInBackground();
  return songs.filter((song) => `${song.number} ${song.title} ${song.preview || ""} ${song.lyrics || ""}`.toLowerCase().includes(state.query));
}

function visibleSongs() {
  return filteredSongs();
}

async function openSong(song, options = {}) {
  requestAppFullscreen();
  let selectedSong = song;
  state.currentSong = selectedSong;
  state.recents = [selectedSong.id, ...state.recents.filter((id) => id !== selectedSong.id)].slice(0, 20);
  localStorage.setItem(RECENTS, JSON.stringify(state.recents));
  renderCurrentSong();
  resetSongScroll();
  els.songSheet.classList.add("open");
  els.songSheet.setAttribute("aria-hidden", "false");
  if (!options.skipUrl) updateSongUrl(selectedSong, { replace: Boolean(options.replaceUrl) });

  if (!selectedSong.lyrics) {
    const storedSong = await loadStoredFullSong(selectedSong);
    if (storedSong) {
      selectedSong = storedSong;
      state.currentSong = selectedSong;
      renderCurrentSong();
      resetSongScroll();
      if (!options.skipUrl) updateSongUrl(selectedSong, { replace: true });
      return;
    }

    const fullSongs = await loadFullSongsInBackground();
    selectedSong = fullSongs.find((item) => item.id === song.id || item.number === song.number) || selectedSong;
    state.currentSong = selectedSong;
    renderCurrentSong();
    resetSongScroll();
    if (!options.skipUrl) updateSongUrl(selectedSong, { replace: true });
  }
}

function renderCurrentSong() {
  const song = state.currentSong;
  if (!song) return;
  const isMusicianMode = Boolean(state.settings.musicianMode);
  els.songNumber.textContent = song.number ? `Himno ${song.number}` : "";
  els.songTitle.textContent = song.title;
  const toneLabel = getToneLabel(song);
  els.songTone.querySelector("strong").textContent = toneLabel;
  els.songTone.classList.toggle("empty", !toneLabel);
  els.musicianToolbar.classList.toggle("hidden", !isMusicianMode);
  els.favoriteButton.textContent = state.favorites.has(song.id) ? "★" : "☆";
  renderLyrics(song);
}

function renderLyrics(song) {
  const plainText = song.lyrics || "Cargando letra...";
  const musicianText = getMusicianLyrics(song);
  if (!state.settings.musicianMode || !hasChordMarkers(musicianText)) {
    els.songLyrics.classList.toggle("lyrics-with-chords", false);
    if (state.settings.musicianMode && !hasChordMarkers(musicianText)) {
      els.songLyrics.innerHTML = `<div class="chords-coming-soon">¡Próximamente subiremos los acordes de esta canción!</div>${escapeHtml(plainText)}`;
    } else {
      els.songLyrics.textContent = plainText;
    }
    return;
  }

  els.songLyrics.classList.toggle("lyrics-with-chords", true);
  els.songLyrics.innerHTML = buildChordedLyricsHtml(musicianText, getToneOffset(song));
}

function closeSong(options = {}) {
  const { updateUrl = true, restorePosition = true, pushTopState = false } = options;
  const closedSongId = state.currentSong?.id;
  els.songSheet.classList.remove("open");
  els.songSheet.setAttribute("aria-hidden", "true");
  state.currentSong = null;
  if (updateUrl) clearSongUrl();
  if (restorePosition) restoreSongPosition(closedSongId);
  if (pushTopState && closedSongId) {
    state.returnedSongId = closedSongId;
  }
}

function updateSongUrl(song, options = {}) {
  if (!song?.number) return;
  const songUrl = new URL(window.location.href);
  songUrl.searchParams.set("himno", song.number);
  const payload = { songNumber: song.number, songId: song.id, screen: state.screen };

  if (options.replace && history.replaceState) {
    history.replaceState(payload, "", songUrl);
    return;
  }

  if (!history.replaceState || !history.pushState) return;
  const listUrl = new URL(songUrl);
  listUrl.searchParams.delete("himno");
  listUrl.hash = "";
  const returnUrl = new URL(listUrl);
  returnUrl.hash = "volver-listado";
  history.replaceState({ screen: state.screen, listTop: true }, "", listUrl);
  history.pushState({ screen: state.screen, returnFromSong: true, songId: song.id }, "", returnUrl);
  songUrl.hash = "";
  history.pushState(payload, "", songUrl);
}

function clearSongUrl() {
  if (!history.replaceState) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("himno")) return;
  url.searchParams.delete("himno");
  url.hash = "";
  history.replaceState({ screen: state.screen, listTop: true }, "", url);
}

function prepareInitialHistory() {
  if (!history.replaceState) return;
  const url = new URL(window.location.href);
  if (url.searchParams.has("himno")) return;
  history.replaceState({ screen: state.screen, listTop: true }, "", url);
}

function handleHistoryBack(event) {
  const historyState = event?.state || {};
  const number = new URLSearchParams(window.location.search).get("himno");
  if (number) {
    openSongFromUrl();
    return;
  }

  if (state.currentSong) {
    const songId = historyState.songId || state.currentSong.id;
    closeSong({ updateUrl: false, restorePosition: false, pushTopState: true });
    restoreSongPosition(songId);
    state.returnedSongId = songId;
    startTopBackWatcher();
    return;
  }

  if (state.screen !== "home") {
    navigateHome();
    return;
  }

  handlePendingTopBack();
}

function handleHashBack() {
  if (new URLSearchParams(window.location.search).has("himno")) return;
  if (!window.location.hash && state.screen !== "home") {
    showScreen("home");
    return;
  }
  if (window.location.hash) return;
  handlePendingTopBack();
}

function handlePendingTopBack() {
  if (!state.awaitingTopBack && !sessionStorage.getItem(SCROLL_TOP_ON_BACK_KEY)) return;
  sessionStorage.removeItem(SCROLL_TOP_ON_BACK_KEY);
  state.awaitingTopBack = false;
  stopTopBackWatcher();
  state.returnedSongId = null;
  scrollListToTop();
}

function startTopBackWatcher() {
  state.awaitingTopBack = true;
  sessionStorage.setItem(SCROLL_TOP_ON_BACK_KEY, "1");
  stopTopBackWatcher();
  const expiresAt = Date.now() + 120000;
  state.topBackTimer = window.setInterval(() => {
    const hasSong = new URLSearchParams(window.location.search).has("himno");
    if (!hasSong && !window.location.hash) {
      handlePendingTopBack();
      return;
    }
    if (Date.now() > expiresAt) {
      sessionStorage.removeItem(SCROLL_TOP_ON_BACK_KEY);
      state.awaitingTopBack = false;
      stopTopBackWatcher();
    }
  }, 250);
}

function stopTopBackWatcher() {
  if (!state.topBackTimer) return;
  window.clearInterval(state.topBackTimer);
  state.topBackTimer = null;
}

function restoreSongPosition(songId) {
  if (!songId) return;
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll("[data-song-id]")].find((item) => item.dataset.songId === songId);
    row?.scrollIntoView({ block: "center" });
  });
}

function scrollListToTop() {
  const searchRow = els.searchInput?.closest(".search-row");
  const alignSearch = () => {
    window.scrollTo({ top: 0, behavior: "auto" });
    searchRow?.scrollIntoView({ block: "start", behavior: "auto" });
  };

  alignSearch();
  els.searchInput?.focus();
  requestAnimationFrame(alignSearch);
  window.setTimeout(alignSearch, 120);
  window.setTimeout(alignSearch, 320);
}

function resetSongScroll() {
  els.sheetPanel.scrollTop = 0;
  els.songLyrics.scrollTop = 0;
  requestAnimationFrame(() => {
    els.sheetPanel.scrollTop = 0;
    els.songLyrics.scrollTop = 0;
  });
  window.setTimeout(() => {
    els.sheetPanel.scrollTop = 0;
    els.songLyrics.scrollTop = 0;
  }, 60);
}

function startSongSwipe(event) {
  if (!state.currentSong) return;
  beginSongSwipe(event.clientX, event.clientY, event.target);
}

function finishSongSwipe(event) {
  finishSongSwipeAt(event.clientX, event.clientY);
}

function startSongTouchSwipe(event) {
  const touch = event.touches[0];
  if (!touch) return;
  beginSongSwipe(touch.clientX, touch.clientY, event.target);
}

function finishSongTouchSwipe(event) {
  const touch = event.changedTouches[0];
  if (!touch) return;
  finishSongSwipeAt(touch.clientX, touch.clientY);
}

function beginSongSwipe(clientX, clientY, target) {
  if (!state.currentSong) return;
  if (target.closest("button, a, input, label, textarea, select, .chord-note")) return;
  if (!target.closest("#songLyrics, .song-meta, .song-title-block")) return;

  const edgeGuard = Math.min(42, Math.max(24, window.innerWidth * 0.08));
  if (clientX <= edgeGuard || clientX >= window.innerWidth - edgeGuard) {
    state.swipe = null;
    return;
  }

  state.swipe = {
    x: clientX,
    y: clientY,
    time: Date.now(),
  };
}

function finishSongSwipeAt(clientX, clientY) {
  if (!state.swipe || !state.currentSong) return;
  const deltaX = clientX - state.swipe.x;
  const deltaY = clientY - state.swipe.y;
  const elapsed = Date.now() - state.swipe.time;
  state.swipe = null;

  if (elapsed > 900) return;
  if (Math.abs(deltaX) < 68 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
  turnSongPage(deltaX < 0 ? 1 : -1);
}

function cancelSongSwipe() {
  state.swipe = null;
}

function turnSongPage(direction) {
  const songs = visibleSongs();
  const index = songs.findIndex((song) => song.id === state.currentSong?.id);
  if (index < 0) return;
  const nextSong = songs[index + direction];
  if (!nextSong) {
    setOfflineStatus(direction > 0 ? "Estas en el ultimo himno de este listado" : "Estas en el primer himno de este listado");
    return;
  }

  animatePageTurn(direction);
  openSong(nextSong, { replaceUrl: true });
}

function animatePageTurn(direction) {
  els.sheetPanel.classList.remove("turn-next", "turn-prev");
  void els.sheetPanel.offsetWidth;
  els.sheetPanel.classList.add(direction > 0 ? "turn-next" : "turn-prev");
  window.setTimeout(() => els.sheetPanel.classList.remove("turn-next", "turn-prev"), 260);
}

function buildSongUrl(song) {
  const base = location.protocol.startsWith("http") ? new URL(location.href) : new URL(PUBLIC_APP_URL);
  base.search = "";
  base.hash = "";
  base.searchParams.set("himno", song.number);
  return base.toString();
}

async function shareCurrentSong() {
  const song = state.currentSong;
  if (!song) return;
  const url = buildSongUrl(song);
  const text = `Himno ${song.number} - ${song.title}`;
  const shareData = {
    title: text,
    text: `${text}\nHimnario Cristo El Rey`,
    url,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(url);
    setOfflineStatus("Enlace del himno copiado");
  } catch (error) {
    if (error?.name === "AbortError") return;
    await copyTextFallback(url);
    setOfflineStatus("Enlace del himno copiado");
  }
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

async function openSongFromUrl(options = {}) {
  const number = new URLSearchParams(window.location.search).get("himno");
  if (!number) return;
  let song = state.songs.find((item) => String(item.number) === String(number));
  if (!song) {
    const fullSongs = await loadFullSongsInBackground();
    song = fullSongs.find((item) => String(item.number) === String(number)) || song;
  }
  if (!song) return;

  if (options.prepareHistory && history.replaceState && history.pushState) {
    const listUrl = new URL(window.location.href);
    listUrl.searchParams.delete("himno");
    listUrl.hash = "";
    const returnUrl = new URL(listUrl);
    returnUrl.hash = "volver-listado";
    history.replaceState({ screen: state.screen, listTop: true }, "", listUrl);
    history.pushState({ screen: state.screen, returnFromSong: true, songId: song.id }, "", returnUrl);
    const songUrl = new URL(listUrl);
    songUrl.searchParams.set("himno", song.number);
    songUrl.hash = "";
    history.pushState({ songNumber: song.number, songId: song.id, screen: state.screen }, "", songUrl);
  }

  openSong(song, { skipUrl: true });
}

function toggleFavorite(songId) {
  if (!songId) return;
  if (state.favorites.has(songId)) state.favorites.delete(songId);
  else state.favorites.add(songId);
  localStorage.setItem(FAVORITES, JSON.stringify([...state.favorites]));
  if (state.currentSong?.id === songId) els.favoriteButton.textContent = state.favorites.has(songId) ? "★" : "☆";
  renderSongs();
}

function openToneDialog(song) {
  state.toneTarget = song;
  renderToneOptions();
  els.toneDialog.showModal();
}

function renderToneOptions() {
  els.toneOptions.innerHTML = "";
  if (state.toneTarget) {
    const originalTone = getOriginalTone(state.toneTarget);
    const myTone = getMyTone(state.toneTarget);
    const modeRow = document.createElement("div");
    modeRow.className = "tone-mode-options";
    modeRow.innerHTML = `
      <button class="${getToneMode(state.toneTarget) === "mine" ? "active" : ""}" type="button" data-tone-mode="mine" ${myTone ? "" : "disabled"}>Mi tonalidad${myTone ? `: ${escapeHtml(myTone)}` : ""}</button>
      <button class="${getToneMode(state.toneTarget) === "original" ? "active" : ""}" type="button" data-tone-mode="original" ${originalTone ? "" : "disabled"}>Tonalidad original${originalTone ? `: ${escapeHtml(originalTone)}` : ""}</button>
    `;
    modeRow.querySelectorAll("[data-tone-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        setToneMode(state.toneTarget, button.dataset.toneMode);
        els.toneDialog.close();
        refreshToneDisplays();
      });
    });
    els.toneOptions.append(modeRow);
  }

  for (const tone of TONE_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tone;
    button.addEventListener("click", () => {
      if (!state.toneTarget) return;
      if (tone === "Eliminar tonalidad") {
        delete state.tones[state.toneTarget.id];
        delete state.toneModes[state.toneTarget.id];
      } else {
        state.tones[state.toneTarget.id] = tone;
        state.toneModes[state.toneTarget.id] = "mine";
      }
      localStorage.setItem(TONES, JSON.stringify(state.tones));
      localStorage.setItem(TONE_MODES, JSON.stringify(state.toneModes));
      els.toneDialog.close();
      refreshToneDisplays();
    });
    els.toneOptions.append(button);
  }
}

function getOriginalTone(song) {
  return normalizeToneName(song.originalTone || song.originalKey || song.tone || song.key || "");
}

function getCurrentTone(song) {
  const mode = getToneMode(song);
  if (mode === "original") return getOriginalTone(song);
  return getMyTone(song) || getOriginalTone(song);
}

function getToneLabel(song) {
  const tone = getCurrentTone(song);
  return tone || "";
}

function getMyTone(song) {
  return normalizeToneName(state.tones[song.id]);
}

function getToneMode(song) {
  const savedMode = state.toneModes[song.id];
  if (savedMode === "mine" && getMyTone(song)) return "mine";
  if (savedMode === "original" && getOriginalTone(song)) return "original";
  return getMyTone(song) ? "mine" : "original";
}

function setToneMode(song, mode) {
  if (!song) return;
  if (mode === "mine" && !getMyTone(song)) return;
  if (mode === "original" && !getOriginalTone(song)) return;
  state.toneModes[song.id] = mode;
  localStorage.setItem(TONE_MODES, JSON.stringify(state.toneModes));
}

function refreshToneDisplays() {
  if (state.currentSong?.id === state.toneTarget?.id) renderCurrentSong();
  renderSongs();
}

function getMusicianLyrics(song) {
  return song.chordedLyrics || song.lyrics || "";
}

function getToneOffset(song) {
  const original = toneIndex(getOriginalTone(song));
  const current = toneIndex(getCurrentTone(song));
  if (original < 0 || current < 0) return 0;
  return current - original;
}

function transposeCurrentSong(step) {
  const song = state.currentSong;
  if (!song) return;
  const original = getOriginalTone(song);
  const current = getCurrentTone(song);
  const baseIndex = step === 0 ? toneIndex(original) : toneIndex(current);
  if (baseIndex < 0) return;
  state.tones[song.id] = NOTE_NAMES[wrapNoteIndex(baseIndex + step)];
  state.toneModes[song.id] = step === 0 ? "original" : "mine";
  localStorage.setItem(TONES, JSON.stringify(state.tones));
  localStorage.setItem(TONE_MODES, JSON.stringify(state.toneModes));
  renderCurrentSong();
  renderSongs();
}

function hasChordMarkers(text) {
  return /\[[^\]\n]{1,16}\]/.test(text);
}

function buildChordedLyricsHtml(text, offset) {
  return String(text || "")
    .split("\n")
    .map((line) => `<div class="lyric-line">${renderChordedLine(line, offset) || "&nbsp;"}</div>`)
    .join("");
}

function renderChordedLine(line, offset) {
  const parts = [];
  const regex = /\[([^\]\n]{1,16})\]([^\s[]*)?/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line))) {
    const rawChord = match[1].trim();
    const word = match[2] || "";
    if (!isChord(rawChord)) continue;
    parts.push(escapeHtml(line.slice(lastIndex, match.index)));
    const chord = transposeChord(rawChord, offset);
    parts.push(`
      <span class="chord-word">
        <button class="chord-note" type="button" data-chord="${escapeHtml(chord)}">${escapeHtml(chord)}</button>
        <span>${escapeHtml(word)}</span>
      </span>
    `);
    lastIndex = match.index + match[0].length;
  }

  parts.push(escapeHtml(line.slice(lastIndex)));
  return parts.join("");
}

function isChord(chord) {
  return parseChord(chord) !== null;
}

function transposeChord(chord, offset) {
  const parsed = parseChord(chord);
  if (!parsed) return chord;
  const root = NOTE_NAMES[wrapNoteIndex(parsed.rootIndex + offset)];
  const bass = parsed.bassIndex === null ? "" : `/${NOTE_NAMES[wrapNoteIndex(parsed.bassIndex + offset)]}`;
  return `${root}${parsed.suffix}${bass}`;
}

function parseChord(chord) {
  const value = String(chord || "").trim();
  const match = value.match(/^([A-G](?:#|b)?|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si)([^/\s]*)(?:\/([A-G](?:#|b)?|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si))?$/i);
  if (!match) return null;
  const rootIndex = toneIndex(match[1]);
  const bassIndex = match[3] ? toneIndex(match[3]) : null;
  if (rootIndex < 0 || bassIndex === -1) return null;
  return {
    rootIndex,
    suffix: match[2] || "",
    bassIndex,
  };
}

function toneIndex(tone) {
  const key = String(tone || "")
    .trim()
    .toLowerCase()
    .replace("♯", "#")
    .replace("♭", "b");
  return Object.prototype.hasOwnProperty.call(NOTE_ALIASES, key) ? NOTE_ALIASES[key] : -1;
}

function normalizeToneName(tone) {
  const index = toneIndex(tone);
  return index < 0 ? "" : NOTE_NAMES[index];
}

function wrapNoteIndex(index) {
  return ((index % NOTE_NAMES.length) + NOTE_NAMES.length) % NOTE_NAMES.length;
}

function openChordDialog(chord) {
  const parsed = parseChord(chord);
  if (!parsed) return;
  const root = NOTE_NAMES[parsed.rootIndex];
  const normalized = transposeChord(chord, 0);
  const frets = GUITAR_CHORDS[root] || GUITAR_CHORDS.Do;
  els.chordTitle.textContent = normalized;
  els.chordDiagram.innerHTML = renderGuitarDiagram(frets);
  els.chordHelp.textContent = `Posición sugerida para guitarra. Las cuerdas se leen de izquierda a derecha: Mi, La, Re, Sol, Si, Mi.`;
  els.chordDialog.showModal();
}

function renderGuitarDiagram(frets) {
  const labels = ["Mi", "La", "Re", "Sol", "Si", "Mi"];
  return frets
    .map((fret, index) => `
      <div class="guitar-string">
        <span>${labels[index]}</span>
        <strong>${escapeHtml(fret)}</strong>
      </div>
    `)
    .join("");
}

function applySettings() {
  state.pendingSettings = { ...state.settings };
  document.body.classList.toggle("dark", state.settings.theme === "dark");
  document.body.classList.toggle("musician-mode", Boolean(state.settings.musicianMode));
  document.documentElement.style.setProperty("--font-song", fontScale[state.settings.fontSize] || fontScale.md);
  document.documentElement.style.setProperty("--align-song", state.settings.align);
  applyPreviewSettings(state.settings);
  updateSettingsControls(state.settings);
}

function applyPreviewSettings(settings) {
  els.settingsPreview.style.fontSize = fontScale[settings.fontSize] || fontScale.md;
  els.settingsPreview.style.textAlign = settings.align;
  els.settingsPreview.dataset.theme = settings.theme;
  els.settingsPreview.classList.toggle("preview-dark", settings.theme === "dark");
  els.settingsPreview.classList.toggle("preview-light", settings.theme === "light");
}

function updateSettingsControls(settings) {
  document.querySelectorAll("input[name='fontSize']").forEach((input) => (input.checked = input.value === settings.fontSize));
  document.querySelectorAll("input[name='theme']").forEach((input) => (input.checked = input.value === settings.theme));
  document.querySelectorAll("input[name='align']").forEach((input) => (input.checked = input.value === settings.align));
  document.querySelectorAll("input[name='fullscreen']").forEach((input) => (input.checked = Boolean(settings.fullscreen)));
  document.querySelectorAll("input[name='musicianMode']").forEach((input) => (input.checked = Boolean(settings.musicianMode)));
}

function openDrawer() {
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
}

async function importSongs(event) {
  event.preventDefault();
  const text = els.importText.value.trim();
  if (!text) return;

  try {
    const songs = parseImport(text).map(normalizeSong);
    if (!songs.length) throw new Error("No hay canciones para importar.");
    await saveSongs(songs);
    state.songs = await getAllSongs();
    els.importText.value = "";
    els.importDialog.close();
    renderSongs();
  } catch (error) {
    alert(`No pude importar el listado: ${error.message}`);
  }
}

function parseImport(text) {
  if (text.startsWith("[") || text.startsWith("{")) {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : data.songs || data.canciones || [];
  }

  const rows = parseCsv(text);
  const header = rows.shift().map((cell) => cell.trim().toLowerCase());
  return rows.map((row) => ({
    number: row[header.indexOf("number")] ?? row[header.indexOf("numero")] ?? row[header.indexOf("nro")] ?? row[0],
    title: row[header.indexOf("title")] ?? row[header.indexOf("titulo")] ?? row[header.indexOf("nombre")] ?? row[1],
    lyrics: row[header.indexOf("lyrics")] ?? row[header.indexOf("letra")] ?? row[header.indexOf("texto")] ?? row[2],
  }));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setOfflineStatus("Este navegador no permite modo offline.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await registration.update();
    setOfflineStatus(navigator.onLine ? "Lista para usar sin conexion" : "Estas usando la app sin conexion");
  } catch {
    setOfflineStatus("Abrila desde un servidor web para activar el modo offline.");
  }
}

function isInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function shouldShowInstallPrompt() {
  if (isInstalledApp()) return false;
  if (!els.installPrompt) return false;
  return localStorage.getItem(INSTALL_DISMISSED_KEY) !== APP_VERSION;
}

function showInstallPrompt(mode = "native") {
  if (!shouldShowInstallPrompt()) return;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  els.installPrompt.dataset.mode = mode;
  els.installPromptText.textContent = isIos
    ? "En iPhone, tocá Compartir y luego Agregar a pantalla de inicio para abrirla como app."
    : "Agregala a la pantalla de inicio para abrirla como app y usarla sin internet.";
  els.installApp.textContent = mode === "manual" ? "Entendido" : "Instalar";
  els.installPrompt.classList.remove("hidden");
}

function hideInstallPrompt() {
  els.installPrompt?.classList.add("hidden");
}

async function installApp() {
  if (!deferredInstallPrompt) {
    localStorage.setItem(INSTALL_DISMISSED_KEY, APP_VERSION);
    hideInstallPrompt();
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  promptEvent.prompt();
  const choice = await promptEvent.userChoice.catch(() => ({ outcome: "dismissed" }));
  if (choice.outcome !== "accepted") localStorage.setItem(INSTALL_DISMISSED_KEY, APP_VERSION);
  hideInstallPrompt();
}

function dismissInstallPrompt() {
  localStorage.setItem(INSTALL_DISMISSED_KEY, APP_VERSION);
  hideInstallPrompt();
}

async function checkForAppUpdates() {
  if (!navigator.onLine) return;

  try {
    const response = await fetch(`./app-version.json?ts=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;

    const remote = await response.json();
    const remoteVersion = String(remote.version || "").trim();
    const storedVersion = localStorage.getItem(APP_VERSION_KEY);
    if (!remoteVersion) return;

    if (!storedVersion) {
      localStorage.setItem(APP_VERSION_KEY, remoteVersion);
      return;
    }

    if (remoteVersion !== storedVersion) {
      setOfflineStatus("Hay una nueva version. Actualizando...");
      localStorage.setItem(APP_VERSION_KEY, remoteVersion);
      await refreshAppShell();
      await clearSongStorage();
      window.location.reload();
      return;
    }

    if (APP_VERSION !== storedVersion) {
      localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
    }
  } catch (error) {
    console.warn("No se pudo verificar la version de la app", error);
  }
}

async function refreshAppShell() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) await registration.update();
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("cristo-rey-cancionero-")).map((key) => caches.delete(key)));
  }
}

function clearSongStorage() {
  localStorage.removeItem(SEED_VERSION_KEY);
  if (db) db.close();

  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function requestAppFullscreen() {
  if (!state.settings.fullscreen) return;
  const isMobileLike = window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches;
  if (!isMobileLike) return;
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
}

function setOfflineStatus(message) {
  els.offlineStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("online", () => {
  setOfflineStatus("Lista para usar sin conexion");
  scheduleFullSongsDownload();
});

window.addEventListener("offline", () => {
  setOfflineStatus("Estas usando la app sin conexion");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallPrompt("native");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  hideInstallPrompt();
  localStorage.setItem(INSTALL_DISMISSED_KEY, APP_VERSION);
});

window.addEventListener("load", () => {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos) setTimeout(() => showInstallPrompt("manual"), 1200);
});
