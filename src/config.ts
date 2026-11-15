/**
 * 集中配置：所有可调阈值、扩展名集合与协议常量都放在这里，便于统一修改。
 */
export const CONFIG = {
  /** 文本 / Markdown 预览与编辑的默认大小上限（1 MB） */
  MAX_PREVIEW_SIZE: 1024 * 1024,
  /** 大目录分页：每页条目数 */
  PAGE_SIZE: 100,
  PAGE_SIZE_OPTIONS: [50, 100, 200, 500],
  /** 单次请求超时 */
  REQUEST_TIMEOUT_MS: 45_000,
  /** 上传并发数（避免一次性发起过多 XHR 拖垮浏览器） */
  UPLOAD_CONCURRENCY: 2,
  /** PROPFIND 默认深度 */
  PROPFIND_DEPTH: 1,
  /** 存储键 */
  STORAGE_KEYS: {
    connection: 'webdav.connection.v1',
    ui: 'webdav.ui.v1',
  },
} as const;

/** 可预览 / 可编辑为纯文本的后缀 */
export const TEXT_EXTENSIONS = [
  'txt', 'text', 'json', 'jsonc', 'json5', 'xml', 'csv', 'tsv', 'log',
  'md', 'markdown', 'mdown', 'mkd', 'yaml', 'yml', 'toml', 'ini', 'conf',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less', 'html',
  'htm', 'svg', 'sql', 'sh', 'bash', 'py', 'rb', 'go', 'java', 'rs',
  'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'vue', 'svelte', 'env', 'gitignore',
  'properties', 'bat', 'ps1', 'lua', 'r', 'plist', 'gradle', 'dockerfile',
] as const;

export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd'] as const;

/** 交给浏览器 <img> 原生渲染的图片后缀 */
export const IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico', 'svg',
] as const;

/** 常用文本文件的 MIME，写回时带上，避免服务端当作二进制 */
export const TEXT_MIME: Record<string, string> = {
  txt: 'text/plain', text: 'text/plain', log: 'text/plain',
  md: 'text/markdown', markdown: 'text/markdown',
  json: 'application/json', jsonc: 'application/json', json5: 'application/json',
  xml: 'application/xml', csv: 'text/csv', tsv: 'text/tab-separated-values',
  yaml: 'text/yaml', yml: 'text/yaml',
  html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', ts: 'text/plain', svg: 'image/svg+xml',
};

/** 标准 PROPFIND 请求体；部分服务端不接收 XML 请求体，webdav.ts 中做了无请求体回退 */
export const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<propfind xmlns="DAV:">' +
  '<prop>' +
  '<resourcetype/><getcontentlength/><getlastmodified/><getetag/>' +
  '<getcontenttype/><displayname/><creationdate/>' +
  '</prop>' +
  '</propfind>';

/** 展示给用户的 CORS 配置参考（用于错误提示） */
export const CORS_EXAMPLE = `Access-Control-Allow-Origin: https://你的站点域名
Access-Control-Allow-Methods: GET, HEAD, PUT, DELETE, MOVE, MKCOL, PROPFIND, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, Depth, Destination, Overwrite, If-Match, If-None-Match
Access-Control-Expose-Headers: ETag, Content-Length, Last-Modified, WWW-Authenticate
Access-Control-Allow-Credentials: true`;
