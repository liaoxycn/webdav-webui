/**
 * 本地验收用的极简 WebDAV 服务端（Node 内置模块，无第三方依赖）。
 *
 *   node tools/mock-webdav.mjs
 *   根 URL: http://127.0.0.1:8787/dav/
 *   账号: demo / demo123
 *
 * 这不是应用的后端代理：它就是「被连接的 WebDAV 服务器」本身，
 * 用来在没有真实 WebDAV 服务时手动验收全部功能。
 *
 * 可选参数（也可通过同名环境变量设置）：
 *   --port=8787     监听端口
 *   --no-cors       不返回 CORS 头，用于验收跨域错误提示
 *   --digest        返回 Digest 挑战，用于验收「不支持的认证方式」提示
 */

import http from 'node:http';
import { Buffer } from 'node:buffer';

const ARGS = process.argv.slice(2);
const PORT = Number(ARGS.find((arg) => arg.startsWith('--port='))?.split('=')[1] ?? process.env.MOCK_PORT ?? 8787);
const NO_CORS = ARGS.includes('--no-cors') || process.env.MOCK_NO_CORS === '1';
const AUTH_MODE = ARGS.includes('--digest') || process.env.MOCK_AUTH === 'digest' ? 'digest' : 'basic';
const ROOT = '/dav/';
const USER = 'demo';
const PASS = 'demo123';

/** path -> { type: 'file'|'dir', body?: Buffer, type?: string, modified: Date } */
const store = new Map();

function now() {
  return new Date();
}

function addDir(path) {
  store.set(path, { type: 'dir', modified: now() });
}
function addFile(path, body, contentType = 'application/octet-stream') {
  store.set(path, {
    type: 'file',
    body: Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'),
    contentType,
    modified: now(),
  });
}

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

const markdownSample = `# 项目说明

这是一个 **Markdown** 预览示例，用来验收安全渲染。

## 安全的部分

- 列表项一
- [外部链接](https://example.com "示例")
- \`行内代码\`

> 引用块内容

\`\`\`js
console.log('hello webdav');
\`\`\`

| 功能 | 状态 |
| --- | --- |
| PROPFIND | 已支持 |
| PUT | 已支持 |

## 不安全的部分（应被转义 / 过滤）

<script>alert('xss')</script>

<img src="x" onerror="alert(1)">

[危险链接](javascript:alert(1))

<style>body{background:red}</style>
`;

addDir(ROOT);
addDir(`${ROOT}文档/`);
addDir(`${ROOT}照片/`);
addDir(`${ROOT}文档/子目录/`);
addFile(`${ROOT}readme.md`, markdownSample, 'text/markdown');
addFile(`${ROOT}notes.txt`, '纯文本预览测试\n第二行内容\n<这行不是 HTML，应当被转义显示>\n', 'text/plain');
addFile(`${ROOT}data.json`, JSON.stringify({ app: 'webdav-webui', ok: true, items: [1, 2, 3] }, null, 2), 'application/json');
addFile(`${ROOT}config.xml`, '<?xml version="1.0"?>\n<config><name>demo</name></config>\n', 'application/xml');
addFile(`${ROOT}报表.csv`, '姓名,部门,分数\n张三,技术,98\n李四,产品,87\n', 'text/csv');
addFile(`${ROOT}运行日志.log`, '2026-01-01 10:00:00 INFO started\n2026-01-01 10:00:01 WARN slow response\n', 'text/plain');
addFile(`${ROOT}带 空格 & 特殊#字符.txt`, '这个文件名的空格、& 和 # 都必须被逐段编码。\n', 'text/plain');
addFile(`${ROOT}超大文件.txt`, 'x'.repeat(1.3 * 1024 * 1024), 'text/plain');
addFile(`${ROOT}logo.png`, png1x1, 'image/png');
addFile(`${ROOT}文档/方案 A.md`, '# 方案 A\n\n放在带空格的中文目录里。\n', 'text/markdown');
addFile(`${ROOT}文档/会议记录.txt`, '会议记录：路径含中文与空格。\n', 'text/plain');
addFile(`${ROOT}文档/子目录/深层文件.txt`, '用于验证面包屑与返回上级。\n', 'text/plain');
addFile(`${ROOT}照片/说明.txt`, '图片目录占位文件。\n', 'text/plain');

function normalizePath(raw) {
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (!decoded.startsWith(ROOT)) return null;
  const isDir = decoded.endsWith('/');
  return { path: decoded, isDir };
}

function pathFromUrl(rawUrl) {
  const parsed = new URL(rawUrl, `http://127.0.0.1:${PORT}`);
  const normalized = normalizePath(parsed.pathname);
  if (!normalized) return null;
  return { path: normalized.path, isDir: normalized.isDir };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hrefFor(path) {
  const segments = path.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment));
  const trailing = path.endsWith('/') && segments.length > 0 ? '/' : '';
  return `/${segments.join('/')}${trailing}`;
}

function corsHeaders() {
  if (NO_CORS) return {};
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, MOVE, MKCOL, PROPFIND, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth, Destination, Overwrite, If-Match',
    'Access-Control-Expose-Headers': 'ETag, Content-Length, Last-Modified, WWW-Authenticate',
    'Access-Control-Max-Age': '600',
  };
}

function respond(res, status, headers = {}, body = '') {
  res.writeHead(status, { ...corsHeaders(), ...headers });
  res.end(body);
}

function authorized(req) {
  if (AUTH_MODE === 'digest') return false;
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  return decoded === `${USER}:${PASS}`;
}

function propEntry(path, item, isDir) {
  const href = hrefFor(path);
  const props = [
    `<D:displayname>${escapeXml(path.replace(/\/+$/, '').split('/').pop() || ROOT)}</D:displayname>`,
    `<D:resourcetype>${isDir ? '<D:collection/>' : ''}</D:resourcetype>`,
    `<D:getlastmodified>${(item?.modified ?? now()).toUTCString()}</D:getlastmodified>`,
    `<D:getetag>"${Buffer.from(path).toString('hex').slice(0, 16)}"</D:getetag>`,
  ];
  if (!isDir && item) {
    props.push(`<D:getcontentlength>${item.body.length}</D:getcontentlength>`);
    props.push(`<D:getcontenttype>${escapeXml(item.contentType)}</D:getcontenttype>`);
  }
  return [
    '<D:response>',
    `<D:href>${escapeXml(href)}</D:href>`,
    '<D:propstat><D:prop>',
    ...props,
    '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>',
    '</D:response>',
  ].join('');
}

function childrenOf(dirPath) {
  const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
  const result = [];
  for (const [path, item] of store.entries()) {
    if (path === prefix || !path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (!rest || rest.slice(0, -1).includes('/')) continue;
    result.push({ path, item, isDir: path.endsWith('/') });
  }
  return result;
}

const server = http.createServer((req, res) => {
  const method = (req.method ?? 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    respond(res, 204);
    return;
  }

  if (!authorized(req)) {
    respond(res, 401, {
      'WWW-Authenticate':
        AUTH_MODE === 'digest'
          ? 'Digest realm="mock", nonce="abc123", algorithm=MD5, qop="auth"'
          : 'Basic realm="Mock WebDAV"',
      'Content-Type': 'text/plain; charset=utf-8',
    }, 'Authentication required: demo / demo123');
    return;
  }

  const target = pathFromUrl(req.url ?? '/');
  if (!target) {
    respond(res, 400, { 'Content-Type': 'text/plain' }, 'Invalid WebDAV root');
    return;
  }
  const { path, isDir } = target;
  const item = store.get(path) ?? store.get(path.replace(/\/$/, '') + '/') ?? store.get(path.replace(/\/+$/, ''));

  switch (method) {
    case 'PROPFIND': {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        // 模拟「服务端不接受 XML 请求体」：?strict=1 且带请求体时返回 400，
        // 客户端应自动回退成无请求体 PROPFIND 并成功列目录
        const strict = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.has('strict');
        if (strict && Buffer.concat(chunks).length > 0) {
          respond(res, 400, { 'Content-Type': 'text/plain' }, 'PROPFIND body not accepted');
          return;
        }
        const self = item ?? { type: 'dir', modified: now() };
        const selfIsDir = isDir || self.type === 'dir';
        const selfPath = selfIsDir && !path.endsWith('/') ? `${path}/` : path;
        const responses = [propEntry(selfPath, self, selfIsDir)];
        if (selfIsDir) {
          for (const child of childrenOf(selfPath)) {
            responses.push(propEntry(child.path, child.item, child.isDir));
          }
        }
        const xml =
          '<?xml version="1.0" encoding="utf-8"?>' +
          '<D:multistatus xmlns:D="DAV:">' +
          responses.join('') +
          '</D:multistatus>';
        respond(res, 207, { 'Content-Type': 'application/xml; charset=utf-8' }, xml);
      });
      return;
    }

    case 'GET': {
      if (!item || item.type !== 'file') {
        respond(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
        return;
      }
      respond(res, 200, {
        'Content-Type': item.contentType,
        'Content-Length': item.body.length,
        'Last-Modified': item.modified.toUTCString(),
        'ETag': `"${Buffer.from(path).toString('hex').slice(0, 16)}"`,
      }, item.body);
      return;
    }

    case 'PUT': {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const existed = store.has(path);
        addFile(path, Buffer.concat(chunks), req.headers['content-type'] ?? 'application/octet-stream');
        respond(res, existed ? 204 : 201);
      });
      return;
    }

    case 'MKCOL': {
      const dirPath = path.endsWith('/') ? path : `${path}/`;
      if (store.has(dirPath)) {
        respond(res, 405, { 'Content-Type': 'text/plain' }, 'Already exists');
        return;
      }
      addDir(dirPath);
      respond(res, 201);
      return;
    }

    case 'DELETE': {
      const dirPath = path.endsWith('/') ? path : `${path}/`;
      if (!store.has(path) && !store.has(dirPath)) {
        respond(res, 404);
        return;
      }
      store.delete(path);
      store.delete(dirPath);
      if (isDir) {
        for (const key of [...store.keys()]) if (key.startsWith(dirPath)) store.delete(key);
      }
      respond(res, 204);
      return;
    }

    case 'MOVE': {
      const destination = req.headers.destination;
      if (!destination) {
        respond(res, 400, { 'Content-Type': 'text/plain' }, 'Missing Destination');
        return;
      }
      const dest = pathFromUrl(destination);
      if (!dest) {
        respond(res, 400, { 'Content-Type': 'text/plain' }, 'Bad Destination');
        return;
      }
      // Destination 的尾斜杠由客户端按资源类型决定：集合带 /，文件不带。
      // 这里原样保留，避免把移动后的文件误存成目录。
      const overwrite = (req.headers.overwrite ?? 'T').toUpperCase() !== 'F';
      if (!overwrite && store.has(dest.path)) {
        respond(res, 412, { 'Content-Type': 'text/plain' }, 'Destination already exists');
        return;
      }
      const sourceDir = path.endsWith('/') ? path : `${path}/`;
      const keys = [...store.entries()].filter(
        ([key]) => key === path || key === sourceDir || (isDir && key.startsWith(sourceDir)),
      );
      if (keys.length === 0) {
        respond(res, 404);
        return;
      }
      for (const [key, value] of keys) {
        const suffix = key === path || key === sourceDir ? '' : key.slice(sourceDir.length);
        store.set(`${dest.path}${suffix}`, value);
        store.delete(key);
      }
      respond(res, 201);
      return;
    }

    default:
      respond(res, 405, { Allow: 'GET, PUT, DELETE, MOVE, MKCOL, PROPFIND, OPTIONS' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock WebDAV ready: http://127.0.0.1:${PORT}${ROOT}`);
  console.log(`Credentials: ${USER} / ${PASS}`);
  console.log(`CORS: ${NO_CORS ? 'DISABLED (用于验收错误提示)' : 'enabled'} | AUTH: ${AUTH_MODE}`);
});
