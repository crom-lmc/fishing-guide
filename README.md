# 钓鱼指南 · 从入门到上鱼

一个**单文件、零依赖、纯前端**的钓鱼助手 Web App。所有数据存在浏览器 `localStorage`，无需后端、无需注册，打开即用；可一键部署到任意静态服务器（含 HTTPS）。

## ✨ 功能特性

应用包含 8 个模块（底部标签切换）：

| 模块 | 说明 |
| --- | --- |
| 出钓指数 | 综合气压、温度、天气、风况、季节、时段等因素，给出 0–100 出钓适宜度评分与等级建议 |
| 渔获日志 | 记录每次渔获（鱼种、尾数、最大单尾、重量、钓点、饵料、备注），支持**拍照上传**与**缩略图渔获墙** |
| 钓点地图 | 内置钓点标注，支持 GPS 定位（蓝点跟随），可添加自定义钓点 |
| 鱼种图鉴 | 常见鱼种垂钓要点速查 |
| 钓法教学 | 台钓 / 传统钓 / 路亚等钓法讲解 |
| 饵料配方 | 荤饵 / 素饵 / 商品饵配方与适用场景 |
| 装备清单 | 按场景整理的装备清单，可勾选 |
| 安全守则 | 垂钓安全与环保注意事项 |

### 📷 拍照识别鱼种（AI）

在「渔获日志」中拍摄或选择照片后，应用调用视觉大模型自动识别：

- 鱼种
- 尾数
- 最大单尾

重量因无法精确视觉测量，采用参照物估算并标注置信度。识别不出具体鱼种时会给出优雅提示，不会报错中断。

> **安全说明**：识别接口走同源代理 `/api/vision`，由服务端（nginx）注入 API Key，前端代码**不含任何明文密钥**，可安全公开部署。详见下方「部署」一节。

## 🛠 技术栈

- 纯 HTML + 内联 CSS + 原生 JavaScript，**无任何第三方依赖、无构建步骤**
- 数据存储：`localStorage`
- 图片处理：浏览器端 `createImageBitmap` 校正 EXIF 方向，压缩后存为 1280px 原图 + 240px 缩略图（JPEG）
- 视觉识别：OpenAI 兼容 `/chat/completions` 接口（默认智谱 GLM-4V-Flash，免费视觉模型）

## 🚀 使用方式

### 本地直接打开

双击 `index.html` 即可在浏览器使用，移动端（手机相机）体验最佳。

> 注意：纯本地 `file://` 打开时 AI 拍照识别不可用（依赖同源代理），其余功能均正常。

### 部署到服务器

将 `index.html` 放到任意静态目录即可。若要启用 AI 识别，需配置反向代理（见下）。

## 🔒 部署与 AI 识别（安全版）

识别 Key 不写进前端，由 nginx 在服务端注入，避免公网明文泄露：

```nginx
location = /api/vision {
    proxy_pass https://open.bigmodel.cn/api/paas/v4/chat/completions;
    proxy_ssl_server_name on;
    proxy_set_header Host open.bigmodel.cn;
    proxy_set_header Authorization "Bearer <你的智谱API Key>";
    proxy_set_header Content-Type application/json;
    proxy_read_timeout 60s;
}
```

前端仅请求同源 `POST /api/vision`，密钥只存在于服务器配置中，浏览器源码无法看到。

## 📁 目录结构

```
fishing-guide/
├── index.html   # 单文件应用（全部逻辑、样式、数据）
└── README.md
```

## 📝 数据存储

- `fish.logs.v1`：渔获日志记录（含缩略图）
- `fish.photos.v1`：渔获原图
- 其余偏好（季节、地区、默认钓点等）同样存于 `localStorage`

> 清除浏览器数据或更换设备时记录不会自动同步，请自行导出备份。

## 📄 License

仅供个人学习交流使用。
