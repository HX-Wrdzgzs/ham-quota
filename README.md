# HAM 语录

面向 Cloudflare Pages 的 HAM 图片语录库，包含 325 张去重后压缩的 WebP 截图。

## Cloudflare Pages 连接 GitHub

在 Cloudflare 控制台创建 Pages 项目并连接此仓库，部署分支为 `main`，无需构建命令，**输出目录为 `.`（仓库根目录）**。部署目录根部必须同时存在 `index.html`、`_worker.js`、`quotes.json`、`images/`。

图片浏览、搜索、筛选、随机语录无需额外配置。

## 启用在线分类

Cloudflare Pages 使用 D1 存储分类记录。先在 D1 控制台新建数据库，然后执行仓库根目录的 `D1初始化.sql`。

接着到 **Pages → Settings → Bindings** 将这个 D1 数据库绑定为变量 `DB`，并重新部署。

未绑定 D1 时，网站仍能浏览所有图片，但提交分类会返回明确错误；不会假装已经保存。

呼号由访客自行填写，仅作为分类署名，**不构成业余电台身份验证**。公开开放分类前建议补充审核、防刷和隐私保护。

## 文件

- `images/`：325 张 WebP 图片
- `quotes.json`：图片索引与来源
- `index.html`、`style.css`、`app.js`：前端
- `_worker.js`：Cloudflare Pages Worker，提供数据接口
- `D1初始化.sql`：D1 数据表及默认分类

图片内容可能包含聊天截图。网站公开上线前，务必核查是否涉及个人信息或未经许可公开的内容。

## 数据说明

本仓库不包含本地原始 ZIP、JPG/PNG 或 SQLite 文件。原图在制作者电脑上保留备份。
