import { songIndex } from "./songs-index.js";

const DB_NAME = "cristo-rey-cancionero";
const DB_VERSION = 1;
const STORE = "songs";
const FAVORITES = "favorites";
const RECENTS = "recents";
const TONES = "tones";
const SETTINGS = "settings";
const APP_VERSION = "2026.06.03.60";
const APP_VERSION_KEY = "app-version";
const SEED_VERSION = "himnos-221-v51";
const SEED_VERSION_KEY = "seed-version";
const FULL_DATA_URL = "./songs-data.js?v=60";
const PUBLIC_APP_URL = "https://himnoscristoelrey.web.app/";
const INSTALL_DISMISSED_KEY = "install-dismissed-version";
const TONE_OPTIONS = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si", "Eliminar tonalidad"];

const defaultSettings = {
  fontSize: "md",
  theme: "light",
  align: "center",
  fullscreen: true,
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
  favorites: new Set(JSON.parse(localStorage.getItem(FAVORITES) || "[]")),
  recents: JSON.parse(localStorage.getItem(RECENTS) || "[]"),
  tones: JSON.parse(localStorage.getItem(TONES) || "{}"),
  settings: { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS) || "{}") },
  pendingSettings: null,
  screen: "home",
  query: "",
  currentSong: null,
  toneTarget: null,
  fullSongsLoaded: false,
  fullSongsPromise: null,
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
  closeSheet: document.querySelector("#closeSheet"),
  favoriteButton: document.querySelector("#favoriteButton"),
  shareSongButton: document.querySelector("#shareSongButton"),
  songTone: document.querySelector("#songTone"),
  songNumber: document.querySelector("#songNumber"),
  songTitle: document.querySelector("#songTitle"),
  songLyrics: document.querySelector("#songLyrics"),
  toneDialog: document.querySelector("#toneDialog"),
  closeToneDialog: document.querySelector("#closeToneDialog"),
  toneOptions: document.querySelector("#toneOptions"),
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

async function init() {
  db = await openDatabase();
  await ensureFastSongIndex();
  state.songs = await getAllSongs();
  state.fullSongsLoaded = hasFullLyrics(state.songs);
  bindEvents();
  renderToneOptions();
  applySettings();
  render();
  await registerServiceWorker();
  await checkForAppUpdates();
  if (!state.fullSongsLoaded) loadFullSongsInBackground();
  openSongFromUrl({ prepareHistory: true });
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
  const songs = await getAllSongs();
  const storedVersion = localStorage.getItem(SEED_VERSION_KEY);
  if (songs.length >= songIndex.length && storedVersion === SEED_VERSION) return;
  await replaceSongs(songIndex);
  localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
}

function getAllSongs() {
  return new Promise((resolve, reject) => {
    const request = txStore().getAll();
    request.onsuccess = () => resolve(request.result.sort(sortSongs));
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

  state.fullSongsPromise = import(FULL_DATA_URL)
    .then(async ({ seedSongs }) => {
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
      return state.songs;
    });

  return state.fullSongsPromise;
}

function hasFullLyrics(songs) {
  return songs.length >= songIndex.length && songs.every((song) => song.lyrics && song.lyrics.length > 20);
}

function normalizeSong(song, index = 0) {
  const number = String(song.number ?? song.numero ?? song.nro ?? "").trim();
  const title = String(song.title ?? song.titulo ?? song.nombre ?? `Cancion ${index + 1}`).trim();
  const lyrics = String(song.lyrics ?? song.letra ?? song.texto ?? "").trim();
  const preview = String(song.preview ?? buildPreview(lyrics)).trim();
  const id = slugify(song.id ?? `${number || index + 1}-${title}`);
  const source = song.source || "bundled";
  return { id, number, title, lyrics, preview, source, updatedAt: song.updatedAt || new Date().toISOString() };
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
  els.backButton.addEventListener("click", () => showScreen("home"));
  els.settingsButton.addEventListener("click", () => showScreen("settings"));
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      showScreen(button.dataset.nav);
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
  document.querySelector("[data-close-sheet]").addEventListener("click", closeSong);
  els.closeToneDialog.addEventListener("click", () => els.toneDialog.close());
  els.toneDialog.addEventListener("click", (event) => {
    if (event.target === els.toneDialog) els.toneDialog.close();
  });
  window.addEventListener("popstate", handleHistoryBack);

  document.querySelectorAll("input[name='fontSize'], input[name='theme'], input[name='align'], input[name='fullscreen']").forEach((input) => {
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
    renderSongs();
    if (!state.settings.fullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showScreen("home");
  });

  els.resetSettingsButton.addEventListener("click", () => {
    state.settings = { ...defaultSettings };
    state.pendingSettings = { ...defaultSettings };
    localStorage.setItem(SETTINGS, JSON.stringify(state.settings));
    applySettings();
    renderSongs();
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
  els.screenTitle.textContent = screen === "favorites" ? "Himnos Favoritos" : screen === "about" ? "Sobre Nosotros" : screen === "settings" ? "Configuracion" : "Himnario Cristo El Rey";
  renderSongs();
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
        <span>${escapeHtml(state.tones[song.id] || "")}</span>
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

async function openSong(song, options = {}) {
  requestAppFullscreen();
  let selectedSong = song;
  state.currentSong = selectedSong;
  state.recents = [selectedSong.id, ...state.recents.filter((id) => id !== selectedSong.id)].slice(0, 20);
  localStorage.setItem(RECENTS, JSON.stringify(state.recents));
  els.songNumber.textContent = selectedSong.number ? `Himno ${selectedSong.number}` : "";
  els.songTitle.textContent = selectedSong.title;
  els.songLyrics.textContent = selectedSong.lyrics || "Cargando letra...";
  els.songTone.querySelector("strong").textContent = state.tones[selectedSong.id] || "";
  els.favoriteButton.textContent = state.favorites.has(selectedSong.id) ? "★" : "☆";
  els.songSheet.classList.add("open");
  els.songSheet.setAttribute("aria-hidden", "false");
  if (!options.skipUrl) updateSongUrl(selectedSong);

  if (!selectedSong.lyrics) {
    const fullSongs = await loadFullSongsInBackground();
    selectedSong = fullSongs.find((item) => item.id === song.id || item.number === song.number) || selectedSong;
    state.currentSong = selectedSong;
    els.songLyrics.textContent = selectedSong.lyrics || "Todavia no se cargo la letra de este himno.";
    if (!options.skipUrl) updateSongUrl(selectedSong);
  }
}

function closeSong(options = {}) {
  const { updateUrl = true, restorePosition = true } = options;
  const closedSongId = state.currentSong?.id;
  els.songSheet.classList.remove("open");
  els.songSheet.setAttribute("aria-hidden", "true");
  state.currentSong = null;
  if (updateUrl) clearSongUrl();
  if (restorePosition) restoreSongPosition(closedSongId);
}

function updateSongUrl(song) {
  if (!history.pushState || !song?.number) return;
  const url = new URL(window.location.href);
  url.searchParams.set("himno", song.number);
  history.pushState({ songNumber: song.number, songId: song.id, screen: state.screen }, "", url);
}

function clearSongUrl() {
  if (!history.replaceState) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("himno")) return;
  url.searchParams.delete("himno");
  history.replaceState({}, "", url);
}

function handleHistoryBack() {
  const number = new URLSearchParams(window.location.search).get("himno");
  if (number) {
    openSongFromUrl();
    return;
  }

  if (state.currentSong) {
    closeSong({ updateUrl: false, restorePosition: true });
  }
}

function restoreSongPosition(songId) {
  if (!songId) return;
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll("[data-song-id]")].find((item) => item.dataset.songId === songId);
    row?.scrollIntoView({ block: "center" });
  });
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
  if (!song || !song.lyrics) {
    const fullSongs = await loadFullSongsInBackground();
    song = fullSongs.find((item) => String(item.number) === String(number)) || song;
  }
  if (!song) return;

  if (options.prepareHistory && history.replaceState && history.pushState) {
    const listUrl = new URL(window.location.href);
    listUrl.searchParams.delete("himno");
    history.replaceState({ screen: state.screen }, "", listUrl);
    const songUrl = new URL(listUrl);
    songUrl.searchParams.set("himno", song.number);
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
  els.toneDialog.showModal();
}

function renderToneOptions() {
  els.toneOptions.innerHTML = "";
  for (const tone of TONE_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tone;
    button.addEventListener("click", () => {
      if (!state.toneTarget) return;
      if (tone === "Eliminar tonalidad") delete state.tones[state.toneTarget.id];
      else state.tones[state.toneTarget.id] = tone;
      localStorage.setItem(TONES, JSON.stringify(state.tones));
      els.toneDialog.close();
      if (state.currentSong?.id === state.toneTarget.id) {
        els.songTone.querySelector("strong").textContent = state.tones[state.toneTarget.id] || "";
      }
      renderSongs();
    });
    els.toneOptions.append(button);
  }
}

function applySettings() {
  state.pendingSettings = { ...state.settings };
  document.body.classList.toggle("dark", state.settings.theme === "dark");
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
  if (!state.fullSongsLoaded) loadFullSongsInBackground();
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
