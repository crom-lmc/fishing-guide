# 钓鱼指南 · 从入门到上鱼

**零构建、纯前端**的钓鱼助手 Web App。所有数据存在浏览器 `localStorage`，无需后端、无需注册，打开即用。

地图、定位、水域、钓点搜索、路径规划全部接入**高德地图**；天气接入 **Open-Meteo**；拍照识别接入**视觉大模型**。所有第三方 API Key 都由服务端（nginx）注入，前端源码**不含任何明文密钥**。

在线站点：https://120.53.9.119/

---

## ✨ 功能模块

底部 8 个标签切换：

| 模块 | 说明 |
| --- | --- |
| **出钓指数** | 综合气压、温度、天气、风况、季节、时段给出 0–100 分；支持**逐时适钓 24h 条带图**与**气压趋势曲线** |
| **渔获日志** | 记录鱼种、尾数、最大单尾、重量、钓点、饵料、备注，支持**拍照上传 + AI 识别**与缩略图渔获墙 |
| **钓点地图** | 高德底图（道路/卫星）、GPS 定位、**附近水域查询**、**钓点咨询**、**驾车可达性**、自定义钓点、分享二维码 |
| **鱼种图鉴** | 常见鱼种垂钓要点速查 |
| **钓法教学** | 台钓 / 传统钓 / 路亚等钓法讲解 |
| **饵料配方** | 荤饵 / 素饵 / 商品饵配方与适用场景 |
| **装备清单** | 按场景整理的装备清单，可勾选 |
| **安全守则** | 垂钓安全与环保注意事项 |

---

## 📊 出钓指数

评分模型（`js/score.js` 的 `calcScore` 为纯函数，便于复用）：

| 因子 | 权重 |
| --- | --- |
| 气压 | 22% |
| 温度 | 18% |
| 天气 | 16% |
| 风力 | 14% |
| 风向 | 8% |
| 时段 | 12% |
| 季节 | 10% |

### 自动获取天气

点「获取定位」后并行做两件事：

1. **高德逆地理**（`/api/regeo`）→ 输出 `陕西省西安市碑林区文艺路街道 · 文艺南路16号 · 东区市场`，失败时降级到 Photon（OSM）
2. **Open-Meteo 天气**（`current` + `hourly`，含 `past_days=1`）→ 自动回填天气、气温、气压、风力、风向

### 逐时适钓 · 未来 24 小时

用**同一套评分算法**逐小时跑一遍，回答「几点出门、几点收竿」：

- **24 根柱子** = 每小时适钓分，颜色分级：绿 ≥75 / 蓝 60–74 / 黄 45–59 / 红 <45
- **紫色折线** = 同一窗口气压走势，叠在柱上对照
- **最佳时段** = 3 小时滑动窗口均分最高的一段，输出「最佳 08:00–10:00（均 86 分）」
- **气压结论** = 按 12 小时变化量判回升 / 平稳 / 下降 / 骤降；压降 >5 hPa 额外提示「鱼大概率上浮停口，建议改期或钓半水」
- **点击任意柱子**可把该小时参数回填到上方表单，方便细算

> ⚠️ **重要修正**：气压取的是 `pressure_msl`（海平面气压），不是 `surface_pressure`（站点气压）。西安海拔约 400 m，站点气压实测仅 963 hPa，会被评分表判成最低档 0.10；改用海平面气压后实测 1011 hPa → 0.62，符合实际。

---

## 🗺 钓点地图

### 底图

Leaflet 引擎 + **高德官方瓦片**（`wprd0{1-4}.is.autonavi.com`）：

- 道路档：`style=7`
- 卫星档：`style=6`

Leaflet 通过 CDN 多源兜底加载（jsdelivr → unpkg → cdnjs），加载失败会优雅提示。

### 坐标系统一（关键）

浏览器 GPS（`navigator.geolocation`）给的是 **WGS-84**，高德底图/API 用的是 **GCJ-02**，国内相差 50–600 m（西安实测 464 m）。`js/core.js` 提供双向转换：

```js
wgs84ToGcj02(lng, lat)  // WGS-84 → GCJ-02
gcj02ToWgs84(lng, lat)  // GCJ-02 → WGS-84（存真值用）
mapLatLng(lat, lng)     // 转给 Leaflet 画点
amapPos(lat, lng)       // 转给高德链接 / API 的 "lng,lat"
```

全站 **10 处**坐标出口（我的位置标记/圈、钓点标记、点击定位、水域散点、POI 搜索中心、`uri.amap.com` 跳转链接、分享链接与分享点）已统一转换。

> 排查经验：高德标记**偏西北**= 没转坐标系；**偏东南**= 转了两次。

### 附近水域（河流 / 水库 / 湖泊）

- **主源 = 高德 POI**，`types=190204|190205`（河流 / 湖泊，水库按名字自动纠正标签，渠类归为运河），按名字去重保留最近一段，实测 **~200 ms**
- **兜底 = OSM Overpass** 三镜像并发竞速，仅在高德失败时启用

结果缓存 6 小时，最多展示 20 处，版权行会按实际来源自动切换。

### 钓点咨询（收费钓场 / 野钓点）

高德 POI 关键词周边搜索（钓鱼、垂钓园、鱼塘、黑坑等），带：

- 距离、类型、**适钓指数**（用当前天气算）
- 评分 ⭐ / 人均 ¥ / 营业时间（`extensions=all` 才有）
- 推荐徽章（分数 ≥68 且排名前 5）

### 驾车可达性

列表每条带 🚗 徽标，显示**真实驾车时长 + 里程**（高德 `v3/direction/driving`），而非直线距离。

- 结果按起终点缓存 7 天（`fish.route.v2`）
- 每次最多算前 10 个，并发上限 3
- 失败时静默降级为直线距离

---

## 📷 拍照识别鱼种（AI）

在「渔获日志」中拍照或选图后，调用视觉大模型自动识别**鱼种 / 尾数 / 最大单尾**。重量无法视觉精确测量，采用参照物估算并标注置信度；识别不出时给出优雅提示，不中断流程。

接口走同源代理 `POST /api/vision`，由服务端注入 Key，前端**无明文密钥**。

> 纯本地 `file://` 打开时 AI 识别不可用（依赖同源代理），其余功能正常。

---

## 🛠 技术栈

- 纯 HTML + 独立 CSS + 原生 JavaScript，**无构建步骤**
- 脚本以经典 `<script>` 顺序加载（非 ES Module），可直接双击 `index.html` 打开
- 地图：Leaflet 1.9.4（CDN）
- 存储：`localStorage`
- 图片：浏览器端 `createImageBitmap` 校正 EXIF 方向，压缩存 1280px 原图 + 240px 缩略图（JPEG）
- 外部接口：高德 Web 服务 REST v3（POI / 逆地理 / 路径规划）、Open-Meteo、OpenAI 兼容 `/chat/completions`（默认智谱 GLM-4V-Flash）

---

## 🚀 使用方式

### 本地

双击 `index.html` 即可，移动端（手机相机 + GPS）体验最佳。

### 部署到服务器

把 `index.html` / `styles.css` / `js/` 放到静态目录。启用 AI 识别与高德能力需配置反向代理（见下）。

> ⚠️ **维护约定**：`index.html` 里 CSS/JS 引用带缓存版本号 `?v=20261015e`。**每次改动前端文件都必须 bump 这个版本号**，否则浏览器吃旧缓存，会出现「改完了页面还是那样」。

---

## 🔒 服务端代理配置（安全版）

Key 全部不写进前端，由 nginx 在服务端注入。

```nginx
# AI 视觉识别（智谱）
location = /api/vision {
    proxy_pass https://open.bigmodel.cn/api/paas/v4/chat/completions;
    proxy_ssl_server_name on;
    proxy_set_header Host open.bigmodel.cn;
    proxy_set_header Authorization "Bearer <智谱API Key>";
    proxy_set_header Content-Type application/json;
    proxy_read_timeout 60s;
}

# 高德 POI 周边搜索
location = /api/amap {
    resolver 223.5.5.5 119.29.29.29 valid=300s;
    resolver_timeout 5s;
    set $amap_q "key=<高德Web服务Key>&$args";
    proxy_pass https://restapi.amap.com/v3/place/around?$amap_q;
    proxy_ssl_server_name on;
    proxy_set_header Host restapi.amap.com;
    proxy_set_header User-Agent "fishing-guide";
    proxy_read_timeout 15s;
}

# 高德逆地理编码
location = /api/regeo {
    resolver 223.5.5.5 119.29.29.29 valid=300s;
    resolver_timeout 5s;
    set $amap_q "key=<高德Web服务Key>&$args";
    proxy_pass https://restapi.amap.com/v3/geocode/regeo?$amap_q;
    proxy_ssl_server_name on;
    proxy_set_header Host restapi.amap.com;
    proxy_set_header User-Agent "fishing-guide";
    proxy_read_timeout 10s;
}

# 高德驾车路径规划
location = /api/route {
    resolver 223.5.5.5 119.29.29.29 valid=300s;
    resolver_timeout 5s;
    set $amap_r "key=<高德Web服务Key>&$args";
    proxy_pass https://restapi.amap.com/v3/direction/driving?$amap_r;
    proxy_ssl_server_name on;
    proxy_set_header Host restapi.amap.com;
    proxy_set_header User-Agent "fishing-guide";
    proxy_read_timeout 15s;
}
```

> `resolver` 是必需的：`proxy_pass` 的 URI 含变量时，nginx 需要运行时 DNS 解析。

前端只请求同源 `/api/*`，源码里搜不到任何 Key。

---

## 📁 目录结构

```
fishing-guide/
├── index.html        # 入口：HTML 结构 + 按顺序加载 css / js（带 ?v= 缓存版本）
├── styles.css        # 全部样式
├── js/
│   ├── data.js       # 数据常量：鱼种 / 钓法 / 饵料 / 装备 / 标签 / 评分表
│   ├── core.js       # DOM 工具 / 导航 / 搜索开关 / 繁简转换 / WGS-84↔GCJ-02 坐标转换
│   ├── score.js      # 出钓指数（calcScore 纯函数）+ 逐时适钓 + 气压趋势 + 逆地理 + 天气
│   ├── content.js    # 鱼种图鉴 / 钓法 / 饵料 / 装备清单渲染
│   ├── log.js        # 渔获日志 + 拍照识别 + 渔获墙 / 灯箱
│   ├── search.js     # 全站搜索
│   ├── map.js        # 钓点地图（Leaflet + 高德瓦片）/ 附近水域 / 钓点咨询 / 驾车可达性
│   ├── share.js      # 钓点分享：二维码生成 + 链接解析
│   └── init.js       # 初始化收尾
└── README.md
```

---

## 💾 数据存储

| Key | 内容 |
| --- | --- |
| `fish.logs.v1` | 渔获日志记录（含缩略图） |
| `fish.photos.v1` | 渔获原图 |
| `fish.spots.v1` | 自定义钓点 |
| `fish.rivers.v1` | 附近水域查询结果（6h 缓存） |
| `fish.amap.v1` | 钓点咨询查询结果（缓存） |
| `fish.route.v2` | 驾车路径规划结果（7 天缓存） |
| `fish.gear.v1` | 装备清单勾选状态 |

> 清除浏览器数据或更换设备不会自动同步，请自行导出备份。

---

## ⚠️ 已知限制

- **高德栅格瓦片的线网数据滞后**：例如西安地铁 8 号线已开通，POI 数据已更新，但瓦片仍渲染为「建设中」。属数据源问题，非缓存或代码问题
- **桌面端定位精度有限**：PC 走 WiFi/IP 定位，通常 ±几十到几百米，手机上（GPS）会准得多
- **file:// 打开时**：AI 识别不可用（需同源代理），高德接口因跨域同样不可用

---

## 📄 License

仅供个人学习交流使用。地图数据 © 高德地图，水域兜底数据 © OpenStreetMap 贡献者（ODbL）。
