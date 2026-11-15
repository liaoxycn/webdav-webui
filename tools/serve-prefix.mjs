/**
 * 本地验收用：把 dist/ 挂载到指定 URL 前缀下，模拟 Nginx 子路径 / 前缀代理。
 * 不是应用后端，只是静态文件服务器；生产部署请用 deploy/nginx-subpath.conf.example。
 *
 *   node tools/serve-prefix.mjs
 *   SERVE_PREFIX=apps/dav/ SERVE_PORT=4181 node tools/serve-prefix.mjs
 *   SERVE_PREFIX=root SERVE_PORT=4182 node tools/serve-prefix.mjs   # 站点根部署
 *
 * 可选参数（环境变量优先，CLI 同名参数兜底）：
 *   SERVE_PREFIX / --prefix=...   URL 前缀，默认 /webui/；省略开头斜杠即可，
 *                                root 表示站点根目录 /
 *   SERVE_DIR    / --dir=...      静态目录，默认 dist
 *   SERVE_PORT   / --port=...     端口，默认 4180
 *
 * 注意：Windows Git Bash 会把以 / 开头的值（无论 --prefix= 还是环境变量）
 * 改写成盘符路径。请一律省略开头斜杠，或用 root 关键字。
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

let prefix = process.env.SERVE_PREFIX || arg('prefix', '/webui/');
// Git Bash 会把 /xxx/ 形式的参数改写成 D:/.../xxx/，无法还原，直接给出明确指引
if (/^[A-Za-z]:\//.test(prefix)) {
  console.error('检测到 Git Bash 路径转换：前缀值请省略开头斜杠（apps/dav/），根部署用 root。');
  process.exit(1);
}
if (prefix === 'root') prefix = '/';
if (!prefix.startsWith('/')) prefix = `/${prefix}`;
if (!prefix.endsWith('/')) prefix += '/';
const barePrefix = prefix.slice(0, -1);
const dir = resolve(process.cwd(), process.env.SERVE_DIR || arg('dir', 'dist'));
const port = Number(process.env.SERVE_PORT || arg('port', 4180));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFile(res, filePath) {
  const size = statSync(filePath).size;
  res.writeHead(200, {
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const pathname = decodeURI(url.pathname);

  // /webui → 301 /webui/（与 Nginx 示例一致；应用自身也有兜底规范化）
  if (pathname === barePrefix) {
    send(res, 301, { Location: `${prefix}${url.search}` }, '');
    return;
  }
  if (!pathname.startsWith(prefix)) {
    send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
    return;
  }

  const relative = pathname.slice(prefix.length);
  const candidate = resolve(dir, normalize(relative));
  const inside = candidate === dir || candidate.startsWith(dir + sep);

  if (inside && existsSync(candidate) && statSync(candidate).isFile()) {
    serveFile(res, candidate);
    return;
  }

  // 带扩展名的静态资源缺失时明确 404，避免把 HTML 当 JS 返回
  if (extname(relative)) {
    send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, `404 ${relative}`);
    return;
  }

  const indexPath = join(dir, 'index.html');
  if (existsSync(indexPath)) {
    serveFile(res, indexPath);
  } else {
    send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'dist/index.html not found — run npm run build');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[prefix-server] dist: ${dir}`);
  console.log(`[prefix-server] http://127.0.0.1:${port}${prefix}`);
  console.log(`[prefix-server] ${barePrefix} will 301 → ${prefix}`);
});
