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
      <div class="channelName">${ch.name}</div>
      <div class="favBtn">★</div>
    `;
    const channelNameNode = card.querySelector(".channelName");
    translateText(ch.name).then(translated => channelNameNode.textContent = translated);

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
    li.innerHTML = `<span>${c.name}</span>`;
    const nameNode = li.querySelector("span");
    translateText(c.name).then(translated => nameNode.textContent = translated);
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
      <div class="last-watched-name">${last.name}</div>
    </div>
  `;

  const nameNode = lastWatchedContainer.querySelector(".last-watched-name");
  translateText(last.name).then(t => nameNode.textContent = t);
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
    li.innerHTML = `<span>${cat}</span>`;
    const categoryNode = li.querySelector("span");
    translateText(cat).then(translated => categoryNode.textContent = translated);
    li.onclick = () => renderChannels(categories[cat]);
    categoriesList.appendChild(li);
  });
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase();
  renderChannels(channels.filter(c => c.name.toLowerCase().includes(q)));
});

async function translateText(text) {
  if (!text || selectedLanguage === "en") return text;
  const key = `${selectedLanguage}:${text}`;
  if (translationCache[key]) return translationCache[key];
  currentIndex+=batchSize;
  if(currentIndex>=visibleChannels.length){
    loadMoreBtn.style.display="none";
  }
  renderStaticText();
}

loadMoreBtn.onclick=loadNextBatch;

function playStream(url){
  if(url.endsWith(".m3u8") && Hls.isSupported()){
    const hls=new Hls();
    hls.loadSource(url);
    hls.attachMedia(player);
  }else{
    player.src=url;
  }
  player.play();
}

function toggleFavorite(ch){
  const exists=favorites.find(c=>c.url===ch.url);
  if(exists){
    favorites=favorites.filter(c=>c.url!==ch.url);
  }else{
    favorites.push(ch);
  }
  localStorage.setItem("favorites",JSON.stringify(favorites));
  renderFavorites();
}

function renderFavorites(){
  favoritesList.innerHTML="";
  favorites.forEach(c=>{
    const li=document.createElement("li");
    li.innerHTML=`<span>${c.name}</span>`;
    const favNameNode=li.querySelector("span");
    translateText(c.name).then(translated=>{
      favNameNode.textContent=translated;
    });
    li.onclick=()=>renderChannels([c]);
    favoritesList.appendChild(li);
  });
  renderStaticText();
}

fetch(playlistURL)
.then(r=>r.text())
.then(text=>{
  const lines=text.split(/\r?\n/);
  let current={};

  lines.forEach(line=>{
    if(line.startsWith("#EXTINF")){
      current.name=line.match(/,(.*)$/)?.[1]||"Unnamed";
      current.category=line.match(/group-title="([^"]+)"/)?.[1]||"Other";
      current.logo=line.match(/tvg-logo="([^"]+)"/)?.[1]||"";
    } else if(line && !line.startsWith("#")){
      current.url=line.trim();
      channels.push(current);
      if(!categories[current.category]) categories[current.category]=[];
      categories[current.category].push(current);
      current={};
    }
  });

  renderChannels(channels);
  renderCategories();
});

function renderCategories(){
  categoriesList.innerHTML="";
  Object.keys(categories).forEach(cat=>{
    const li=document.createElement("li");
    li.innerHTML = `<span>${cat}</span>`;
    const categoryNode=li.querySelector("span");
    translateText(cat).then(translated=>{
      categoryNode.textContent=translated;
    });
    li.onclick=()=>renderChannels(categories[cat]);
    categoriesList.appendChild(li);
  });
  renderStaticText();
}

searchInput.addEventListener("input",()=>{
  const q=searchInput.value.toLowerCase();
  renderChannels(channels.filter(c=>c.name.toLowerCase().includes(q)));
});

renderFavorites();

async function translateText(text){
  if(!text || selectedLanguage === "en") return text;
  const key = `${selectedLanguage}:${text}`;
  if(translationCache[key]) return translationCache[key];
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

translatorBar.addEventListener("change", async (event) => {
  selectedLanguage = event.target.value || "en";
  renderChannels(visibleChannels.length ? visibleChannels : channels);
  renderCategories();
  renderFavorites();
  renderLastWatched();
  renderGreeting();
  renderStaticText();
});

renderGreeting();
renderFavorites();
renderLastWatched();
renderStaticText();
