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
function compute(){
  const w  = $("#i-weather").value,
        t  = +$("#i-temp").value || 0,
        p  = +$("#i-pres").value || 1010,
        wi = $("#i-wind").value,
        dr = $("#i-dir").value,
        tm = $("#i-time").value,
        se = +$("#i-season").value,
        wt = $("#i-wtype").value;

  const r = {
    weather: RATING.weather[w],
    temp:    tempScoreFor(t),
    pres:    presScoreFor(p),
    wind:    RATING.wind[wi],
    dir:     RATING.dir[dr],
    time:    RATING.time[tm],
    season:  RATING.season[wt === "sea" ? "sea" : "fresh"][se]
  };

  let sum = 0;
  Object.keys(WEIGHTS).forEach(k => sum += WEIGHTS[k] * r[k]);

  const hardStop = (w === "thunder" || +wi >= 6);
  let score = Math.round(sum * 100);
  if (hardStop) score = Math.min(score, 22);

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

/* 源 1：Photon（OSM 数据、响应快，能到门牌号与附近地标）
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
/* 源 2：Nominatim（同为 OSM，字段最标准；部分网络下不可达，仅作兜底） */
async function geoNomi(la, lo){
  const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${lo}&zoom=18&addressdetails=1&accept-language=zh-CN`;
  const r = await fetchT(u, 4000, {"Accept":"application/json", "Accept-Language":"zh-CN,zh;q=0.9"});
  if (!r.ok) throw new Error("HTTP " + r.status);
  const a = ((await r.json()) || {}).address || {};
  const road = a.road || a.pedestrian || a.footway || a.cycleway || a.path || a.highway || "";
  const no = a.house_number || "";
  return {
    admin: admClean([a.state || a.province, a.city || a.town || a.county,
                     a.city_district || a.district || a.suburb || a.township,
                     a.quarter || a.neighbourhood]),
    road: road ? norm(road) + (no ? norm(no) + "号" : "") : "",
    poi: norm(a.amenity || a.shop || a.building || a.tourism || ""),
    src: "OpenStreetMap"
  };
}
/* 源 3：BigDataCloud —— 行政区划最全（能到街道），用来补齐省市区 */
async function geoBdc(la, lo){
  const u = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=zh`;
  const r = await fetchT(u, GEO_HARD);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = (await r.json()) || {};
  const li = j.localityInfo || {};
  const chain = (li.administrative || []).length
    ? (li.administrative || []).map(x => x.name)
    : [j.principalSubdivision, j.city, j.locality];
  /* 只有描述恰为 road / street / highway 的条目才算路名，避免把长文本误判成路 */
  const inf = li.informative || [];
  const hit = inf.find(x => /^(road|street|highway|avenue)$/i.test(String(x.description || "").trim()))
           || inf.find(x => String(x.description || "").trim().length <= 12 && /路$|街$|大道$/.test(String(x.name || "")));
  return { admin: admClean(chain), road: hit ? norm(hit.name) : "", poi: "", src: "BigDataCloud" };
}

/* 只要拿到路名、或已能拼出「省+市」，就不必再等慢数据源 */
const geoUsable = v => !!v.road || (v.admin && v.admin.length >= 2);
/* 结果里有没有中日韩汉字。用来判断"这条是不是本地语结果"——外文名在中文页面上就是残次品 */
const hasCJK = s => /[\u3400-\u9FFF]/.test(String(s || ""));

/* 三源并发：行政区划取最全的一条，路名按数据源优先级取第一个命中的。
   但两条都加了一层「中文优先」：移动端 Photon 有可能整条返回英文，
   不能让外文名压过 Nominatim（显式 accept-language=zh-CN）和 BigDataCloud（localityLanguage=zh）。 */
async function revGeo(la, lo){
  const jobs = [geoPhoton(la, lo), geoNomi(la, lo), geoBdc(la, lo)];   // 数组顺序即优先级
  const slots = new Array(jobs.length).fill(null);
  await new Promise(done => {
    let open = jobs.length, grace = 0, roadWait = 0, finished = false;
    const finish = () => { if (finished) return; finished = true; clearTimeout(hard); clearTimeout(grace); clearTimeout(roadWait); done(); };
    const hard = setTimeout(finish, GEO_HARD);
    jobs.forEach((p, i) => {
      const settle = () => { if (--open === 0) finish(); };
      Promise.resolve(p).then(v => {
        try{
          if (v){
            slots[i] = v;
            /* 只把**中文**路名算作"齐了"。外文路名（Photon 在 en 环境下的返回）不算，
               于是下面走 roadWait 分支再多等一会儿，给中文源留出落地时间。 */
            const hasRoad = slots.some(x => x && x.road && hasCJK(x.road));
            /* 有路名 → 稍等收尾；只有行政区划 → 再多等一会儿路名，别抢跑 */
            if (hasRoad && !grace) grace = setTimeout(finish, GEO_GRACE);
            else if (geoUsable(v) && !roadWait) roadWait = setTimeout(finish, ROAD_WAIT);
          }
        }catch(e){}
        settle();
      }, settle);
    });
  });
  const got = slots.filter(Boolean);
  if (!got.length) return null;
  const cjkAdm = got.filter(x => hasCJK(x.admin.join("")));                     // 中文行政区划优先
  const who = (cjkAdm.length ? cjkAdm : got).slice()
                .sort((a, b) => b.admin.length - a.admin.length)[0];            // 同级里再比谁更全
  const rd  = slots.find(x => x && x.road && hasCJK(x.road))                    // 中文路名优先
           || slots.find(x => x && x.road) || null;                            // 实在没有才退回外文
  const adm = fixAdmin(who.admin);
  return {
    /* 中文直接连写（陕西省西安市经开区）；万一整条都是外文，改用空格隔开，
       否则会粘成「Shaanxi ProvinceXi'anJingkai」这种读都读不动的东西 */
    region: hasCJK(adm.join("")) ? adm.join("") : adm.join(" "),
    road: rd ? rd.road : "",
    poi: (rd && rd.poi) || (got.find(x => x.poi) || {}).poi || "",
    src: rd ? rd.src : who.src,
    hasRoad: !!rd
  };
}

/* 渲染定位结果 */
function geoHtml(la, lo, g, wOk){
  const region = g ? g.region : "", road = g ? g.road : "", poi = g ? g.poi : "";
  const label = [region, road].filter(Boolean).join(" · ");
  const coord = `${la.toFixed(4)}°N, ${lo.toFixed(4)}°E`;
  const map = `https://uri.amap.com/marker?position=${lo.toFixed(6)},${la.toFixed(6)}`
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
    const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${la.toFixed(3)}&longitude=${lo.toFixed(3)}&current=temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m,weather_code`;
    const weather = fetchT(wUrl, 9000)
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(j => { applyWeather(j.current); wOk = true; });
    await Promise.allSettled([revGeo(la, lo).then(g => { geo = g; }), weather]);
    if (!geo && !wOk){ msg.textContent = "定位成功，但网络接口不可用，请手动填写。"; return; }
    msg.innerHTML = geoHtml(la, lo, geo, wOk);
  }, err => {
    msg.textContent = locErrText(err);
  }, {timeout:8000, enableHighAccuracy:true});
};

function applyWeather(c){
  if (!c) return;
  const code = c.weather_code;
  let w = "cloudy";
  if (code === 0 || code === 1) w = "sunny";
  else if (code === 2) w = "pcloudy";
  else if (code === 3) w = "cloudy";
  else if (code === 45 || code === 48) w = "fog";
  else if ([51,53,55,61,80].includes(code)) w = "drizzle";
  else if ([63,81].includes(code)) w = "rain";
  else if ([65,82].includes(code)) w = "heavy";
  else if ([95,96,99].includes(code)) w = "thunder";
  else if ([71,73,75,77,85,86].includes(code)) w = "snow";
  $("#i-weather").value = w;

  if (typeof c.temperature_2m === "number"){
    $("#i-temp").value = Math.round(c.temperature_2m);
    $("#tempOut").textContent = Math.round(c.temperature_2m) + " ℃";
  }
  if (typeof c.surface_pressure === "number"){
    const p = Math.round(c.surface_pressure);
    $("#i-pres").value = p; $("#presOut").textContent = p + " hPa";
  }
  if (typeof c.wind_speed_10m === "number"){
    const kmh = c.wind_speed_10m;
    const lv = kmh < 1 ? 0 : kmh < 6 ? 1 : kmh < 12 ? 2 : kmh < 20 ? 3 : kmh < 29 ? 4 : kmh < 39 ? 5 : 6;
    $("#i-wind").value = String(lv);
  }
  if (typeof c.wind_direction_10m === "number"){
    const d = c.wind_direction_10m, dirs = ["n","ne","e","se","s","sw","w","nw"];
    $("#i-dir").value = dirs[Math.round(d / 45) % 8];
  }
  // 季节 / 时段：按当前时间自动判断（与定位无关，进页面即可填好）
  applySeasonTime();
  compute();
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

