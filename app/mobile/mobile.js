// IPTV Logic (same as desktop)
const playlistURL="../../m3u/playlist.m3u";
const player=document.getElementById("player");
const grid=document.getElementById("channelGrid");
const searchInput=document.getElementById("search");
const sidebar=document.getElementById("sidebar");
const main=document.getElementById("main");
const categoriesList=document.getElementById("categories");
const favoritesList=document.getElementById("favorites");
const loadMoreBtn=document.getElementById("loadMoreBtn");
const translatorBar=document.getElementById("translatorBar");

let channels=[];
let categories={};
let visibleChannels=[];
let currentIndex=0;
const batchSize=24;
let favorites=JSON.parse(localStorage.getItem("favorites")||"[]");
let selectedLanguage="en";
const translationCache={};

document.getElementById("menuBtn").onclick=()=>{
  sidebar.classList.toggle("active");
  main.classList.toggle("shift");
};

function renderChannels(list){
  visibleChannels=list;
  currentIndex=0;
  grid.innerHTML="";
  loadMoreBtn.style.display="block";
  loadNextBatch();
  renderStaticText();
}

function loadNextBatch(){
  const batch=visibleChannels.slice(currentIndex,currentIndex+batchSize);

  batch.forEach(ch=>{
    const card=document.createElement("div");
    card.className="channelCard";
    card.innerHTML=`
      <img src="${ch.logo || 'https://via.placeholder.com/300x150'}"
           loading="lazy"
           onerror="this.src='https://via.placeholder.com/300x150'">
      <div class="channelName">${getLabel(ch.name)}</div>
      <div class="favBtn">★</div>
    `;
    card.onclick=()=>playStream(ch.url);
    card.querySelector(".favBtn").onclick=(e)=>{
      e.stopPropagation();
      toggleFavorite(ch);
    };
    grid.appendChild(card);
  });

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
    li.innerHTML=`<span>${getLabel(c.name)}</span>`;
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
    li.innerHTML=`<span>${getLabel(cat)}</span>`;
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

translatorBar.addEventListener("change", async (event)=>{
  selectedLanguage = event.target.value || "en";
  const labels = [
    "Omar IPTV Pro","Categories","Favorites","Search channels...","Load More",
    "Powered by Google Translate · Hosted on GitHub Pages",
    ...channels.map(c=>c.name),
    ...Object.keys(categories),
    ...favorites.map(c=>c.name)
  ];
  await Promise.all([...new Set(labels)].map(translateText));
  renderChannels(visibleChannels.length ? visibleChannels : channels);
  renderFavorites();
  renderStaticText();
});

renderStaticText();

function getLabel(text){
  if(!text) return "";
  return selectedLanguage === "en" ? text : (translationCache[`${selectedLanguage}:${text}`] || text);
}

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

async function renderStaticText(){
  document.getElementById("siteTitle").textContent = await translateText("Omar IPTV Pro");
  document.getElementById("categoriesTitle").textContent = await translateText("Categories");
  document.getElementById("favoritesTitle").textContent = await translateText("Favorites");
  searchInput.placeholder = await translateText("Search channels...");
  loadMoreBtn.textContent = await translateText("Load More");
  document.getElementById("footerText").textContent = await translateText("Powered by Google Translate · Hosted on GitHub Pages");
}
