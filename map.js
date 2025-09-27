/* Config */
const MAPBOX_TOKEN = "pk.eyJ1IjoibGlnaHRseWdyaWxsZWQiLCJhIjoiY21meGw3cjN2MDRqbDJpcjAyYzJjdHI3OCJ9.yixU3wNsx1hQcVqil157TQ"; // ← replace in Webflow Project Settings
const DEFAULT_CENTER = [-80.8431, 35.2271]; // Charlotte, NC [lng, lat]
const DEFAULT_ZOOM = 9;
const GEOCODE_CACHE_KEY = "mapbox_geocode_cache_v1";

/* Utilities */
function getCache(){
  try{ return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || "{}"); }catch(_){ return {}; }
}
function setCache(cache){
  try{ localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); }catch(_){ /* ignore */ }
}
function debounce(fn, wait){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); } }

async function geocodeAddress(address){
  if(!address) return null;
  const cache = getCache();
  if(cache[address]) return cache[address];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if(!res.ok) return null;
  const data = await res.json();
  const feature = data.features && data.features[0];
  if(!feature) return null;
  const [lng, lat] = feature.center;
  cache[address] = { lng, lat };
  setCache(cache);
  return cache[address];
}

function qs(el, sel){ return el.querySelector(sel); }
function qsa(el, sel){ return Array.from(el.querySelectorAll(sel)); }

function parseCoord(value){
  if(value == null) return NaN;
  const n = parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : NaN;
}

/* Build popup HTML */
function createPopupHTML({name, address, imgSrc, link}){
  const safeName = name || "Untitled";
  const safeAddress = address || "Address not available";
  const safeImg = imgSrc || "https://via.placeholder.com/640x360?text=No+Image";
  const safeLink = link || "#";
  return `
    <div class="popup-card">
      <img class="popup-media" src="${safeImg}" alt="${safeName}">
      <div class="popup-body">
        <h3 class="popup-title">${safeName}</h3>
        <p class="popup-address">${safeAddress}</p>
        <div class="popup-actions">
          <a class="popup-btn primary" href="${safeLink}" target="_blank" rel="noopener">Directions</a>
        </div>
      </div>
    </div>
  `;
}

/* Initialize Map */
function initMap(){
  if(!MAPBOX_TOKEN || MAPBOX_TOKEN === "YOUR_MAPBOX_TOKEN_HERE"){
    console.warn("Mapbox token missing. Set MAPBOX_TOKEN in map.js or via Webflow embed.");
  }
  mapboxgl.accessToken = MAPBOX_TOKEN;
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    cooperativeGestures: true, // Requires two-finger pan/zoom, allows single-finger scroll
  });
  map.addControl(new mapboxgl.NavigationControl({showCompass:false}), 'top-right');
  return map;
}

/* Read items from DOM */
function readItems(){
  const list = document.querySelector('[data-map-list]');
  if(!list) return [];
  const items = qsa(list, '[data-map-item]');
  return items.map((el, index)=>{
    const nameEl = el.querySelector('[data-map-name]');
    const addrEl = el.querySelector('[data-map-address]');
    const imgEl = el.querySelector('[data-map-img]');
    const linkEl = el.querySelector('[data-map-link]');
    const latAttr = el.getAttribute('data-map-lat');
    const lngAttr = el.getAttribute('data-map-lng');
    const lat = parseCoord(latAttr);
    const lng = parseCoord(lngAttr);
    return {
      el,
      id: el.getAttribute('data-map-id') || String(index),
      name: nameEl ? nameEl.textContent.trim() : '',
      address: addrEl ? addrEl.textContent.trim() : '',
      img: imgEl ? (imgEl.getAttribute('src') || '').trim() : '',
      link: linkEl ? (linkEl.getAttribute('href') || '').trim() : '',
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    };
  }).filter(x=>x.name || x.address || (x.lat!=null && x.lng!=null));
}

/* Main render */
async function render(){
  const map = initMap();
  const items = readItems();
  if(items.length === 0){ return; }

  const bounds = new mapboxgl.LngLatBounds();
  const markers = new Map();

  for(const item of items){
    let coords = null;
    if(item.lat != null && item.lng != null){
      coords = { lng: item.lng, lat: item.lat };
    } else if(item.address){
      try{ coords = await geocodeAddress(item.address); }catch(_){ coords = null; }
    }
    if(!coords) continue;

    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
      .setHTML(createPopupHTML({
        name: item.name,
        address: item.address,
        imgSrc: item.img,
        link: item.link
      }));

    const el = document.createElement('div');
    el.className = 'marker-dot';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.background = 'black';
    el.style.boxShadow = '0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,.25)';
    el.style.cursor = 'pointer';

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([coords.lng, coords.lat])
      .addTo(map);

    // Hover behavior with popup hover detection
    let hoverTimeout = null;
    
    function showPopup(){
      if(hoverTimeout) clearTimeout(hoverTimeout);
      popup.addTo(map).setLngLat([coords.lng, coords.lat]);
      item.el.classList.add('active');
    }
    
    function hidePopup(){
      if(hoverTimeout) clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        popup.remove();
        item.el.classList.remove('active');
      }, 100);
    }
    
    function cancelHide(){
      if(hoverTimeout) clearTimeout(hoverTimeout);
    }

    // Marker hover
    el.addEventListener('mouseenter', showPopup);
    el.addEventListener('mouseleave', hidePopup);

    // Sidebar hover
    item.el.addEventListener('mouseenter', ()=>{
      showPopup();
      map.flyTo({ center: [coords.lng, coords.lat], zoom: Math.max(map.getZoom(), 12), essential: true });
    });
    item.el.addEventListener('mouseleave', hidePopup);

    // Popup hover detection
    popup.on('open', () => {
      const popupEl = popup.getElement();
      if(popupEl){
        popupEl.addEventListener('mouseenter', cancelHide);
        popupEl.addEventListener('mouseleave', hidePopup);
      }
    });

    markers.set(item.id, { marker, popup, item, coords });
    bounds.extend([coords.lng, coords.lat]);
  }

  if(!bounds.isEmpty()){
    map.fitBounds(bounds, { padding: {top: 40, bottom: 40, left: 40, right: 40} });
  }
}

/* DOM ready */
function onReady(fn){
  if(document.readyState === 'complete' || document.readyState === 'interactive') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}

onReady(()=>{
  render();
});
