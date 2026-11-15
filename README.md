# WebDAV Studio

纯前端 WebDAV 文件管理器，Vite 8 + React 19 + TypeScript 7。无后端，浏览器直连你填写的 WebDAV 服务端。

![Vite](https://img.shields.io/badge/Vite-8-646CFF) ![React](https://img.shields.io/badge/React-19-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6)

## 功能

- 浏览：面包屑、列表/网格、搜索排序、分页
- 单文件：上传（进度、同名冲突）、下载、重命名、删除、新建文件夹
- 批量：多选后删除 / 下载 / 移动，或打包 ZIP
- 预览：图片、文本、Markdown（可编辑并保存）
- 深浅主题、危险操作确认、错误分类与建议

## 运行

需要 Node.js 20.19+ 或 22.12+（CI 使用 Node 24）。

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # 输出 dist/
```

本地测试服务（仅用于验收，不是应用后端）：`npm run mock:dav` → `http://127.0.0.1:8787/dav/`，账号 `demo / demo123`。

## 部署

`dist/` 使用相对路径，可直接放站点根目录或任意子路径（如 `/webui/`），无需重新构建，访问时需带尾斜杠。Nginx 配置模板见 [deploy/nginx-subpath.conf.example](deploy/nginx-subpath.conf.example)。

GitHub Pages：<https://liaoxycn.github.io/webdav-webui/>，推送 `master` 自动部署；首次需在 Settings → Pages 把 Source 选为 GitHub Actions。

## 限制

- 服务端需放行 CORS（含 `Authorization`、`Depth`、`Destination`、`Overwrite`）
- 仅支持 HTTP Basic Auth 与匿名访问，不支持 Digest / NTLM / OAuth2
- HTTPS 页面无法连接 HTTP 服务端（混合内容）
- 密码仅在勾选「记住密码」时明文存入 localStorage
- 预览上限 1 MB；ZIP 上限 200 个文件 / 200 MB
- 仓库不提交 `package-lock.json` 与 `.npmrc`
