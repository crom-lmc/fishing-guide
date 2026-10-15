/* 钓鱼指南 · 钓点地图 + 附近水域 + 我的位置 */
/* ============================================================
   钓点地图
   ============================================================ */
const SKEY = "fish.spots.v1";
let spots = store.get(SKEY, []);
function saveSpots(){ store.set(SKEY, spots); }

/* ------------------------------------------------------------
   高德 POI 钓点咨询：搜附近收费钓场 / 野钓点 / 水库钓位。
   Key 不落地前端：nginx 在服务端把 key 拼进高德请求（/api/amap 反代），
   与智谱 AI 的 /api/vision 同一套思路；换 Key 只改 nginx 配置，前端无需动。
   ------------------------------------------------------------ */
const AMAP_API = "api/amap";   // 本站反代端点（相对路径，HTTPS / 8082 均可用）

/* 瓦片源：高德（国内可达、中文标注）道路 + 卫星两种 */
const TILES = {
  road: L => L.tileLayer("https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}", {subdomains:"1234", maxZoom:18, attribution:"© 高德地图"}),
  sat:  L => L.tileLayer("https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}", {subdomains:"1234", maxZoom:18, attribution:"© 高德地图"})
};
let map = null, mapReady = false, curLayer = null, pickMode = false, leafletTried = false;
const MAP_CENTER = [34.265, 108.95];   // 默认中心：西安附近，无数据时展示

/* Leaflet 运行时按需加载（不阻塞首屏），多 CDN 回退 */
function loadLeaflet(cb){
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(css);
  const cdns = [
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"
  ];
  let i = 0;
  const tryNext = () => {
    if (i >= cdns.length){ cb(); return; }
    const s = document.createElement("script");
    s.src = cdns[i++];
    s.onload = () => cb();
    s.onerror = tryNext;
    document.head.appendChild(s);
  };
  tryNext();
}

function ensureMap(){
  renderSpots();
  if (mapReady){ setTimeout(() => map && map.invalidateSize(), 60); return; }
  if (typeof L === "undefined"){
    if (!leafletTried){ leafletTried = true; loadLeaflet(() => ensureMap()); }
    else renderMapFallback();
    return;
  }
  mapReady = true;
  try{
    map = L.map("map", {zoomControl:true, attributionControl:true}).setView(MAP_CENTER, 11);
    curLayer = TILES.road(L); curLayer.addTo(map);
    /* 地图被重建时旧图层已随实例销毁，指针重置掉免得引用到僵尸图层 */
    myLocLayer = myLocDot = myLocAcc = null; sharedLayer = null;
    /* 拖动地图 = 别跟着我了（高德同款手感），再点「我的位置」恢复 */
    map.on("dragstart", () => {
      if (locFollowing){
        myLocFollow(false);
        locTip("#mapLocateTip", "已暂停跟随（拖动地图会自动暂停）。点「📍 我的位置」重新跟随。");
      }
    });
    refreshMarkers();
    drawRiverPts();
    drawAmapPts();
    if (locBest) setMyLoc(locBest.la, locBest.lo, locBest.acc);
    if (sharedPt) drawShared();          // 分享进来的钓点，地图重建后要补回去
    setTimeout(() => map.invalidateSize(), 80);
  }catch(e){ mapReady = false; map = null; renderMapFallback(e); }
}

function allSpots(){
  const logPts = logs.filter(x => x.lat != null && x.lng != null).map(x => ({
    name: x.spot || "钓点", lat:x.lat, lng:x.lng, type:"log",
    meta: (x.date || "") + (x.fish ? " · " + x.fish : "") + (x.count ? " · " + x.count + " 尾" : ""),
    rec: x
  }));
  const fav = spots.map(s => ({ name:s.name, lat:s.lat, lng:s.lng, type:"spot", meta:s.note || "", rec:s }));
  return logPts.concat(fav);
}

let markerLayer = null;
function refreshMarkers(){
  if (!map) return;
  if (markerLayer){ markerLayer.remove(); markerLayer = null; }
  markerLayer = L.layerGroup().addTo(map);
  allSpots().forEach(p => {
    /* 收藏/日志坐标是 WGS-84 真值，画到高德底图前转 GCJ-02 */
    const m = L.marker(mapLatLng(p.lat, p.lng)).addTo(markerLayer);
    const html = "<b>" + esc(p.name) + "</b>"
      + "<div class=\"pop-row\">" + esc(p.meta || "") + "</div>"
      + "<div class=\"pop-act\">"
      + (p.type === "log"
          ? "<a href=\"javascript:void(0)\" data-log=\"" + p.rec.ts + "\">查看日志</a>"
          : "<button data-del=\"" + esc(p.rec.name) + "\">删除钓点</button>")
      + "<button data-share2=\"1\">分享</button>"
      + "</div>";
    m.bindPopup(html);
    m.on("popupopen", () => {
      const box = m.getPopup().getElement();
      const sh = box && box.querySelector("[data-share2]");
      if (sh) sh.onclick = () => { closePopup(); openShare({name: p.name, lat: p.lat, lng: p.lng, note: p.meta || ""}); };
      const a = box && box.querySelector("[data-log]");
      if (a) a.onclick = () => { go("log"); closePopup(); };
      const d = box && box.querySelector("[data-del]");
      if (d) d.onclick = () => {
        spots = spots.filter(s => !(s.name === p.rec.name && s.ts === p.rec.ts));
        saveSpots(); refreshMarkers(); renderSpots(); closePopup();
      };
    });
  });
}
function closePopup(){ if (map) map.closePopup(); }

function focusSpot(lat, lng){
  ensureMap();
  if (!map) return;
  const t = mapLatLng(lat, lng);          // 底图是 GCJ-02，飞过去也要转换
  map.flyTo(t, 15, {duration:.6});
  setTimeout(() => {
    if (!markerLayer) return;
    /* 标记本身就是 GCJ-02，用转换后的目标值比对，否则永远匹配不上 */
    const m = markerLayer.getLayers().find(x => Math.abs(x.getLatLng().lat - t[0]) < 1e-5 && Math.abs(x.getLatLng().lng - t[1]) < 1e-5);
    if (m) m.openPopup();
  }, 700);
}

/* 图层切换（顶部分段控件） */
$$("#mapLayers .seg-btn").forEach(b => b.onclick = () => {
  $$("#mapLayers .seg-btn").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  if (map && typeof L !== "undefined"){
    if (curLayer) curLayer.remove();
    curLayer = TILES[b.dataset.layer](L); curLayer.addTo(map);
  }
});

/* 定位失败文案：一处定义，地图与出钓指数共用，省得两边说法不一。
   分开「被拒绝 / 定位不到 / 超时」，因为对应的下一步动作完全不同。 */
function locErrText(err){
  const c = err && err.code;
  if (c === 1) return "定位权限被拒绝。点地址栏左侧的图标，把「位置信息」改成「允许」再试。";
  if (c === 2) return "暂时定位不到（信号弱或没有可用定位源），换个地方再试。";
  if (c === 3) return "定位超时。到窗边或室外重试，或直接手动填地区。";
  return "定位失败，请稍后重试。";
}
/* 定位反馈走内联提示，不用原生 alert：弹窗容易被顺手关掉，也放不下可操作的指引 */
function locTip(sel, text){
  const el = $(sel); if (!el) return;
  if (text){ el.hidden = false; el.textContent = text; }
  else { el.hidden = true; el.textContent = ""; }
}

/* ============================================================
   我的位置：高德式蓝点
   三层观感 = 呼吸光环（CSS 动画） + 蓝色实心点 + 精度圈（L.circle）
   定位成功后进入「跟随」；拖动地图自动暂停（和高德一样的手感），
   再点一次按钮恢复。离开地图页会停掉 GPS 监听，蓝点留在原地。
   ============================================================ */
let myLocLayer = null, myLocDot = null, myLocAcc = null, locWatch = null;
let locFollowing = false, locBest = null;   // locBest = {la, lo, acc, t} 最后一次定位结果

function myLocIcon(following){
  return L.divIcon({
    className: "myloc-wrap",
    html: '<div class="myloc-ico' + (following ? " following" : "") + '"><i></i></div>',
    iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -15]
  });
}

function myLocPopHtml(){
  if (!locBest) return "";
  const la = locBest.la, lo = locBest.lo;
  const amap = "https://uri.amap.com/marker?position=" + amapPos(la, lo)
    + "&name=" + encodeURIComponent("我的位置");
  return "<b>我的位置</b>"
    + "<div class=\"pop-row\">纬度 " + la.toFixed(5) + "° · 经度 " + lo.toFixed(5) + "°</div>"
    + "<div class=\"pop-row\">精度约 ±" + Math.round(locBest.acc) + " m · " + locBest.t + " 定位</div>"
    + "<div class=\"pop-act\">"
    + "<button type=\"button\" data-copy=\"" + la.toFixed(6) + "," + lo.toFixed(6) + "\">复制坐标</button>"
    + "<button type=\"button\" data-river=\"1\">查附近水域</button>"
    + "<a href=\"" + amap + "\" target=\"_blank\" rel=\"noopener\">高德打开 ↗</a>"
    + "</div>";
}

/* clipboard API 在非安全源（http）下不可用，退回临时 textarea + execCommand */
function copyText(text, ok){
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(ok, () => legacyCopy(text, ok));
  } else legacyCopy(text, ok);
}
function legacyCopy(text, ok){
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); ok && ok(); }catch(e){}
  ta.remove();
}

/* ⚠️ 存进 locBest 的仍是 WGS-84 真值（Overpass 查询要用），
   但画到高德(GCJ-02)底图上必须先 mapLatLng() 转换，否则蓝点会偏 300–500m。 */
function setMyLoc(la, lo, acc){
  if (!map || typeof L === "undefined") return;
  if (!myLocLayer) myLocLayer = L.layerGroup().addTo(map);
  locBest = {la:la, lo:lo, acc:acc || 0, t:new Date().toTimeString().slice(0, 5)};
  if (!myLocDot){
    myLocDot = L.marker(mapLatLng(la, lo), {icon:myLocIcon(locFollowing), zIndexOffset:900, keyboard:false}).addTo(myLocLayer);
    /* 传函数而不是字符串：每次打开都按最新的 locBest 现算内容 */
    myLocDot.bindPopup(myLocPopHtml);
    myLocDot.on("popupopen", () => {
      const box = myLocDot.getPopup().getElement(); if (!box) return;
      const cp = box.querySelector("[data-copy]");
      if (cp) cp.onclick = () => copyText(cp.dataset.copy, () => {
        cp.textContent = "已复制";
        setTimeout(() => { cp.textContent = "复制坐标"; }, 1400);
      });
      const rv = box.querySelector("[data-river]");
      if (rv) rv.onclick = () => { closePopup(); loadRivers(locBest.la, locBest.lo, riverR, true); };
    });
  } else {
    myLocDot.setLatLng(mapLatLng(la, lo));
    myLocDot.setIcon(myLocIcon(locFollowing));
  }
  const r = Math.max(acc || 0, 8);   // 精度圈太小时看不见，给个下限
  if (!myLocAcc){
    myLocAcc = L.circle(mapLatLng(la, lo), {radius:r, color:"#1a73e8", weight:1, opacity:.55,
      fillColor:"#1a73e8", fillOpacity:.12, interactive:false}).addTo(myLocLayer);
  } else {
    myLocAcc.setLatLng(mapLatLng(la, lo)).setRadius(r);
  }
}

function myLocFollow(on){
  locFollowing = !!on;
  const b = $("#mapLocate");
  if (b) b.classList.toggle("loc-on", locFollowing);
  if (myLocDot && typeof L !== "undefined") myLocDot.setIcon(myLocIcon(locFollowing));
}
function myLocCenter(zoom){
  if (!map || !locBest) return;
  if (zoom) map.flyTo([locBest.la, locBest.lo], zoom, {duration:.6});
  else map.panTo([locBest.la, locBest.lo], {animate:true, duration:.35});
}
function myLocWatchOn(){
  if (locWatch != null || !navigator.geolocation) return;
  locWatch = navigator.geolocation.watchPosition(pos => {
    const c = pos.coords;
    setMyLoc(c.latitude, c.longitude, c.accuracy);
    if (locFollowing) myLocCenter(0);
    locTip("#mapLocateTip", "已定位 · 精度 ±" + Math.round(c.accuracy) + " m"
      + (locFollowing ? " · 跟随中（拖动地图可暂停）" : " · 已暂停跟随"));
    /* 顺手把附近水域也查出来（同一位置走缓存，不会重复请求） */
    loadRivers(c.latitude, c.longitude, riverR, false);
  }, err => {
    locTip("#mapLocateTip", locErrText(err) + (locBest ? "（蓝点仍是上一次的位置）" : ""));
    myLocWatchOff();
    myLocFollow(false);
  }, {timeout:15000, maximumAge:5000, enableHighAccuracy:true});
}
function myLocWatchOff(){
  if (locWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(locWatch);
  locWatch = null;
}

$("#mapLocate").onclick = () => {
  ensureMap();
  if (!navigator.geolocation){ locTip("#mapLocateTip", "当前环境不支持定位。"); return; }
  if (!map){ locTip("#mapLocateTip", "地图还没加载好，稍等一下再试。"); return; }
  /* 已在跟随时再点 = 回到当前位置（高德同款） */
  if (locFollowing && locBest){
    myLocCenter(16);
    locTip("#mapLocateTip", "已回到当前位置 · 跟随中");
    return;
  }
  const btn = $("#mapLocate");
  locTip("#mapLocateTip", "正在定位…");
  btn.classList.add("loc-busy");
  navigator.geolocation.getCurrentPosition(pos => {
    btn.classList.remove("loc-busy");
    const c = pos.coords;
    setMyLoc(c.latitude, c.longitude, c.accuracy);
    myLocFollow(true);                 // 先亮跟随状态，再让 watch 接手持续刷新
    myLocCenter(15);
    locTip("#mapLocateTip", "已定位 · 精度 ±" + Math.round(c.accuracy) + " m · 跟随中（拖动地图可暂停）");
    myLocWatchOn();
    loadRivers(c.latitude, c.longitude, riverR, false);
  }, err => {
    btn.classList.remove("loc-busy");
    locTip("#mapLocateTip", locErrText(err));
  }, {timeout:10000, maximumAge:2000, enableHighAccuracy:true});
};

/* 点图加钓点 */
$("#mapPick").onclick = () => {
  ensureMap();
  if (!map) return;
  pickMode = !pickMode;
  $("#mapPick").classList.toggle("on", pickMode);
  $("#mapPickTip").hidden = !pickMode;
  if (pickMode){
    map.once("click", e => {
      pickMode = false; $("#mapPick").classList.remove("on"); $("#mapPickTip").hidden = true;
      const name = window.prompt ? window.prompt("给这个钓点起个名字：", "新钓点") : "新钓点";
      if (name === null) return;
      const nm = name.trim() || "新钓点";
      const note = window.prompt ? window.prompt("备注（可选，如水深 / 鱼情）：", "") : "";
      spots.push({name:nm, lat:e.latlng.lat, lng:e.latlng.lng, note:(note||"").trim(), ts:Date.now()});
      saveSpots(); refreshMarkers(); renderSpots();
      map.flyTo([e.latlng.lat, e.latlng.lng], 15, {duration:.5});
    });
  }
};

function renderSpots(){
  const el = $("#spotList"); if (!el) return;
  if (!spots.length){
    el.innerHTML = "<div class=\"empty\" style=\"grid-column:1/-1\">还没有收藏钓点。点上方「＋ 点图加钓点」，定位后在地图点一下，或去「渔获日志」记录时用 📍 标记，把常去的水域存起来。</div>";
    $("#spotCount").textContent = "";
    return;
  }
  $("#spotCount").textContent = "共 " + spots.length + " 个";
  el.innerHTML = spots.map(s => {
    const amap = "https://uri.amap.com/marker?position=" + amapPos(s.lat, s.lng) + "&name=" + encodeURIComponent(s.name);
    return "<div class=\"card spot\">"
      + "<div class=\"nm\">📍 " + esc(s.name) + "</div>"
      + "<div class=\"meta\">" + s.lat.toFixed(4) + "°N, " + s.lng.toFixed(4) + "°E</div>"
      + (s.note ? "<div class=\"nt\">" + esc(s.note) + "</div>" : "")
      + "<div class=\"row\">"
      + "<button data-view=\"" + s.lat + "," + s.lng + "\">在地图看</button>"
      + "<button class=\"ghost\" data-share=\"" + s.ts + "\">分享</button>"
      + "<a class=\"btn ghost\" style=\"text-decoration:none;display:inline-flex;align-items:center\" href=\"" + amap + "\" target=\"_blank\" rel=\"noopener\">高德打开</a>"
      + "<button class=\"del\" data-rm=\"" + s.ts + "\">删除</button>"
      + "</div></div>";
  }).join("");
  $$("#spotList [data-view]").forEach(b => b.onclick = () => {
    const c = b.dataset.view.split(",").map(Number); focusSpot(c[0], c[1]);
  });
  $$("#spotList [data-share]").forEach(b => b.onclick = () => {
    const s = spots.find(x => String(x.ts) === b.dataset.share);
    if (s) openShare(s);
  });
  $$("#spotList [data-rm]").forEach(b => b.onclick = () => {
    spots = spots.filter(s => String(s.ts) !== b.dataset.rm);
    saveSpots(); refreshMarkers(); renderSpots();
  });
}

function renderMapFallback(err){
  const el = $("#mapFallback"); if (!el) return;
  const all = allSpots();
  el.hidden = false;
  const mapEl = $("#map"); if (mapEl) mapEl.style.display = "none";
  let html = "<p style=\"margin:0 0 10px\"><b>地图组件需要联网加载</b>"
    + (err ? "（" + esc(String(err.message || err)) + "）" : "")
    + "。网络恢复后刷新即可显示交互地图；下面是已记录的钓点坐标，可复制或在高德中打开：</p>";
  html += all.length ? all.map(p => {
    const amap = "https://uri.amap.com/marker?position=" + amapPos(p.lat, p.lng) + "&name=" + encodeURIComponent(p.name);
    return "<div class=\"fb-spot\"><span>" + esc(p.name) + "<br><span class=\"meta\">" + p.lat.toFixed(4) + "°N, " + p.lng.toFixed(4) + "°E</span></span>"
      + "<a href=\"" + amap + "\" target=\"_blank\" rel=\"noopener\">高德打开 ↗</a></div>";
  }).join("") : "<p style=\"margin:0\">暂无带坐标的钓点。去「渔获日志」记录时用 📍 定位，或联网后添加。</p>";
  el.innerHTML = html;
}

/* ============================================================
   附近水域：河流 / 运河 / 水库 / 湖泊
   主源：高德 POI 自然地名（河流 190204 / 湖泊 190205，水库归湖泊类）——
         快、稳、中文地名全；GCJ-02 坐标进来先转回 WGS-84 存真值。
   兜底：OpenStreetMap（Overpass API，免密钥、允许跨域），高德失败时启用，
         多个镜像按「上次可用」优先并发竞速。
   ============================================================ */
const RKEY    = "fish.rivers.v1";     // 结果缓存：{ "纬度,经度,半径": {ts, list} }
const RKEY_EP = "fish.rivers.ep";     // 上次可用的镜像地址
const RIVER_EP = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const RIVER_TTL = 6 * 3600 * 1000;    // 同一位置 6 小时内不重复请求
const RIVER_MAX = 20;                 // 最多列出多少处
const AMAP_WATER_TYPES = "190204|190205";  // 高德自然地名：河流 | 湖泊（含水库）
let riverR = 3000, riverBusy = false, riverPts = [], riverLayer = null, lastGeo = null;
let riverSrc = "amap";                // 本次结果来源：amap | osm（渲染版权行/收藏备注用）

/* 标签 → 中文类型；返回空字符串表示不值得列入（排水沟、喷泉之类） */
function riverKind(t){
  const ww = t.waterway || "", w = t.water || "", nat = t.natural || "", lu = t.landuse || "";
  if (ww === "river" || w === "river") return "河流";
  if (ww === "canal" || w === "canal") return "运河";
  if (ww === "riverbank") return "河道";
  if (ww === "stream") return "溪流";
  if (w === "reservoir" || lu === "reservoir") return "水库";
  if (w === "lake" || t.natural === "water" && w === "lake") return "湖泊";
  if (w === "pond") return "池塘";
  if (w === "sea" || w === "ocean") return "海域";
  if (nat === "bay") return "海湾";
  if (nat === "strait") return "海峡";
  if (nat === "wetland") return "湿地";
  if (nat === "water") return "水域";
  if (lu === "basin") return "蓄水池";
  return "";
}

function riverQL(la, lo, r){
  const at = "(around:" + r + "," + la.toFixed(6) + "," + lo.toFixed(6) + ")";
  return "[out:json][timeout:25];("
    + "way" + at + '["waterway"~"^(river|canal|stream|riverbank)$"]["name"];'
    + "way" + at + '["natural"~"^(water|bay|strait|wetland)$"]["name"];'
    + "way" + at + '["landuse"~"^(reservoir|basin)$"]["name"];'
    + "relation" + at + '["natural"~"^(water|bay|wetland)$"]["name"];'
    + "relation" + at + '["waterway"="river"]["name"];'
    + ");out geom " + (RIVER_MAX * 2) + ";";
}

/* 球面距离（米） */
function distM(la1, lo1, la2, lo2){
  const R = 6371000, RAD = Math.PI / 180;
  const p1 = la1 * RAD, p2 = la2 * RAD;
  const dp = (la2 - la1) * RAD, dl = (lo2 - lo1) * RAD;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* 取离当前位置最近的一个点（way 用 geometry，relation 用成员 geometry，兜底用 center） */
function nearestPt(el, la, lo){
  let best = null, bd = Infinity;
  const scan = g => {
    if (!g) return;
    for (let i = 0; i < g.length; i++){
      const d = distM(la, lo, g[i].lat, g[i].lon);
      if (d < bd){ bd = d; best = {lat:g[i].lat, lng:g[i].lon}; }
    }
  };
  if (el.geometry) scan(el.geometry);
  if (el.members) for (let i = 0; i < el.members.length; i++) scan(el.members[i].geometry);
  if (!best && el.center){ best = {lat:el.center.lat, lng:el.center.lon}; bd = distM(la, lo, el.center.lat, el.center.lon); }
  return best ? {pt:best, d:bd} : null;
}

/* 高德水域查询（主源）：自然地名下的 河流(190204) / 湖泊(190205)。
   水库在高德也归「湖泊」类，按名字纠正回「水库」；渠系名字纠正为「运河」。
   翻两页（25×2）保证 20 km 档也够用；同一条河常按河段拆成多条 POI，按名字去重留最近。
   POI 坐标是 GCJ-02，统一转回 WGS-84 再进管线（与 Overpass 结果同构）。 */
async function fetchRiversAmap(la, lo, r){
  const g = wgs84ToGcj02(lo, la);
  const c = g.lng.toFixed(6) + "," + g.lat.toFixed(6);
  const pages = [1, 2].map(pg =>
    fetchT(AMAP_API + "?location=" + c + "&types=" + AMAP_WATER_TYPES
      + "&radius=" + Math.min(r, 50000) + "&offset=25&page=" + pg + "&output=json", 8000)
      .then(async res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (String(j.status) !== "1") throw new Error(j.info || "高德水域查询失败");
        return j.pois || [];
      })
  );
  const rs = await Promise.allSettled(pages);
  const ok = rs.filter(x => x.status === "fulfilled").map(x => x.value);
  if (!ok.length){
    const bad = rs.find(x => x.status === "rejected");
    throw (bad && bad.reason) || new Error("高德水域查询失败");
  }
  const seen = {}, out = [];
  ok.flat().forEach(p => {
    const loc = amapLoc(p.location);
    if (!isFinite(loc.lng) || !isFinite(loc.lat)) return;
    const nm = simp(String(p.name || "").replace(/\s+/g, " ").trim());
    if (!nm || nm.length > 30) return;
    const w = gcj02ToWgs84(loc.lng, loc.lat);
    let kind = String(p.typecode || "").indexOf("190205") === 0 ? "湖泊" : "河流";
    if (kind === "湖泊" && nm.indexOf("水库") > -1) kind = "水库";
    if (kind === "河流" && nm.indexOf("渠") > -1) kind = "运河";
    const d = distM(la, lo, w.lat, w.lng);
    if (d > r * 1.5) return;
    if (seen[nm] != null){
      const o = out[seen[nm]];
      if (d < o.d){ o.d = d; o.pt = w; }
      return;
    }
    seen[nm] = out.length;
    out.push({name:nm, kind:kind, d:d, pt:w});
  });
  if (!out.length) throw new Error("高德范围内没有水域数据");
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, RIVER_MAX);
}

/* 水域查询调度：高德优先（快、稳），Overpass 兜底。
   两个源都直接返回归一化列表（WGS-84 坐标）。 */
async function fetchRivers(la, lo, r){
  try{
    const list = await fetchRiversAmap(la, lo, r);
    riverSrc = "amap";
    return list;
  }catch(eAmap){ /* 高德失败，落到 Overpass */ }
  riverSrc = "osm";
  const q = riverQL(la, lo, r);
  const eps = RIVER_EP.slice();
  const last = store.get(RKEY_EP, "");
  const at = eps.indexOf(last);
  if (at > 0){ eps.splice(at, 1); eps.unshift(last); }
  const rs = await Promise.allSettled(eps.map(ep =>
    fetchT(ep + "?data=" + encodeURIComponent(q), 12000).then(async res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      if (!j || !j.elements) throw new Error("返回格式异常");
      return {ep:ep, j:j};
    })
  ));
  const hit = rs.find(x => x.status === "fulfilled" && x.value);
  if (hit){
    store.set(RKEY_EP, hit.value.ep);
    return riverList(hit.value.j.elements, la, lo, r);
  }
  const e = rs.find(x => x.status === "rejected");
  throw (e && e.reason) || new Error("接口不可用");
}

/* 归一化：去重、排序、截断 */
function riverList(els, la, lo, r){
  const seen = {}, out = [];
  (els || []).forEach(el => {
    const t = el.tags || {};
    const kind = riverKind(t);
    if (!kind) return;
    const nm = simp(String(t["name:zh"] || t.name || "").replace(/\s+/g, " ").trim());
    if (!nm || nm.length > 30) return;
    const nr = nearestPt(el, la, lo);
    if (!nr || nr.d > r * 1.5) return;
    const k = nm + "|" + kind;
    if (seen[k] != null){
      const o = out[seen[k]];
      if (nr.d < o.d){ o.d = nr.d; o.pt = nr.pt; }
      return;
    }
    seen[k] = out.length;
    out.push({name:nm, kind:kind, d:nr.d, pt:nr.pt});
  });
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, RIVER_MAX);
}

function fmtDist(m){ return m < 950 ? Math.max(10, Math.round(m / 10) * 10) + " m" : (m / 1000).toFixed(m < 9500 ? 1 : 0) + " km"; }

function riverEmpty(html){ return '<p class="empty">' + html + "</p>"; }

function renderRivers(list, r, err){
  const box = $("#riverBox"); if (!box) return;
  const cnt = $("#riverCount");
  const attr = $("#riverAttr");
  if (attr) attr.textContent = riverSrc === "amap"
    ? "水域数据 © 高德地图 · 距离为到该水域的直线距离，出钓前请自行确认该处是否允许垂钓"
    : "水域数据 © OpenStreetMap 贡献者（ODbL）· 距离为到水域边界最近点的直线距离，出钓前请自行确认该处是否允许垂钓";
  riverPts = list || [];
  if (err){
    if (cnt) cnt.textContent = "";
    const raw = String((err && err.message) || err);
    const msg = /abort|timeout/i.test(raw) ? "查询超时，服务端繁忙" : raw;
    box.innerHTML = riverEmpty("没取到数据（" + esc(msg) + "）。<br>大范围查询更容易超时，建议先用小半径（1–3 km）再逐步放大；也可以先用上方地图自己找水面。");
    drawRiverPts();
    return;
  }
  if (!list.length){
    if (cnt) cnt.textContent = "";
    box.innerHTML = riverEmpty(Math.round(r / 1000) + " km 范围内没有找到有名字的河湖水域。<br>把范围调大一档，或换个位置再查一次。");
    drawRiverPts();
    return;
  }
  if (cnt) cnt.textContent = "共 " + list.length + " 处";
  box.innerHTML = list.map((x, i) => {
    const amap = "https://uri.amap.com/marker?position=" + amapPos(x.pt.lat, x.pt.lng) + "&name=" + encodeURIComponent(x.name + "（" + x.kind + "）");
    const cls = x.kind === "水库" ? "b" : (x.kind === "湖泊" || x.kind === "池塘" ? "g" : (x.kind === "海域" || x.kind === "海湾" ? "w" : ""));
    const saved = spots.some(s => s.name === x.name && Math.abs(s.lat - x.pt.lat) < 1e-4);
    return '<div class="river">'
      + '<div class="ri-main">'
      + '<div class="ri-nm"><span class="nm-txt">' + esc(x.name) + "</span>"
      + '<span class="tag ' + cls + '">' + x.kind + "</span></div>"
      + '<div class="ri-meta">最近处直线约 ' + fmtDist(x.d) + " · " + x.pt.lat.toFixed(4) + "°N, " + x.pt.lng.toFixed(4) + "°E</div>"
      + "</div>"
      + '<div class="ri-act">'
      + '<button type="button" data-river-go="' + i + '">地图看</button>'
      + '<button type="button" data-river-fav="' + i + '"' + (saved ? ' class="on"' : "") + ">" + (saved ? "已收藏" : "收藏") + "</button>"
      + '<a href="' + amap + '" target="_blank" rel="noopener">高德</a>'
      + "</div></div>";
  }).join("");
  $$("#riverBox [data-river-go]").forEach(b => b.onclick = () => {
    const x = riverPts[+b.dataset.riverGo];
    if (!x) return;
    go("map");
    focusSpot(x.pt.lat, x.pt.lng);
  });
  $$("#riverBox [data-river-fav]").forEach(b => b.onclick = () => {
    const x = riverPts[+b.dataset.riverFav];
    if (!x) return;
    if (spots.some(s => s.name === x.name && Math.abs(s.lat - x.pt.lat) < 1e-4)) return;
    spots.push({name:x.name, lat:x.pt.lat, lng:x.pt.lng, note:"附近水域（" + x.kind + "，约 " + fmtDist(x.d) + "）· " + (riverSrc === "amap" ? "高德地图" : "OpenStreetMap"), ts:Date.now()});
    saveSpots(); refreshMarkers(); renderSpots();
    b.classList.add("on"); b.textContent = "已收藏";
  });
  drawRiverPts();
}

/* 把查到的水域点画到地图上（蓝色圆点，与钓点图钉区分） */
function drawRiverPts(){
  if (!map || typeof L === "undefined") return;
  if (riverLayer){ riverLayer.remove(); riverLayer = null; }
  if (!riverPts.length) return;
  riverLayer = L.layerGroup().addTo(map);
  riverPts.forEach(x => {
    /* 两个源进来都已是 WGS-84 真值，画到高德底图前统一转 GCJ-02 */
    L.circleMarker(mapLatLng(x.pt.lat, x.pt.lng), {radius:5, color:"#60a5fa", weight:2, fillColor:"#60a5fa", fillOpacity:.45})
      .addTo(riverLayer)
      .bindPopup("<b>" + esc(x.name) + '</b><div class="pop-row">' + x.kind + " · 最近处约 " + fmtDist(x.d) + "</div>");
  });
}

async function loadRivers(la, lo, r, force){
  const box = $("#riverBox"); if (!box) return;
  riverR = r;
  lastGeo = {la:la, lo:lo};
  const key = la.toFixed(3) + "," + lo.toFixed(3) + "," + r;
  const cache = store.get(RKEY, {});
  const hit = cache[key];
  if (!force && hit && (Date.now() - hit.ts) < RIVER_TTL){
    renderRivers(hit.list || [], r, null);
    return;
  }
  if (riverBusy) return;
  riverBusy = true;
  if ($("#riverCount")) $("#riverCount").textContent = "";
  box.innerHTML = riverEmpty('<span class="ri-busy"></span>正在查询 ' + Math.round(r / 1000) + " km 内的水域…");
  try{
    const list = await fetchRivers(la, lo, r);
    cache[key] = {ts:Date.now(), list:list};
    store.set(RKEY, cache);
    renderRivers(list, r, null);
  }catch(e){
    renderRivers([], r, e);
  }finally{ riverBusy = false; }
}

$("#riverLoad").onclick = () => {
  const box = $("#riverBox");
  if (!navigator.geolocation){ box.innerHTML = riverEmpty("当前环境不支持定位，无法查询附近水域。想按位置查，请在浏览器里允许定位后重试。"); return; }
  riverBusy = false;
  if ($("#riverCount")) $("#riverCount").textContent = "";
  box.innerHTML = riverEmpty('<span class="ri-busy"></span>正在定位…');
  navigator.geolocation.getCurrentPosition(pos => {
    loadRivers(pos.coords.latitude, pos.coords.longitude, riverR, true);
  }, err => {
    box.innerHTML = riverEmpty(locErrText(err));
  }, {timeout:9000, enableHighAccuracy:true});
};

$$("#riverRadius .seg-btn").forEach(b => b.onclick = () => {
  $$("#riverRadius .seg-btn").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  riverR = +b.dataset.r;
  if (lastGeo) loadRivers(lastGeo.la, lastGeo.lo, riverR, false);
});

/* ============================================================
   钓点咨询：高德 POI 搜附近收费钓场 / 野钓点 / 水库钓位
   复用出钓指数的「今天适钓指数」给每个钓点标注推荐度。
   数据来自高德开放平台（GCJ-02 坐标，与高德底图一致，无需转换）。
   ============================================================ */
let amapLayer = null, amapSpots = [], amapBusy = false;
const AMAP_KW  = ["钓场", "钓鱼", "路亚", "垂钓", "野钓", "水库"];
const AMAP_TTL = 6 * 3600 * 1000;
const AMAP_CACHE = "fish.amap.v1";

/* v3 REST 的 location 字段实测有三种形态："lng,lat" 字符串 / {lng,lat} 对象 / [] 空数组。
   统一解析；解析不出坐标的返回 NaN，由后续 isFinite 过滤丢弃。 */
function amapLoc(raw){
  if (typeof raw === "string" && raw.includes(",")){
    const p = raw.split(",");
    return {lng:+p[0], lat:+p[1]};
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)){
    return {lng:+raw.lng, lat:+raw.lat};
  }
  return {lng:NaN, lat:NaN};
}

/* 单关键词周边搜索：走本站 /api/amap 反代（key 由服务端注入）。
   必须 extensions=all：默认 base 模式下地铁站/公交站类 POI 的 location 是空数组。
   高德 v3 返回扁平结构：res.pois[]；address 可能是 []；biz_ext 带评分/人均/营业时间。 */
async function amapOne(kw, c, r){
  const u = AMAP_API + "?location=" + c.lng.toFixed(6) + "," + c.lat.toFixed(6)
          + "&radius=" + Math.round(r) + "&offset=25&page=1&extensions=all&output=json"
          + "&keywords=" + encodeURIComponent(kw);
  const res = await fetchT(u, 9000);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  if (String(j.status) !== "1") throw new Error(j.info || "高德接口返回异常");
  return (j.pois || []).map(po => {
    const loc = amapLoc(po.location), biz = po.biz_ext || {};
    return {name:String(po.name||"").trim(),
            addr:Array.isArray(po.address) ? "" : String(po.address||"").trim(),
            lng:loc.lng, lat:loc.lat, type:String(po.type||""),
            rating:String(biz.rating||"").trim(), cost:String(biz.cost||"").trim(),
            open:String(biz.opentime2||"").trim()};
  }).filter(x => x.name && isFinite(x.lng) && isFinite(x.lat));
}

/* 多关键词聚合 + 去重 + 距离 + 排序。
   任一关键词成功即用其结果；全部失败才把错误抛给上层展示。 */
async function searchAmap(la, lo, r){
  /* 高德周边搜索的 location 只认 GCJ-02，浏览器 GPS 是 WGS-84 → 先转换，
     否则会以偏了几百米的点为中心去搜 */
  const g = wgs84ToGcj02(lo, la);
  const c = {lat:g.lat, lng:g.lng};
  const rs = await Promise.allSettled(AMAP_KW.map(kw => amapOne(kw, c, r)));
  const ok = rs.filter(x => x.status === "fulfilled").map(x => x.value);
  if (!ok.length){
    const e = rs.find(x => x.status === "rejected");
    throw new Error((e && e.reason && e.reason.message) || "高德接口不可用");
  }
  const all = []; ok.forEach(list => all.push(...list));
  const seen = {}, out = [];
  all.forEach(x => {
    const d = distM(la, lo, x.lat, x.lng);
    if (d > r * 1.6) return;
    const k = x.name + "|" + x.lng.toFixed(4) + "," + x.lat.toFixed(4);
    if (seen[k] != null) return;
    seen[k] = out.length;
    const managed = /钓场|垂钓|俱乐部|农庄|渔庄|度假|农家/.test(x.name + x.type);
    out.push({name:x.name, addr:x.addr, lat:x.lat, lng:x.lng, type:x.type, d:d, managed:managed});
  });
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, 40);
}

function amapEmpty(html){ return '<p class="empty">' + html + "</p>"; }

/* 高德附带的经营信息：评分 / 人均 / 营业时间，有啥显示啥 */
function amapBiz(x){
  const cost = parseFloat(x.cost);
  return [x.rating && "⭐ " + x.rating,
          isFinite(cost) && cost > 0 && "人均 ¥" + Math.round(cost),
          x.open].filter(Boolean).join(" · ");
}

function renderAmap(list, r, err){
  const box = $("#amapBox"); if (!box) return;
  const cnt = $("#amapCount");
  amapSpots = list || [];
  if (err){
    if (cnt) cnt.textContent = "";
    box.innerHTML = amapEmpty("没取到数据（" + esc(String((err && err.message) || err)) + "）。<br>高德接口偶尔会限流，稍后再试；也可以先用上方地图自己找水面。");
    drawAmapPts();
    return;
  }
  if (!list.length){
    if (cnt) cnt.textContent = "";
    box.innerHTML = amapEmpty(Math.round(r/1000) + " km 范围内没找到带名字的钓场/野钓点。<br>把范围调大一档，或换个位置再查一次。");
    drawAmapPts();
    return;
  }
  const idx = currentScore();   // 区域适钓指数（今天），附近钓点共用
  if (cnt) cnt.textContent = "共 " + list.length + " 处 · 今日适钓 " + idx.score;
  const recN = Math.min(5, list.length);
  box.innerHTML = list.map((x, i) => {
    const rec = idx.score >= 68 && i < recN;
    const cls = x.managed ? "b" : "g";
    /* 高德返回的 POI 坐标本身就是 GCJ-02，此处**不要**再转 amapPos */
    const amap = "https://uri.amap.com/marker?position=" + x.lng.toFixed(6) + "," + x.lat.toFixed(6) + "&name=" + encodeURIComponent(x.name);
    return '<div class="river' + (rec ? " rec" : "") + '">'
      + '<div class="ri-main">'
      + '<div class="ri-nm"><span class="nm-txt">' + esc(x.name) + "</span>"
      + '<span class="tag ' + cls + '">' + (x.managed ? "钓场" : "野钓点") + "</span>"
      + (rec ? '<span class="tag good">推荐</span>' : "") + "</div>"
      + '<div class="ri-meta">' + (x.addr ? esc(x.addr) + " · " : "") + "约 " + fmtDist(x.d)
      + (amapBiz(x) ? " · " + esc(amapBiz(x)) : "") + "</div>"
      + "</div>"
      + '<div class="ri-act">'
      + '<button type="button" data-amap-go="' + i + '">地图看</button>'
      + '<a href="' + amap + '" target="_blank" rel="noopener">高德</a>'
      + "</div></div>";
  }).join("");
  $$("#amapBox [data-amap-go]").forEach(b => b.onclick = () => {
    const x = amapSpots[+b.dataset.amapGo];
    if (!x) return;
    go("map");
    focusSpot(x.lat, x.lng);
  });
  drawAmapPts();
}

/* 把钓点画到地图（橙色圆点，与水域蓝点、收藏图钉区分）；受 amapToggle 控制 */
function drawAmapPts(){
  if (amapLayer){ amapLayer.remove(); amapLayer = null; }
  if (!map || typeof L === "undefined" || !amapSpots.length) return;
  if ($("#amapToggle") && !$("#amapToggle").checked) return;
  amapLayer = L.layerGroup().addTo(map);
  amapSpots.forEach(x => {
    L.circleMarker([x.lat, x.lng], {radius:6, color:"#f59e0b", weight:2, fillColor:"#f59e0b", fillOpacity:.5})
      .addTo(amapLayer)
      .bindPopup("<b>" + esc(x.name) + '</b><div class="pop-row">' + (x.managed ? "收费/管理钓场" : "野钓点")
        + " · 约 " + fmtDist(x.d) + "</div>" + (x.addr ? '<div class="pop-row">' + esc(x.addr) + "</div>" : "")
        + (amapBiz(x) ? '<div class="pop-row">' + esc(amapBiz(x)) + "</div>" : ""));
  });
}
function toggleAmapLayer(on){
  if (!amapLayer || !map) return;
  if (on) amapLayer.addTo(map); else map.removeLayer(amapLayer);
}

async function loadAmapSpots(la, lo, r, force){
  const box = $("#amapBox"); if (!box) return;
  const key = la.toFixed(3) + "," + lo.toFixed(3) + "," + r;
  const cache = store.get(AMAP_CACHE, {});
  const hit = cache[key];
  if (!force && hit && (Date.now() - hit.ts) < AMAP_TTL){
    renderAmap(hit.list || [], r, null);
    return;
  }
  if (amapBusy) return;
  amapBusy = true;
  if ($("#amapCount")) $("#amapCount").textContent = "";
  box.innerHTML = amapEmpty('<span class="ri-busy"></span>正在查询 ' + Math.round(r/1000) + " km 内的钓场…");
  try{
    const list = await searchAmap(la, lo, r);
    cache[key] = {ts:Date.now(), list:list};
    store.set(AMAP_CACHE, cache);
    renderAmap(list, r, null);
  }catch(e){
    renderAmap([], r, e);
  }finally{ amapBusy = false; }
}

/* 按钮：用「我的位置」或地图中心查附近钓点，复用附近水域的半径 riverR */
$("#amapLoad").onclick = () => {
  ensureMap();
  const box = $("#amapBox"); if (!box) return;
  let la, lo;
  if (locBest){ la = locBest.la; lo = locBest.lo; }
  else if (map){ const c = map.getCenter(); la = c.lat; lo = c.lng; }
  else { box.innerHTML = amapEmpty("地图还没加载好，稍等一下再试。"); return; }
  loadAmapSpots(la, lo, riverR, true);
};

/* 图层开关 */
$("#amapToggle").onchange = e => { ensureMap(); toggleAmapLayer(e.target.checked); };

