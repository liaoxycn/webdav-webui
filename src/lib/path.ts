/** 路径与 URL 编解码工具：所有 WebDAV 请求地址都必须经过这里构造。 */

export interface ParsedRoot {
  origin: string;
  /** 以 `/` 结尾、仍是百分号编码状态的根路径 */
  rootPath: string;
  /** origin + rootPath，可直接拼接编码后的相对路径 */
  prefix: string;
  /** 根 URL 上可能存在的 query string（会追加到最终 URL 末尾） */
  suffix: string;
}

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // 服务端返回了非法百分号编码时，保留原文而不是抛错
    return value;
  }
}

/**
 * 校验并规范化根 URL。
 * 返回 { url, error }，error 为可直接展示给用户的中文原因。
 */
export function normalizeRootUrl(input: string): { url: string; error: string | null } {
  const raw = input.trim();
  if (!raw) return { url: '', error: '请填写 WebDAV 根 URL。' };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      url: '',
      error: 'URL 格式无效：请填写完整的绝对地址，例如 https://dav.example.com/dav/ 。',
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: '', error: '仅支持 http:// 或 https:// 协议。' };
  }
  if (parsed.username || parsed.password) {
    return {
      url: '',
      error: '浏览器会拦截在 URL 中内嵌的账号密码（user:pass@host）。请把凭据填写到下方的用户名 / 密码输入框。',
    };
  }
  if (window.location.protocol === 'https:' && parsed.protocol === 'http:') {
    return {
      url: '',
      error:
        '混合内容拦截：当前页面通过 HTTPS 打开，浏览器会阻止请求 HTTP 的 WebDAV 地址。请改用 HTTPS 地址，或在 HTTP 环境下打开本工具。',
    };
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  parsed.hash = '';
  return { url: parsed.toString(), error: null };
}

export function parseRoot(rootUrl: string): ParsedRoot {
  const parsed = new URL(rootUrl);
  const rootPath = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
  return {
    origin: parsed.origin,
    rootPath,
    prefix: `${parsed.origin}${rootPath}`,
    suffix: parsed.search,
  };
}

/** 对路径逐段编码：空格、中文、#、?、% 等特殊字符都会被正确处理。 */
export function encodePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/** 构造资源绝对 URL。集合需要尾部 `/`，文件不需要。 */
export function buildResourceUrl(rootUrl: string, path: string, isCollection = false): string {
  const { prefix, suffix } = parseRoot(rootUrl);
  const encoded = encodePath(path);
  const trailing = isCollection && encoded.length > 0 ? '/' : '';
  return `${prefix}${encoded}${trailing}${suffix}`;
}

/**
 * 把 PROPFIND 返回的 href 转成应用内部路径（解码后、以 `/` 开头、无尾斜杠）。
 * 兼容：绝对 URL、根相对路径、相对路径、百分号编码 / 原始 Unicode。
 */
export function hrefToPath(rootUrl: string, href: string): string {
  const { rootPath } = parseRoot(rootUrl);
  let pathname = href;

  try {
    // 用根 URL 解析，既能处理绝对 href，也能处理相对 href；pathname 仍保持百分号编码
    pathname = new URL(href, rootUrl).pathname;
  } catch {
    pathname = href.split(/[?#]/)[0] || href;
  }

  // 服务端偶尔返回不带尾斜杠的根 href（/dav 而非 /dav/），直接映射到根目录
  if (!pathname.endsWith('/') && `${pathname}/` === rootPath) return '/';

  let relative: string;
  if (pathname.startsWith(rootPath)) {
    relative = pathname.slice(rootPath.length);
  } else {
    const decodedPath = safeDecode(pathname);
    const decodedRoot = safeDecode(rootPath);
    if (decodedPath.startsWith(decodedRoot)) {
      relative = decodedPath.slice(decodedRoot.length);
    } else {
      // 少数服务端返回不含根前缀的绝对路径：去掉前导斜杠后作为相对路径
      relative = pathname.replace(/^\/+/, '');
    }
  }

  const segments = relative
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .map(safeDecode);
  return `/${segments.join('/')}`;
}

/** 拼接父目录与名称，得到内部路径 */
export function joinPath(parent: string, name: string): string {
  const cleanParent = parent.replace(/\/+$/, '');
  return `${cleanParent}/${name}`;
}

export function baseName(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

export function dirName(path: string): string {
  const segments = path.split('/').filter(Boolean);
  segments.pop();
  return segments.length ? `/${segments.join('/')}` : '/';
}

/** 面包屑分段：返回 [{ name, path }] */
export function pathSegments(path: string): Array<{ name: string; path: string }> {
  const segments = path.split('/').filter(Boolean);
  let acc = '';
  return segments.map((name) => {
    acc += `/${name}`;
    return { name, path: acc };
  });
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** 文件或文件夹命名校验（同时兼顾 URL 编码与常见服务端限制） */
export function validateEntryName(name: string, existing: string[] = [], originalName?: string): string | null {
  const value = name.trim();
  if (!value) return '名称不能为空。';
  if (value === '.' || value === '..') return '名称不能是 . 或 ..';
  if (/[\\/]/.test(value)) return '名称不能包含 / 或 \\ 。';
  if (/[\u0000-\u001f\u007f]/.test(value)) return '名称不能包含控制字符。';
  if (value.length > 255) return '名称过长（超过 255 个字符）。';
  if (existing.some((item) => item.toLowerCase() === value.toLowerCase() && item !== originalName)) {
    return '当前目录下已存在同名项目。';
  }
  return null;
}

/** 生成不冲突的自动重命名：report (1).md */
export function uniqueName(name: string, existing: string[]): string {
  const lower = new Set(existing.map((item) => item.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let index = 1;
  let candidate = `${stem} (${index})${ext}`;
  while (lower.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${stem} (${index})${ext}`;
  }
  return candidate;
}

/** 对文件名做下载用的安全处理，避免 Content-Disposition / 路径注入问题 */
export function safeDownloadName(name: string): string {
  return name.replace(/[\r\n"\\/]/g, '_');
}
