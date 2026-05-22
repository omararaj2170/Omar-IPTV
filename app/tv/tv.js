const playlistURL = "../../m3u/playlist.m3u";
const player = document.getElementById("player");
const caption = document.getElementById("caption");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const searchInput = document.getElementById("search");
const languageSelect = document.getElementById("language");
const channelList = document.getElementById("channelList");
const loadingHint = document.getElementById("loadingHint");
const userGreeting = document.getElementById("userGreeting");
const lastWatchedContainer = document.getElementById("lastWatchedContainer");

const BATCH_SIZE = 25;
let channels = [];
let filtered = [];
let renderedCount = 0;
let lang = "original";
let isRenderingBatch = false;
let hlsInstance = null;
let lastPlayRequestAt = 0;
let delayedPlayTimer = null;
let pendingChannel = null;
const translationCache = {};
const translationInFlight = {};

const CHANNEL_SWITCH_COOLDOWN_MS = 900;
const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  backBufferLength: 30,
  maxBufferLength: 20,
  maxMaxBufferLength: 30,
  maxBufferSize: 30 * 1000 * 1000,
  liveSyncDurationCount: 4,
  liveMaxLatencyDurationCount: 8,
  capLevelToPlayerSize: true
};

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
  if (username) userGreeting.textContent = `Hello! ${username}`;
  else userGreeting.innerHTML = 'Hello! <a href="../login/login.html">Sign Up / Log In</a>';
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
  translate(last.name).then(t => nameNode.textContent = t);
  lastWatchedContainer.querySelector(".last-watched-card").onclick = () => playChannel(last);
}

const languages = {
  original:"🌐 Original",
  af:"Afrikaans",sq:"Albanian",am:"Amharic",ar:"Arabic",hy:"Armenian",
  az:"Azerbaijani",eu:"Basque",be:"Belarusian",bn:"Bengali",bs:"Bosnian",
  bg:"Bulgarian",ca:"Catalan",ceb:"Cebuano",zh:"Chinese",co:"Corsican",
  hr:"Croatian",cs:"Czech",da:"Danish",nl:"Dutch",en:"English",
  eo:"Esperanto",et:"Estonian",fi:"Finnish",fr:"French",fy:"Frisian",
  gl:"Galician",ka:"Georgian",de:"German",el:"Greek",gu:"Gujarati",
  ht:"Haitian Creole",ha:"Hausa",haw:"Hawaiian",hi:"Hindi",hmn:"Hmong",
  hu:"Hungarian",is:"Icelandic",ig:"Igbo",id:"Indonesian",ga:"Irish",
  it:"Italian",ja:"Japanese",jw:"Javanese",kn:"Kannada",kk:"Kazakh",
  km:"Khmer",ko:"Korean",ku:"Kurdish",ky:"Kyrgyz",lo:"Lao",la:"Latin",
  lv:"Latvian",lt:"Lithuanian",lb:"Luxembourgish",mk:"Macedonian",mg:"Malagasy",
  ms:"Malay",ml:"Malayalam",mt:"Maltese",mi:"Maori",mr:"Marathi",mn:"Mongolian",
  my:"Myanmar",ne:"Nepali",no:"Norwegian",ny:"Nyanja",or:"Odia",ps:"Pashto",
  fa:"Persian",pl:"Polish",pt:"Portuguese",pa:"Punjabi",ro:"Romanian",ru:"Russian",
  sm:"Samoan",gd:"Scots Gaelic",sr:"Serbian",st:"Sesotho",sn:"Shona",sd:"Sindhi",
  si:"Sinhala",sk:"Slovak",sl:"Slovenian",so:"Somali",es:"Spanish",su:"Sundanese",
  sw:"Swahili",sv:"Swedish",tl:"Tagalog",tg:"Tajik",ta:"Tamil",tt:"Tatar",te:"Telugu",
  th:"Thai",tr:"Turkish",tk:"Turkmen",uk:"Ukrainian",ur:"Urdu",ug:"Uyghur",uz:"Uzbek",
  vi:"Vietnamese",cy:"Welsh",xh:"Xhosa",yi:"Yiddish",yo:"Yoruba",zu:"Zulu"
};

for (const key in languages) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = languages[key];
  languageSelect.appendChild(opt);
}

async function translate(text) {
  if (!text || lang === "original") return text;
  const key = `${lang}:${text}`;
  if (translationCache[key]) return translationCache[key];
  if (translationInFlight[key]) return translationInFlight[key];

  translationInFlight[key] = fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
  )
    .then(response => response.json())
    .then(data => data?.[0]?.map(part => part[0]).join("") || text)
    .catch(() => text)
    .then(result => {
      translationCache[key] = result;
      delete translationInFlight[key];
      return result;
    });

  return translationInFlight[key];
}

function parsePlaylist(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  let current = null;

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const name = line.split(",").pop()?.trim() || "Unnamed";
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      current = { name, logo: logoMatch ? logoMatch[1] : "", url: "" };
      continue;
    }

    if (line.startsWith("#")) continue;

    if (!current) {
      current = { name: line, logo: "", url: line };
    } else {
      current.url = line;
    }

    parsed.push(current);
    current = null;
  }

  return parsed;
}

function playChannel(channel) {
  const now = Date.now();
  const sinceLast = now - lastPlayRequestAt;
  if (sinceLast < CHANNEL_SWITCH_COOLDOWN_MS) {
    pendingChannel = channel;
    if (delayedPlayTimer) clearTimeout(delayedPlayTimer);
    delayedPlayTimer = setTimeout(() => {
      if (pendingChannel) {
        const queued = pendingChannel;
        pendingChannel = null;
        playChannel(queued);
      }
    }, CHANNEL_SWITCH_COOLDOWN_MS - sinceLast);
    return;
  }
  lastPlayRequestAt = now;

  const url = (channel.url || "").trim();
  if (!url) return;

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (url.includes(".m3u8")) {
    if (Hls.isSupported()) {
      hlsInstance = new Hls(HLS_CONFIG);
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(player);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        player.play().catch(() => {});
      pushSessionEvent("play", { url });
      });
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal && hlsInstance) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hlsInstance.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hlsInstance.recoverMediaError();
          } else {
            hlsInstance.destroy();
            hlsInstance = null;
          }
        }
      });
    } else if (player.canPlayType("application/vnd.apple.mpegurl")) {
      player.src = url;
      player.play().catch(() => {});
      pushSessionEvent("play", { url });
    }
  } else {
    player.src = url;
    player.play().catch(() => {});
      pushSessionEvent("play", { url });
  }
}

async function renderNextBatch() {
  if (isRenderingBatch) return;

  const nextItems = filtered.slice(renderedCount, renderedCount + BATCH_SIZE);
  if (!nextItems.length) {
    loadingHint.textContent = renderedCount ? "No more channels" : "No channels found";
    return;
  }

  isRenderingBatch = true;
  renderedCount += nextItems.length;

  try {
    const nameNodes = [];

    nextItems.forEach((ch) => {
      const li = document.createElement("li");
      li.tabIndex = 0;

      const img = document.createElement("img");
      img.className = "logo";
      img.src = ch.logo || "https://via.placeholder.com/56?text=TV";
      img.onerror = () => { img.src = "https://via.placeholder.com/56?text=TV"; };

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = ch.name;
      nameNodes.push({ node: name, rawName: ch.name });

      li.append(img, name);

      li.addEventListener("click", async () => {
        playChannel(ch);
        setLastWatched(ch);
        renderLastWatched();
        caption.textContent = await translate(ch.name);
        sidebar.classList.remove("open");
      });

      channelList.appendChild(li);
    });

    Promise.all(nameNodes.map(item => translate(item.rawName))).then(translated => {
      translated.forEach((label, idx) => {
        nameNodes[idx].node.textContent = label || nameNodes[idx].rawName;
      });
    });

    loadingHint.textContent = renderedCount < filtered.length
      ? `Loaded ${renderedCount} / ${filtered.length} channels`
      : "No more channels";
  } finally {
    isRenderingBatch = false;
  }
}

function resetAndRender() {
  renderedCount = 0;
  isRenderingBatch = false;
  channelList.innerHTML = "";
  loadingHint.textContent = "Loading...";
  renderNextBatch();
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase().trim();
  filtered = channels.filter(ch => ch.name.toLowerCase().includes(q));
  resetAndRender();
});

languageSelect.addEventListener("change", () => {
  lang = languageSelect.value;
  resetAndRender();
  renderLastWatched();
});

channelList.addEventListener("scroll", () => {
  const nearBottom = channelList.scrollTop + channelList.clientHeight >= channelList.scrollHeight - 120;
  if (nearBottom) {
    renderNextBatch();
  }
});

sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") sidebar.classList.add("open");
  if (e.key === "ArrowLeft") sidebar.classList.remove("open");
});

window.addEventListener("pagehide", () => {
  if (delayedPlayTimer) {
    clearTimeout(delayedPlayTimer);
    delayedPlayTimer = null;
  }
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
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
        appView: "tv",
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
renderLastWatched();




const m3uInput = document.getElementById("m3uInput");
const showM3uBtn = document.getElementById("showM3uBtn");
const extractTsBtn = document.getElementById("extractTsBtn");
const m3uLinkOutput = document.getElementById("m3uLinkOutput");
const tsResults = document.getElementById("tsResults");
if (m3uInput) m3uInput.value = playlistURL;

function getM3uSourceUrl() { return playlistURL; }
function setM3uLinkOutput(url) {
  if (!url) { m3uLinkOutput.textContent = "Paste an M3U URL first."; return; }
  m3uLinkOutput.innerHTML = `M3U link: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
}
async function extractTsLinksFromM3u(url) {
  tsResults.innerHTML = "";
  if (!url) { m3uLinkOutput.textContent = "Paste an M3U URL first."; return; }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const tsLinks = lines.filter((line) => !line.startsWith("#") && line.includes(".ts"));
    if (!tsLinks.length) { m3uLinkOutput.textContent = "No .ts stream URLs found in this playlist."; return; }
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
showM3uBtn.addEventListener("click",()=>{const url=getM3uSourceUrl(); if (m3uInput) m3uInput.value = url; setM3uLinkOutput(url);});
extractTsBtn.addEventListener("click",()=>{const url=getM3uSourceUrl(); if (m3uInput) m3uInput.value = url; setM3uLinkOutput(url);extractTsLinksFromM3u(url);});

fetch(playlistURL)
  .then(r => r.text())
  .then(text => {
    channels = parsePlaylist(text);
    filtered = channels;
    resetAndRender();
  })
  .catch(() => {
    loadingHint.textContent = "Failed to load playlist.m3u";
  });
