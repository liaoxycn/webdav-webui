# WebDAV Studio

一个**纯前端**的 WebDAV 文件管理器，基于 Vite + React 18 + TypeScript。没有后端、没有代理、没有第三方服务，浏览器直接与你填写的 WebDAV 服务端通信。

![Vite](https://img.shields.io/badge/Vite-6-646CFF) ![React](https://img.shields.io/badge/React-18-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)

## 功能

- 目录浏览、面包屑、列表/网格视图、搜索排序、分页
- 上传（含进度与同名冲突处理）、下载、重命名、删除、新建文件夹
- 批量处理：多选（Ctrl/Cmd、Shift 连选、全选、跨页保留）后批量删除、下载、移动到文件夹，或打包成 ZIP 一次下载
- 图片预览、文本预览（txt/json/xml/csv/log…）、Markdown 预览与编辑保存
- 浅色/深色主题、危险操作确认、错误原因分类与处理建议
- 凭据保存在浏览器 localStorage：默认只存 URL 与用户名，密码仅在勾选「记住密码」后明文保存

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 构建到 dist/
```

想直接体验，可用仓库自带的本地 WebDAV 测试服务（仅用于验收，不是应用后端）：

```bash
npm run mock:dav   # http://127.0.0.1:8787/dav/  demo / demo123
```

在连接页填入上面的地址与账号即可。`npm run mock:dav:no-cors` 和 `npm run mock:dav:digest` 可复现两类错误提示。

## 部署

`dist/` 是纯静态文件，可直接放到 nginx。构建产物默认使用相对资源路径，因此**同一份产物既能放在站点根目录，也能放在任意子路径**（如 `/webui/`），无需重新构建：

```bash
npm run build
# 复制 dist/ 内全部文件到 /usr/share/nginx/html/webui/
# 打开 http://your-host/webui/   （需要尾斜杠）
```

Nginx 子路径 / 前缀代理配置模板见 [deploy/nginx-subpath.conf.example](deploy/nginx-subpath.conf.example)。如需固定绝对前缀，参考 [.env.example](.env.example) 设置 `VITE_BASE`。本地可用 `npm run serve:prefix` 在 `/webui/` 下验收。

### GitHub Pages

仓库已配置 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)，推送到 `master` 后自动构建并发布，访问地址：

```
https://liaoxycn.github.io/webdav-webui/
```

**首次部署需要先启用 Pages（只需一次）**：打开 [Settings → Pages](https://github.com/liaoxycn/webdav-webui/settings/pages)，把 **Build and deployment → Source** 选为 **GitHub Actions**。未启用时工作流会停在 `Setup Pages` 步骤失败，启用后在 Actions 页面点 **Re-run** 即可。Vite 的 `base` 由工作流按仓库名推导，因此 fork 或改名后无需改代码。

> Pages 强制 HTTPS，所以只能连接 **HTTPS** 的 WebDAV 服务端；`http://` 的地址会被浏览器的混合内容策略拦截。

## 使用须知

- WebDAV 服务端必须正确放行 CORS（含 `Authorization`、`Depth`、`Destination`、`Overwrite` 等头），浏览器无法绕过。
- 仅支持 HTTP Basic Auth 与匿名访问；Digest / NTLM / OAuth2 / Cookie 会话类服务不支持。
- HTTPS 页面不能连接 HTTP WebDAV（混合内容会被浏览器拦截）。
- 记住密码是 **localStorage 明文存储**，公共设备请勿勾选；凭据不会上传到任何服务器。
- 文本/Markdown 预览上限 1 MB，大文件请下载；Markdown 渲染禁用原始 HTML 并做链接过滤。
- ZIP 打包会递归展开所选文件夹，上限 200 个文件 / 200 MB；浏览器可能拦截「连续下载多个文件」，批量下载时请在地址栏选择「允许」。

## 目录结构

```
src/lib/        WebDAV 协议、路径编码、错误分类、安全渲染
src/components/ 连接页、文件列表、预览编辑、传输面板等
tools/          本地验收用的 WebDAV 服务与子路径静态服务
deploy/         Nginx 配置模板
.github/        GitHub Pages 自动部署工作流
```

---

纯静态、无后端；数据只在你的浏览器与你的 WebDAV 服务端之间流动。
