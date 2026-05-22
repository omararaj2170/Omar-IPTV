const playlistURL = "../../m3u/playlist.m3u";
const player = document.getElementById("player");
const grid = document.getElementById("channelGrid");
const searchInput = document.getElementById("search");
const sidebar = document.getElementById("sidebar");
const main = document.getElementById("main");
const categoriesList = document.getElementById("categories");
const favoritesList = document.getElementById("favorites");
const lastWatchedContainer = document.getElementById("lastWatchedContainer");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const translatorBar = document.getElementById("translatorBar");
const userGreeting = document.getElementById("userGreeting");

let hlsInstance = null;
let lastPlayRequestAt = 0;
const PLAY_COOLDOWN_MS = 800;
const HLS_CONFIG = { enableWorker: true, lowLatencyMode: false, backBufferLength: 30, maxBufferLength: 20, maxMaxBufferLength: 30, maxBufferSize: 30 * 1000 * 1000, capLevelToPlayerSize: true };

let channels = [];
let categories = {};
let visibleChannels = [];
let currentIndex = 0;
const batchSize = 24;
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
let selectedLanguage = "en";
const translationCache = {};

function getCurrentUsername() {
  return (localStorage.getItem("iptvUsername") || "").trim();
}

function getLastWatchedMap() {
  return JSON.parse(localStorage.getItem("iptvLastWatchedByUser") || "{}");
}

function setLastWatched(ch) {
  const username = getCurrentUsername();
  if (!username || !ch?.url) return;
  const map = getLastWatchedMap();
  map[username] = { name: ch.name || "Unknown", logo: ch.logo || "", url: ch.url };
  localStorage.setItem("iptvLastWatchedByUser", JSON.stringify(map));
}

function getLastWatched() {
  const username = getCurrentUsername();
  if (!username) return null;
  return getLastWatchedMap()[username] || null;
}

function renderGreeting() {
  const username = getCurrentUsername();
  if (username) {
    userGreeting.textContent = `Hello! ${username}`;
  } else {
    userGreeting.innerHTML = 'Hello! <a href="../login/login.html">Sign Up / Log In</a>';
  }
}

document.getElementById("menuBtn").onclick = () => {
  sidebar.classList.toggle("active");
  main.classList.toggle("shift");
};

function renderChannels(list) {
  visibleChannels = list;
  currentIndex = 0;
  grid.innerHTML = "";
  loadMoreBtn.style.display = "block";
  loadNextBatch();
  renderStaticText();
}

function loadNextBatch() {
  const batch = visibleChannels.slice(currentIndex, currentIndex + batchSize);

  batch.forEach(ch => {
    const card = document.createElement("div");
    card.className = "channelCard";
    card.innerHTML = `
      <img src="${ch.logo || 'https://via.placeholder.com/300x150'}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x150'">
      <div class="channelName">${getLabel(ch.name)}</div>
      <div class="favBtn">★</div>
    `;
    card.onclick = () => playStream(ch.url, ch);
    card.querySelector(".favBtn").onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(ch);
    };
    grid.appendChild(card);
  });

  currentIndex += batchSize;
  if (currentIndex >= visibleChannels.length) loadMoreBtn.style.display = "none";
}

loadMoreBtn.onclick = loadNextBatch;

function playStream(url, channel = null) {
  const now = Date.now();
  if (now - lastPlayRequestAt < PLAY_COOLDOWN_MS) return;
  lastPlayRequestAt = now;

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (url.endsWith(".m3u8") && Hls.isSupported()) {
    hlsInstance = new Hls(HLS_CONFIG);
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(player);
  } else {
    player.src = url;
  }
  player.play();
  pushSessionEvent("play", { url });

  if (channel) {
    setLastWatched(channel);
    renderLastWatched();
  }
}

window.addEventListener("pagehide", () => {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
});

function toggleFavorite(ch) {
  const exists = favorites.find(c => c.url === ch.url);
  favorites = exists ? favorites.filter(c => c.url !== ch.url) : [...favorites, ch];
  localStorage.setItem("favorites", JSON.stringify(favorites));
  renderFavorites();
}

function renderFavorites() {
  favoritesList.innerHTML = "";
  favorites.forEach(c => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${getLabel(c.name)}</span>`;
    li.onclick = () => playStream(c.url, c);
    favoritesList.appendChild(li);
  });
}

function renderLastWatched() {
  const last = getLastWatched();
  if (!last) {
    lastWatchedContainer.innerHTML = `<div class="last-watched-empty">No recent channel yet</div>`;
    return;
  }

  lastWatchedContainer.innerHTML = `
    <div class="last-watched-card">
      <img src="${last.logo || 'https://via.placeholder.com/120x80?text=TV'}" onerror="this.src='https://via.placeholder.com/120x80?text=TV'">
      <div class="last-watched-name">${getLabel(last.name)}</div>
    </div>
  `;

  lastWatchedContainer.querySelector(".last-watched-card").onclick = () => playStream(last.url, last);
}

fetch(playlistURL)
  .then(r => r.text())
  .then(text => {
    const lines = text.split(/\r?\n/);
    let current = {};

    lines.forEach(line => {
      if (line.startsWith("#EXTINF")) {
        current.name = line.match(/,(.*)$/)?.[1] || "Unnamed";
        current.category = line.match(/group-title="([^"]+)"/)?.[1] || "Other";
        current.logo = line.match(/tvg-logo="([^"]+)"/)?.[1] || "";
      } else if (line && !line.startsWith("#")) {
        current.url = line.trim();
        channels.push(current);
        if (!categories[current.category]) categories[current.category] = [];
        categories[current.category].push(current);
        current = {};
      }
    });

    renderChannels(channels);
    renderCategories();
  });

function renderCategories() {
  categoriesList.innerHTML = "";
  Object.keys(categories).forEach(cat => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${getLabel(cat)}</span>`;
    li.onclick = () => renderChannels(categories[cat]);
    categoriesList.appendChild(li);
  });
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase();
  renderChannels(channels.filter(c => c.name.toLowerCase().includes(q)));
});

translatorBar.addEventListener("change", async (event) => {
  selectedLanguage = event.target.value || "en";
  const labels = [
    "Omar IPTV Pro", "Categories", "Favorites", "Last Watched", "Search channels...", "Load More", "Powered by Google Translate · Hosted on GitHub Pages", "No recent channel yet",
    ...channels.map(c => c.name),
    ...Object.keys(categories),
    ...favorites.map(c => c.name)
  ];
  await Promise.all([...new Set(labels)].map(translateText));
  renderChannels(visibleChannels.length ? visibleChannels : channels);
  renderFavorites();
  renderLastWatched();
  
renderGreeting();
  renderStaticText();
});

function getLabel(text) {
  if (!text) return "";
  return selectedLanguage === "en" ? text : (translationCache[`${selectedLanguage}:${text}`] || text);
}

async function translateText(text) {
  if (!text || selectedLanguage === "en") return text;
  const key = `${selectedLanguage}:${text}`;
  if (translationCache[key]) return translationCache[key];
  try {
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${selectedLanguage}&dt=t&q=${encodeURIComponent(text)}`);
    const data = await response.json();
    translationCache[key] = data?.[0]?.map(row => row[0]).join("") || text;
    return translationCache[key];
  } catch {
    return text;
  }
}

async function renderStaticText() {
  document.getElementById("siteTitle").textContent = await translateText("Omar IPTV Pro");
  document.getElementById("categoriesTitle").textContent = await translateText("Categories");
  document.getElementById("favoritesTitle").textContent = await translateText("Favorites");
  document.getElementById("lastWatchedTitle").textContent = await translateText("Last Watched");
  searchInput.placeholder = await translateText("Search channels...");
  loadMoreBtn.textContent = await translateText("Load More");
  document.getElementById("footerText").textContent = await translateText("Powered by Google Translate · Hosted on GitHub Pages");
}


const m3uInput = document.getElementById("m3uInput");
const showM3uBtn = document.getElementById("showM3uBtn");
const extractTsBtn = document.getElementById("extractTsBtn");
const m3uLinkOutput = document.getElementById("m3uLinkOutput");
const tsResults = document.getElementById("tsResults");
if (m3uInput) m3uInput.value = playlistURL;

function getM3uSourceUrl() {
  return playlistURL;
}

function setM3uLinkOutput(url) {
  if (!url) {
    m3uLinkOutput.textContent = "Paste an M3U URL first.";
    return;
  }
  m3uLinkOutput.innerHTML = `M3U link: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
}

async function extractTsLinksFromM3u(url) {
  tsResults.innerHTML = "";
  if (!url) {
    m3uLinkOutput.textContent = "Paste an M3U URL first.";
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const tsLinks = lines.filter((line) => !line.startsWith("#") && line.includes(".ts"));

    if (!tsLinks.length) {
      m3uLinkOutput.textContent = "No .ts stream URLs found in this playlist.";
      return;
    }

    tsLinks.forEach((tsUrl, index) => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="${tsUrl}" target="_blank" rel="noopener noreferrer">TS ${index + 1}</a> <a href="${tsUrl}" download>Download</a>`;
      tsResults.appendChild(li);
    });

    m3uLinkOutput.textContent = `Found ${tsLinks.length} .ts links.`;
  } catch (error) {
    m3uLinkOutput.textContent = `Unable to load M3U: ${error.message}.`;
  }
}

showM3uBtn.addEventListener("click", () => {
  const url = getM3uSourceUrl();
  if (m3uInput) m3uInput.value = url;
  setM3uLinkOutput(url);
});

extractTsBtn.addEventListener("click", () => {
  const url = getM3uSourceUrl();
  if (m3uInput) m3uInput.value = url;
  setM3uLinkOutput(url);
  extractTsLinksFromM3u(url);
});



const openaiKeyInput = document.getElementById("openaiKey");
const recapPromptInput = document.getElementById("recapPrompt");
const getRecapBtn = document.getElementById("getRecapBtn");
const recapOutput = document.getElementById("recapOutput");
const keyPassphraseInput = document.getElementById("keyPassphrase");
const saveEyncBtn = document.getElementById("saveEyncBtn");
const loadEyncFileInput = document.getElementById("loadEyncFile");
const sessionJoinAt = new Date().toISOString();
const sessionEvents = [];

function pushSessionEvent(type, details = {}) {
  sessionEvents.push({ type, at: new Date().toISOString(), ...details });
  if (sessionEvents.length > 200) sessionEvents.shift();
}



if (saveEyncBtn) {
  saveEyncBtn.addEventListener("click", async () => {
    const apiKey = (openaiKeyInput?.value || "").trim();
    const passphrase = (keyPassphraseInput?.value || "").trim();
    if (!apiKey || !passphrase) { recapOutput.textContent = "Enter API key and passphrase first."; return; }
    try {
      const payload = await window.OmarAI.createKeyFile(apiKey, passphrase);
      const blob = new Blob([payload], { type: "application/octet-stream" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "openai-key.eync";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      recapOutput.textContent = "Saved encrypted key file (.eync).";
    } catch (error) {
      recapOutput.textContent = `Failed to create .eync: ${error.message}`;
    }
  });
}

if (loadEyncFileInput) {
  loadEyncFileInput.addEventListener("change", async () => {
    const file = loadEyncFileInput.files?.[0];
    const passphrase = (keyPassphraseInput?.value || "").trim();
    if (!file || !passphrase) { recapOutput.textContent = "Choose .eync file and enter passphrase."; return; }
    try {
      const text = await file.text();
      const apiKey = await window.OmarAI.readKeyFile(text, passphrase);
      openaiKeyInput.value = apiKey;
      recapOutput.textContent = "Loaded API key from .eync file.";
    } catch (error) {
      recapOutput.textContent = `Failed to read .eync: ${error.message}`;
    }
  });
}

if (getRecapBtn) {
  getRecapBtn.addEventListener("click", async () => {
    const question = (recapPromptInput?.value || "Summarize what happened since I joined.").trim();
    const apiKey = (openaiKeyInput?.value || "").trim();
    if (!apiKey) { recapOutput.textContent = "Add your OpenAI API key first."; return; }

    recapOutput.textContent = "Generating recap...";
    try {
      const payload = {
        appView: "mobile",
        joinedAt: sessionJoinAt,
        currentTime: new Date().toISOString(),
        channelNow: player?.currentSrc || "",
        question,
        sessionEvents
      };
      recapOutput.textContent = await window.OmarAI.summarizeLiveSession(payload, { apiKey });
    } catch (error) {
      const message = String(error?.message || error || "Unknown error");
      if (message.includes("HTTP 429")) {
        recapOutput.textContent = "OpenAI quota exceeded (HTTP 429). Add billing/credits on your OpenAI project, or use a different API key/project, then try again.";
      } else {
        recapOutput.textContent = `Recap failed: ${message}`;
      }
    }
  });
}

renderGreeting();
renderFavorites();
renderLastWatched();
renderStaticText();
