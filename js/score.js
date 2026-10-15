/* 钓鱼指南 · 出钓指数 + 逆地理编码 + 天气 + 季节时段 */
/* ============================================================
   出钓指数
   ============================================================ */
const WNAME = {sunny:"晴", pcloudy:"多云", cloudy:"阴", drizzle:"小雨/阵雨", rain:"中雨", heavy:"大雨/暴雨", thunder:"雷雨", fog:"雾", snow:"雪"};
const DIRNAME = {ne:"东北风", e:"东风", n:"北风", se:"东南风", s:"南风", nw:"西北风", w:"西风", sw:"西南风", none:"静风"};
const TIMENAME = {dawn:"清晨", am:"上午", noon:"正午", pm:"下午", dusk:"傍晚", night:"夜间"};
const SEASONNAME = ["春","夏","秋","冬"];
const WTYPE = {pond:"池塘/黑坑", lake:"湖泊/水库", river:"河流/河道", wild:"野塘/野水库", sea:"海钓"};

/* 加权评分模型：每个因素先转成 0–1 的适宜度，再按权重加权平均。
   权重固定，分数分布合理，不会因为项项都"还行"就顶到满分。 */
const WEIGHTS = {pres:.22, temp:.18, weather:.16, wind:.14, season:.12, time:.10, dir:.08};
const RATING = {
  weather:{sunny:.62, pcloudy:.82, cloudy:.70, drizzle:.92, rain:.60, heavy:.18, thunder:0, fog:.45, snow:.35},
  wind:{"0":.55, "1":.88, "2":.95, "3":.88, "4":.45, "5":.28, "6":.08},
  dir:{ne:.82, e:.80, n:.72, none:.62, se:.55, s:.55, w:.45, nw:.42, sw:.28},
  time:{dawn:.95, dusk:.95, am:.72, night:.68, pm:.62, noon:.22},
  season:{fresh:[.82,.62,.92,.35], sea:[.60,.80,.88,.50]}
};

function tempScoreFor(t){
  if (t >= 15 && t <= 28) return .95;
  if ((t >= 11 && t < 15) || (t > 28 && t <= 31)) return .72;
  if ((t >= 6 && t < 11) || (t > 31 && t <= 34)) return .42;
  if (t >= 1 && t < 6) return .28;
  return .12;
}
function presScoreFor(p){
  if (p >= 1022) return .98;
  if (p >= 1013) return .88;
  if (p >= 1005) return .62;
  if (p >= 998) return .32;
  return .10;
}
/* 纯函数：给定一组出钓参数，返回 0–100 的适钓指数与硬止损标记。
   与 DOM 解耦，供地图「钓点推荐」复用（同一区域天气相同，指数共用）。 */
function calcScore(p){
  const r = {
    weather: RATING.weather[p.w],
    temp:    tempScoreFor(p.t),
    pres:    presScoreFor(p.p),
    wind:    RATING.wind[p.wi],
    dir:     RATING.dir[p.dr],
    time:    RATING.time[p.tm],
    season:  RATING.season[p.wt === "sea" ? "sea" : "fresh"][p.se]
  };
  let sum = 0;
  Object.keys(WEIGHTS).forEach(k => sum += WEIGHTS[k] * r[k]);
  const hardStop = (p.w === "thunder" || +p.wi >= 6);
  let score = Math.round(sum * 100);
  if (hardStop) score = Math.min(score, 22);
  return {score, hardStop, r};
}

/* 读取出钓指数面板的当前输入，供地图侧直接取「今天的区域适钓指数」 */
function currentScore(){
  return calcScore({
    w:  $("#i-weather").value,
    t:  +$("#i-temp").value || 0,
    p:  +$("#i-pres").value || 1010,
    wi: $("#i-wind").value,
    dr: $("#i-dir").value,
    tm: $("#i-time").value,
    se: +$("#i-season").value,
    wt: $("#i-wtype").value
  });
}

function compute(){
  const w  = $("#i-weather").value,
        t  = +$("#i-temp").value || 0,
        p  = +$("#i-pres").value || 1010,
        wi = $("#i-wind").value,
        dr = $("#i-dir").value,
        tm = $("#i-time").value,
        se = +$("#i-season").value,
        wt = $("#i-wtype").value;

  const {score, hardStop, r} = calcScore({w,t,p,wi,dr,tm,se,wt});

  const parts = [
    ["气压", r.pres], ["气温", r.temp], ["天气", r.weather], ["风力", r.wind],
    ["季节", r.season], ["时段", r.time], ["风向", r.dir]
  ];

  let lv, color, adv;
  if (hardStop){
    lv = "不建议出钓"; color = "var(--bad)";
    adv = w === "thunder"
      ? "雷雨天气严禁在水边停留，碳素竿举高等于给自己立了个避雷针，请立即收竿避险。"
      : "6 级及以上大风，抛竿困难、水面波浪大，鱼也被压得贴底不吃饵。";
  } else if (score >= 80){
    lv = "极佳 · 抓紧出钓"; color = "var(--good)";
    adv = "各项条件都落在黄金区间，鱼活性高、开口猛。选好钓位、快速打窝，今天很可能爆护。";
  } else if (score >= 68){
    lv = "良好 · 值得一去"; color = "var(--good)";
    adv = "条件不错，正常发挥应该有稳定收获。把精力放在找准水层与钓位上，别在位置上浪费时间。";
  } else if (score >= 55){
    lv = "一般 · 可以一试"; color = "var(--warn)";
    adv = "鱼情平平，需要用技巧弥补：延长打窝养窝时间、减小饵团、勤换钓位找鱼，不要死守一个点。";
  } else if (score >= 40){
    lv = "较差 · 收获有限"; color = "var(--warn)";
    adv = "天气条件对鱼不利，鱼口轻、开口时间短。建议改钓深水、缩短出钓时长，或者干脆改天。";
  } else {
    lv = "很差 · 建议改期"; color = "var(--bad)";
    adv = "多项条件同时不利，鱼基本处于停口状态。与其在岸边吹风，不如在家整理装备、准备饵料。";
  }

  $("#scoreN").textContent = score;
  $("#scoreN").style.color = color;
  $("#ring").style.strokeDashoffset = (351.9 * (1 - score / 100)).toFixed(1);
  $("#scoreLv").textContent = lv;
  $("#scoreLv").style.color = color;
  $("#scoreAdv").textContent = adv;

  $("#bars").innerHTML = parts.map(([nm, v]) => {
    const col = v >= .75 ? "var(--good)" : v >= .5 ? "var(--warn)" : "var(--bad)";
    return `<div class="bar"><div class="nm">${nm}</div>
      <div class="tr"><i style="width:${Math.max(3, Math.round(v * 100))}%;background:${col}"></i></div>
      <div class="sc" style="color:${col}">${Math.round(v * 100)}</div></div>`;
  }).join("");

  $("#planBox").innerHTML = planHtml({w,t,p,wi,dr,tm,se,wt,score});
}

function planHtml(o){
  const depth = {
    pond:  ["1.0–1.8m", "钓边钓浅，优先水草边、增氧机附近"],
    lake:  ["2–3m（夏） / 1–1.5m（春秋）", "找深浅交界、铧尖、库湾回水处"],
    river: ["1.5–3m", "钓缓流回水湾、桥墩下游、支流交汇口"],
    wild:  ["2–4m", "找水下沟坎、倒树、乱石，安静守钓"],
    sea:   ["看目标鱼与潮水", "跟潮找流，钓白沫带、礁石边缘、防波堤转角"]
  }[o.wt];

  const baitTip = [
    "低温期主用红虫、蚯蚓等活饵，或浓腥商品饵，饵团要小。",
    "水温适中，腥香兼顾即可，可按当天鱼口做微调。",
    "高温期用清淡本味、藻腥饵，搓大饵减少雾化避开小杂鱼。",
    "初冬与深冬只钓鲫鱼，浓腥 + 红虫，小钩细线，饵团黄豆大小。"
  ][o.se];

  const timeTip = {
    dawn: "清晨是全天第一个觅食高峰，务必在天亮前到位、提前打窝。",
    am:   "上午鱼口逐渐减弱，可适当钓深一档、放慢节奏。",
    noon: "正午鱼下潜或上浮，此时应钓深、钓阴凉，或干脆休息养窝。",
    pm:   "下午 15 点后鱼口开始转好，是准备迎接傍晚高峰的时段。",
    dusk: "傍晚是全天第二个高峰，天黑前 1–2 小时是黄金窗口，别提前收竿。",
    night:"夜间大鱼靠岸，用腥饵守底、保持安静，别用强光扫水面。"
  }[o.tm];

  const pressureTip = o.p < 1000
    ? "气压偏低，水溶氧不足，鱼大概率浮头、不下底。建议改钓半水或浅水的阴凉处，或改期。"
    : o.p >= 1015 ? "气压理想，水溶氧充足，鱼的活跃度与开口意愿都处在好状态。" : "气压中等，鱼情一般，靠钓位和饵料来补。";

  const windTip = (o.wi <= 1)
    ? "风小水面平静，鱼警惕性相对高，抛竿要轻、走动要少。"
    : (o.wi <= 3 ? "微风正好，迎风岸往往聚鱼，可以尝试钓下风口。" : "风偏大，抛竿与看漂都受影响，建议改用重铅大漂或找背风处。");

  const targets = (o.se === 3)
    ? ["鲫鱼"]
    : (o.se === 1 ? ["草鱼", "鲢鳙", "翘嘴", "黑鱼", "罗非鱼"] : ["鲫鱼", "鲤鱼", "鳊鱼", "翘嘴", "鲈鱼（加州鲈）"]);

  return `
    <div class="hr"></div>
    <div class="grid g2">
      <div>
        <b style="font-size:14px">钓层与钓位</b>
        <p class="small muted mt">水深参考 <b style="color:#c4b5fd">${depth[0]}</b>　|　${depth[1]}</p>
      </div>
      <div>
        <b style="font-size:14px">饵料方向</b>
        <p class="small muted mt">${baitTip}</p>
      </div>
      <div>
        <b style="font-size:14px">时段策略</b>
        <p class="small muted mt">${timeTip}</p>
      </div>
      <div>
        <b style="font-size:14px">气压解读</b>
        <p class="small muted mt">${pressureTip}</p>
      </div>
      <div>
        <b style="font-size:14px">风力应对</b>
        <p class="small muted mt">${windTip}</p>
      </div>
      <div>
        <b style="font-size:14px">建议目标鱼</b>
        <p class="mt" style="display:flex;gap:6px;flex-wrap:wrap">${targets.map(x=>`<span class="tag g">${x}</span>`).join("")}</p>
      </div>
    </div>
    <p class="small muted mt2">当前条件：${WNAME[o.w]} · ${o.t}℃ · ${o.p} hPa · ${o.wi} 级 ${DIRNAME[o.dr]} · ${TIMENAME[o.tm]} · ${SEASONNAME[o.se]}季 · ${WTYPE[o.wt]}</p>
  `;
}

["i-temp","i-pres"].forEach(id => {
  const el = $("#" + id);
  el.addEventListener("input", () => {
    if (id === "i-temp") $("#tempOut").textContent = el.value + " ℃";
    else $("#presOut").textContent = el.value + " hPa";
  });
});
$("#calcBtn").onclick = compute;
$("#resetBtn").onclick = () => {
  $("#i-weather").value = "cloudy"; $("#i-temp").value = 22; $("#i-pres").value = 1012;
  $("#i-wind").value = "2"; $("#i-dir").value = "none";
  $("#i-wtype").value = "lake";
  $("#tempOut").textContent = "22 ℃"; $("#presOut").textContent = "1012 hPa";
  applySeasonTime();          // 季节 / 时段重置为「当前」，而不是写死的春·下午
  compute();
};

/* ---- 逆地理编码：把经纬度翻译成「xx 省 xx 市 xx 区 · xx 路」 ---- */
const GEO_HARD  = 6000;   // 整轮解析等待上限
const GEO_GRACE = 800;    // 已拿到路名后，再等一会儿让行政区划更全的数据源落地
const ROAD_WAIT = 2500;   // 只拿到行政区划时，最多再等多久看有没有路名
async function fetchT(url, ms, headers){
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try{ return await fetch(url, {signal: ctl.signal, headers}); }
  finally{ clearTimeout(timer); }
}

/* 兜底源：Photon（OSM 数据、响应快，能到门牌号与附近地标）
   主源已换成高德 geoAmap，这里只在高德不可用时才走（见 revGeo）。
   注意：Photon 没有语言参数（官方 lang 只支持 de/en/fr/it，没有中文），
   它是**按请求头 Accept-Language 决定返回哪套名字**的。移动端 WebView 常发 en-US，
   同样的坐标就会变成「Minguang Road / Shaanxi Province / Xi'an」——所以必须显式要中文。
   该头属于 CORS 安全列表头，跨域可直接设、不会触发预检。 */
async function geoPhoton(la, lo){
  const r = await fetchT(`https://photon.komoot.io/reverse?lon=${lo}&lat=${la}`, GEO_HARD,
                         {"Accept-Language": "zh-CN,zh;q=0.9"});
  if (!r.ok) throw new Error("HTTP " + r.status);
  const p = ((((await r.json()) || {}).features || [])[0] || {}).properties || {};
  const nm = norm(p.name || "");
  /* Photon 有时把路填在 name 而不是 street（如「西藏南路」），这类要认成路名 */
  const street = norm(p.street || "") || (/路$|街$|大街$|大道$/.test(nm) ? nm : "");
  const no = norm(p.housenumber || "");
  return {
    admin: admClean([p.state, p.city || p.county, p.district || p.locality, p.suburb]),
    road: street ? street + (no ? no + "号" : "") : "",
    poi: nm && nm !== street && nm.length <= 18 ? nm : "",
    src: "OpenStreetMap"
  };
}
/* （已移除）Nominatim 与 BigDataCloud 两个源：
   Nominatim 国内常不可达（12s 超时），BigDataCloud 返回繁体需二次转换。
   主源换成高德后它们已无存在价值，这里只留 Photon 一个 OSM 兜底。 */

/* ============================================================
   逆地理编码：坐标 → 中文地址
   主力走高德（本站 /api/regeo 反代）：毫秒级、中文权威、能精确到门牌号，
   还带附近道路与 POI。以前的三源竞速（Photon/Nominatim/BigDataCloud）
   不但慢，还有英文/繁体/国内不可达等一堆坑，这里一并去掉。
   ⚠️ 高德只认 GCJ-02，浏览器 GPS 是 WGS-84 —— 必须先 amapPos() 转换，
      否则解析出的地址会偏几百米。
   高德不可用时退回 Photon（OSM，1–2s）保底；Photon 本身要 WGS-84，不转换。
   ============================================================ */
async function geoAmap(la, lo){
  const r = await fetchT("api/regeo?location=" + amapPos(la, lo)
            + "&extensions=all&radius=1000&output=json", 8000);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (String(j.status) !== "1") throw new Error(j.info || "高德逆地理失败");
  const rc = j.regeocode || {}, ac = rc.addressComponent || {}, sn = ac.streetNumber || {};
  const region = [ac.province, ac.city, ac.district, ac.township].filter(Boolean).join("");
  let road = "";
  if (sn.street && sn.number) road = sn.street + sn.number;
  else if (sn.street) road = sn.street;
  else if ((rc.roads || []).length) road = (rc.roads[0] || {}).name || "";
  const pois = rc.pois || [];
  return {region:region, road:road, poi:pois.length ? String((pois[0] || {}).name || "") : "",
          src:"高德地图", hasRoad:!!road};
}

/* Photon 兜底：返回结构是 {admin, road, poi, src}，统一成与高德一致的字段 */
async function geoOsm(la, lo){
  const v = await geoPhoton(la, lo);
  return {region:fixAdmin(v.admin || []).join(""), road:v.road || "",
          poi:v.poi || "", src:v.src || "OpenStreetMap", hasRoad:!!v.road};
}

async function revGeo(la, lo){
  try{ return await geoAmap(la, lo); }catch(e){}
  try{ return await geoOsm(la, lo); }catch(e){}
  return null;
}

/* 渲染定位结果 */
function geoHtml(la, lo, g, wOk){
  const region = g ? g.region : "", road = g ? g.road : "", poi = g ? g.poi : "";
  const label = [region, road].filter(Boolean).join(" · ");
  const coord = `${la.toFixed(4)}°N, ${lo.toFixed(4)}°E`;
  /* la/lo 是浏览器给的 WGS-84，uri.amap.com 要 GCJ-02，直接拼会偏几百米 */
  const map = `https://uri.amap.com/marker?position=${amapPos(la, lo)}`
            + (label ? "&name=" + encodeURIComponent(label) : "");
  let sub = wOk ? "已填入实时天气，如有偏差可手动修正。" : "位置已定位，但天气接口不可用，请手动填写参数。";
  if (g && g.src) sub += g.hasRoad ? `（路名来源 ${g.src}）` : `（行政区划来源 ${g.src}）`;
  if (g && region && !road) sub += " 未取到具体路段，可手动补充。";
  return `<span class="geo-line"><span class="geo-pin">📍</span>`
       + (label ? `<b class="geo-place">${esc(label)}</b>` : `<b class="geo-place plain">已定位，未解析出具体地址</b>`)
       + (poi ? `<span class="geo-poi">${esc(poi)}</span>` : "")
       + `<a class="geo-map" href="${map}" target="_blank" rel="noopener">地图</a>`
       + `<span class="geo-coord">${coord}</span></span>`
       + `<span class="geo-sub">${esc(sub)}</span>`;
}

/* 自动取天气 */
$("#geoBtn").onclick = () => {
  const msg = $("#geoMsg");
  if (!navigator.geolocation){ msg.textContent = "当前环境不支持定位，请手动填写。"; return; }
  msg.textContent = "正在定位…";
  navigator.geolocation.getCurrentPosition(async pos => {
    const {latitude:la, longitude:lo} = pos.coords;
    msg.textContent = "已定位，正在解析位置与天气…";
    let geo = null, wOk = false;
    const weather = fetchT(weatherUrl(la, lo), 9000)
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(j => { applyWeather(j.current); renderHourly(j); wOk = true; });
    await Promise.allSettled([revGeo(la, lo).then(g => { geo = g; }), weather]);
    if (!geo && !wOk){ msg.textContent = "定位成功，但网络接口不可用，请手动填写。"; return; }
    msg.innerHTML = geoHtml(la, lo, geo, wOk);
  }, err => {
    msg.textContent = locErrText(err);
  }, {timeout:8000, enableHighAccuracy:true});
};

/* 天气编码 → 面板用的天气键（applyWeather 与逐时评分共用） */
function wxCodeToKey(code){
  if (code === 0 || code === 1) return "sunny";
  if (code === 2) return "pcloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51,53,55,61,80].includes(code)) return "drizzle";
  if ([63,81].includes(code)) return "rain";
  if ([65,82].includes(code)) return "heavy";
  if ([95,96,99].includes(code)) return "thunder";
  if ([71,73,75,77,85,86].includes(code)) return "snow";
  return "cloudy";
}
/* km/h → 蒲福风级（0–6，与 RATING.wind 的键一致） */
function kmhToLevel(kmh){
  return kmh < 1 ? 0 : kmh < 6 ? 1 : kmh < 12 ? 2 : kmh < 20 ? 3 : kmh < 29 ? 4 : kmh < 39 ? 5 : 6;
}
/* 风向度数 → 方位键 */
function degToDirKey(d){
  const dirs = ["n","ne","e","se","s","sw","w","nw"];
  return dirs[Math.round(d / 45) % 8];
}
/* 小时 → 时段键（与 applySeasonTime 同一套口径） */
function timeSlotForHour(h){
  return h < 8 ? "dawn" : h < 11 ? "am" : h < 14 ? "noon" : h < 17 ? "pm" : h < 20 ? "dusk" : "night";
}

function applyWeather(c){
  if (!c) return;
  $("#i-weather").value = wxCodeToKey(c.weather_code);
  if (typeof c.temperature_2m === "number"){
    $("#i-temp").value = Math.round(c.temperature_2m);
    $("#tempOut").textContent = Math.round(c.temperature_2m) + " ℃";
  }
  /* 必须用海平面气压 pressure_msl，不能用 surface_pressure：
     后者是「站点实测气压」，西安海拔约 400 m 时只有 960 多 hPa，
     会被评分表判成最低档（<998 → 0.10），气压项就永远是最差。 */
  const pRaw = typeof c.pressure_msl === "number" ? c.pressure_msl : c.surface_pressure;
  if (typeof pRaw === "number"){
    const p = Math.round(pRaw);
    $("#i-pres").value = p; $("#presOut").textContent = p + " hPa";
  }
  if (typeof c.wind_speed_10m === "number"){
    $("#i-wind").value = String(kmhToLevel(c.wind_speed_10m));
  }
  if (typeof c.wind_direction_10m === "number"){
    $("#i-dir").value = degToDirKey(c.wind_direction_10m);
  }
  // 季节 / 时段：按当前时间自动判断（与定位无关，进页面即可填好）
  applySeasonTime();
  compute();
}

/* ============================================================
   逐时适钓：用 Open-Meteo 的逐小时预报跑同一套 calcScore，
   回答「几点出门、几点收竿」；顺带把气压走势画出来。
   ============================================================ */
function scoreColor(s){ return s >= 75 ? "#34d399" : s >= 60 ? "#60a5fa" : s >= 45 ? "#fbbf24" : "#f87171"; }

/* 在 hourly 数组里定位「当前小时」的下标；找不到就取最接近的一个 */
function nowIdx(times){
  const pad = n => String(n).padStart(2, "0");
  const d = new Date();
  const key = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours());
  let i = times.findIndex(t => t.startsWith(key));
  if (i < 0) i = Math.max(0, times.findIndex(t => new Date(t) > d));
  return i < 0 ? 0 : i;
}

function renderHourly(j){
  const card = $("#hourCard"); if (!card) return;
  const h = j && j.hourly;
  if (!h || !h.time || !h.time.length){ card.hidden = true; return; }
  const times = h.time, n = times.length;
  const i0 = nowIdx(times);
  const se = +$("#i-season").value, wt = $("#i-wtype").value;
  /* 只画未来 24 小时：柱=适钓指数，紫线=同一窗口的气压 */
  const cnt = Math.min(24, n - i0);
  if (cnt < 2){ card.hidden = true; return; }
  const rows = [];
  for (let k = 0; k < cnt; k++){
    const i = i0 + k;
    const hr = new Date(times[i]).getHours();
    const cur = {
      w:  wxCodeToKey(h.weather_code ? h.weather_code[i] : 3),
      t:  Math.round(h.temperature_2m ? h.temperature_2m[i] : 0),
      p:  Math.round(h.pressure_msl ? h.pressure_msl[i] : 1010),
      wi: String(kmhToLevel(h.wind_speed_10m ? h.wind_speed_10m[i] : 0)),
      dr: degToDirKey(h.wind_direction_10m ? h.wind_direction_10m[i] : 0),
      tm: timeSlotForHour(hr),
      se: se, wt: wt
    };
    const s = calcScore(cur);
    rows.push({hr:hr, score:s.score, hard:s.hardStop, pres:cur.p, t:cur.t, cur:cur, label:times[i].slice(11, 16)});
  }
  /* 柱高 */
  $("#hcBars").innerHTML = rows.map((r, k) =>
    '<div class="hc-b" data-h="' + k + '" title="' + r.label + ' · ' + r.score + ' 分 · ' + r.pres + ' hPa">'
    + '<div class="hc-bar" style="height:' + Math.max(4, r.score) + '%;background:' + scoreColor(r.score) + '"></div></div>'
  ).join("") + '<div class="hc-now" style="left:0"></div>';
  /* 气压曲线（同一 24 小时窗口，压到 240×100 的 viewBox 里） */
  const ps = rows.map(r => r.pres), pMin = Math.min.apply(null, ps), pMax = Math.max.apply(null, ps);
  const span = Math.max(1, pMax - pMin);
  const pts = rows.map((r, k) => (cnt === 1 ? 0 : k / (cnt - 1) * 240).toFixed(2)
    + "," + (96 - (r.pres - pMin) / span * 82).toFixed(2)).join(" ");
  $("#hcLine").innerHTML = '<polyline points="' + pts + '" fill="none" stroke="#c4b5fd" stroke-width="1.6" '
    + 'vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
  /* 时间轴：每 4 小时标一个 */
  $("#hcAxis").innerHTML = rows.map((r, k) =>
    '<div class="hc-t">' + (k % 4 === 0 ? String(r.hr).padStart(2, "0") : "") + "</div>").join("");
  /* 最佳时段：3 小时滑动窗口取均分最高的一段 */
  let bi = 0, bAvg = -1;
  for (let k = 0; k + 3 <= rows.length; k++){
    const avg = (rows[k].score + rows[k + 1].score + rows[k + 2].score) / 3;
    if (avg > bAvg){ bAvg = avg; bi = k; }
  }
  const best = rows.slice(bi, bi + 3);
  const hhmm = r => String(r.hr).padStart(2, "0") + ":00";
  $("#hourSum").textContent = "最佳 " + hhmm(best[0]) + "–" + hhmm(best[best.length - 1]) + "（均 " + Math.round(bAvg) + " 分）";
  /* 气压走势：需要过去 12 小时，所以单独从数组里取 */
  const pNow = rows[0].pres;
  const pAgo = h.pressure_msl ? h.pressure_msl[Math.max(0, i0 - 12)] : pNow;
  const d12 = Math.round(pNow - pAgo);
  let pv, pc;
  if (d12 >= 3){ pv = "回升中"; pc = "#34d399"; }
  else if (d12 >= 1){ pv = "小幅回升"; pc = "#34d399"; }
  else if (d12 <= -5){ pv = "骤降"; pc = "#f87171"; }
  else if (d12 <= -1.5){ pv = "下降中"; pc = "#f87171"; }
  else { pv = "平稳"; pc = "#fbbf24"; }
  const warn = d12 <= -5 ? "12 小时内降了 " + Math.abs(d12) + " hPa，鱼大概率上浮停口，建议改期或钓半水/浅水阴凉处。" : "";
  $("#hcNote").innerHTML =
    '<span class="hc-n-l">气压</span><b style="color:' + pc + '">' + pv + '</b>'
    + '（12h <b>' + (d12 >= 0 ? "+" : "") + d12 + '</b> hPa，当前 ' + pNow + ' hPa，'
    + '今日区间 ' + Math.round(pMin) + "–" + Math.round(pMax) + "）"
    + (warn ? '<span class="hc-warn">⚠ ' + esc(warn) + "</span>" : "")
    + '<span class="hc-n-l">气温</span>今日 ' + Math.min.apply(null, rows.map(r => r.t)) + "–"
    + Math.max.apply(null, rows.map(r => r.t)) + " ℃";
  card.hidden = false;
  /* 点柱子：把该小时的参数填回上方面板，方便「按这个点的情况」细算 */
  $$("#hcBars .hc-b").forEach(el => el.onclick = () => {
    const r = rows[+el.dataset.h]; if (!r) return;
    $("#i-weather").value = r.cur.w; $("#i-temp").value = r.t; $("#tempOut").textContent = r.t + " ℃";
    $("#i-pres").value = r.pres; $("#presOut").textContent = r.pres + " hPa";
    $("#i-wind").value = r.cur.wi; $("#i-dir").value = r.cur.dr; $("#i-time").value = r.cur.tm;
    compute();
    $("#hcBars").querySelectorAll(".hc-b.on").forEach(x => x.classList.remove("on"));
    el.classList.add("on");
  });
}

/* 取天气：一次请求同时拿 current 与 hourly（含过去 1 天，用于算气压走势） */
function weatherUrl(la, lo){
  return "https://api.open-meteo.com/v1/forecast?latitude=" + la.toFixed(3)
    + "&longitude=" + lo.toFixed(3)
    + "&current=temperature_2m,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code"
    + "&hourly=temperature_2m,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code"
    + "&past_days=1&forecast_days=2&timezone=auto";
}

/* 当前季节（按公历月份）：3–5 春 / 6–8 夏 / 9–11 秋 / 12–2 冬。
   饵料筛选、出钓指数的季节下拉都从这里取，别再各自写一遍月份判断 */
function curSeasonKey(){
  const m = new Date().getMonth() + 1;
  return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
}

/* 季节、时段随时钟推断——不需要定位就能算，页面初始化与重置都用它 */
function applySeasonTime(){
  const h = new Date().getHours();
  $("#i-season").value = String({spring:0, summer:1, autumn:2, winter:3}[curSeasonKey()]);
  $("#i-time").value = h < 8 ? "dawn" : h < 11 ? "am" : h < 14 ? "noon" : h < 17 ? "pm" : h < 20 ? "dusk" : "night";
}

