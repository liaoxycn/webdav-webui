import { CONFIG, PROPFIND_BODY, TEXT_MIME } from '../config';
import type { Credentials, DavEntry, DavResponse, HttpMethod, ProgressSnapshot } from '../types';
import { PreviewTooLargeError, WebDavError, classifyHttpError, describeMultistatusErrors } from './errors';
import { baseName, buildResourceUrl, dirName, extensionOf, hrefToPath, joinPath } from './path';

/** UTF-8 安全的 Basic Auth 编码（btoa 只接受 Latin-1，直接传中文会抛错） */
function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

interface RawResponse extends DavResponse {
  method: HttpMethod;
  path: string;
  url: string;
  /** 原始 fetch Response，供流式读取使用 */
  raw: Response;
}

interface RequestOptions {
  isCollection?: boolean;
  headers?: Record<string, string>;
  body?: string | Blob | ArrayBuffer | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function parseXhrHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
  }
  return headers;
}

function collectFetchHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

/** 返回所有 localName 匹配的后代元素，兼容 D: / d: / 默认命名空间等各种前缀 */
function elementsByLocalName(root: Element | Document, localName: string): Element[] {
  const result: Element[] = [];
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i += 1) {
    const element = all.item(i);
    if (element && element.localName.toLowerCase() === localName.toLowerCase()) result.push(element);
  }
  return result;
}

function firstElement(root: Element | Document, localName: string): Element | null {
  return elementsByLocalName(root, localName)[0] ?? null;
}

function elementText(element: Element | null): string {
  return element?.textContent?.trim() ?? '';
}

function parseSize(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

interface MultistatusResult {
  entries: DavEntry[];
  failedStatuses: string[];
  responseCount: number;
}

/** 解析 RFC 4918 的 207 Multi-Status XML */
function parseMultistatus(xml: string, rootUrl: string, currentPath: string): MultistatusResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (
    firstElement(doc, 'parsererror') ||
    doc.documentElement?.localName?.toLowerCase() === 'parsererror'
  ) {
    throw new WebDavError({
      category: 'protocol',
      title: '无法解析 WebDAV 响应',
      message: '服务端返回的 PROPFIND 结果不是合法的 XML（可能返回了 HTML 登录页或错误页）。',
      detail: xml.slice(0, 600),
      method: 'PROPFIND',
      suggestions: [
        '确认填写的是真正的 WebDAV 端点，而不是会返回网页的地址。',
        '在浏览器 Network 面板中查看 PROPFIND 的实际响应内容。',
        '确认服务端在 207 响应中返回 DAV: multistatus XML。',
      ],
    });
  }

  const rootName = doc.documentElement?.localName?.toLowerCase() ?? '';
  if (rootName && rootName !== 'multistatus') {
    throw new WebDavError({
      category: 'protocol',
      title: '意外的 WebDAV 响应格式',
      message: `期望 <multistatus>，实际收到 <${rootName}>。`,
      detail: xml.slice(0, 600),
      method: 'PROPFIND',
      suggestions: ['确认根 URL 指向 WebDAV 端点，而不是 REST API 或静态页面。'],
    });
  }

  const responses = elementsByLocalName(doc, 'response');
  const entries = new Map<string, DavEntry>();
  const failedStatuses: string[] = [];
  const normalizedCurrent = currentPath.replace(/\/+$/, '') || '/';

  for (const response of responses) {
    // 形如 <response><href/></response> 之外还可能带 <status>404</status>
    const responseStatus = elementText(firstElement(response, 'status'));
    if (responseStatus && !/\b2\d\d\b/.test(responseStatus)) failedStatuses.push(responseStatus);

    const href = elementText(firstElement(response, 'href'));
    if (!href) continue;

    // 只取 status 为 2xx 的 propstat，404 propstat 里的空属性要忽略
    let prop: Element | null = null;
    for (const propstat of elementsByLocalName(response, 'propstat')) {
      const status = elementText(firstElement(propstat, 'status'));
      const candidate = firstElement(propstat, 'prop');
      if (candidate && (!status || /\b2\d\d\b/.test(status))) {
        prop = candidate;
        break;
      }
    }
    if (!prop) prop = firstElement(response, 'prop');

    const statusElements = prop ? elementsByLocalName(prop, 'status') : [];
    for (const statusElement of statusElements) {
      const value = elementText(statusElement);
      if (value && !/\b2\d\d\b/.test(value)) failedStatuses.push(value);
    }

    const rawPath = hrefToPath(rootUrl, href);
    const path = rawPath.replace(/\/+$/, '') || '/';

    // 跳过目录自身、根路径误判与 Depth > 1 时可能返回的更深层级
    if (path === '/' || path === normalizedCurrent) continue;
    if (dirName(path) !== normalizedCurrent) continue;

    const resourceType = prop ? firstElement(prop, 'resourcetype') : null;
    const isCollection =
      (resourceType !== null && elementsByLocalName(resourceType, 'collection').length > 0) ||
      href.endsWith('/');
    const displayName = prop ? elementText(firstElement(prop, 'displayname')) : '';
    const name = baseName(path) || displayName || href.split('/').filter(Boolean).pop() || path;

    const entry: DavEntry = {
      path,
      name,
      isCollection,
      size: isCollection ? undefined : parseSize(prop ? elementText(firstElement(prop, 'getcontentlength')) : ''),
      lastModified: parseDate(
        prop
          ? elementText(firstElement(prop, 'getlastmodified')) ||
              elementText(firstElement(prop, 'creationdate'))
          : '',
      ),
      etag: prop ? elementText(firstElement(prop, 'getetag')) || undefined : undefined,
      contentType: prop ? elementText(firstElement(prop, 'getcontenttype')) || undefined : undefined,
      href,
    };

    const existing = entries.get(path);
    // 同一路径既返回带 / 又返回不带 / 时，以「集合」为准
    if (!existing || (isCollection && !existing.isCollection)) entries.set(path, entry);
  }

  return { entries: [...entries.values()], failedStatuses, responseCount: responses.length };
}

function decodeTextBuffer(buffer: ArrayBuffer, contentType?: string): string {
  const charsetMatch = /charset\s*=\s*["']?([-\w]+)/i.exec(contentType ?? '');
  const hinted = charsetMatch?.[1]?.toLowerCase();
  const candidates = [hinted, 'utf-8', 'gb18030'].filter(
    (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
  );

  let best = '';
  let bestReplacements = Number.POSITIVE_INFINITY;
  for (const encoding of candidates) {
    try {
      const decoded = new TextDecoder(encoding).decode(buffer);
      const replacements = (decoded.match(/\uFFFD/g) ?? []).length;
      if (replacements < bestReplacements) {
        best = decoded;
        bestReplacements = replacements;
      }
      if (replacements === 0) break;
    } catch {
      // 浏览器不支持该编码，跳过
    }
  }
  const text = best || new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return text.replace(/^\uFEFF/, '');
}

/** WebDAV 客户端：所有请求都直接发往用户填写的服务端，不经过任何后端代理 */
export class WebDavClient {
  constructor(readonly credentials: Credentials) {}

  get rootUrl(): string {
    return this.credentials.rootUrl;
  }

  private baseHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {};
    const { username, password } = this.credentials;
    if (username || password) {
      headers.Authorization = `Basic ${utf8ToBase64(`${username}:${password}`)}`;
    }
    return { ...headers, ...extra };
  }

  /** 基于 fetch 的通用请求，用于 PROPFIND / GET / DELETE / MOVE / MKCOL */
  private async request(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<RawResponse> {
    const url = buildResourceUrl(this.credentials.rootUrl, path, options.isCollection ?? false);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? CONFIG.REQUEST_TIMEOUT_MS);

    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener('abort', forwardAbort, { once: true });

    let raw: Response;
    try {
      raw = await fetch(url, {
        method,
        headers: this.baseHeaders(options.headers),
        body: options.body ?? undefined,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
      });
    } catch (error) {
      if (timedOut) {
        throw new WebDavError(
          classifyHttpError({
            status: 0,
            method,
            path,
            body: `请求在 ${Math.round((options.timeoutMs ?? CONFIG.REQUEST_TIMEOUT_MS) / 1000)} 秒内未响应`,
          }),
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', forwardAbort);
    }

    const text = await raw.text();
    return {
      status: raw.status,
      statusText: raw.statusText,
      headers: collectFetchHeaders(raw),
      body: text,
      method,
      path,
      url,
      raw,
    };
  }

  private assertSuccess(response: RawResponse): void {
    if (response.status >= 200 && response.status < 300) return;
    throw new WebDavError(
      classifyHttpError({
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: typeof response.body === 'string' ? response.body : '',
        method: response.method,
        path: response.path,
      }),
    );
  }

  /** PROPFIND Depth:1 列目录。若服务端拒绝 XML 请求体，自动回退为无请求体 PROPFIND。 */
  async propfind(path = '/', signal?: AbortSignal): Promise<DavEntry[]> {
    let xml = '';
    const depth = String(CONFIG.PROPFIND_DEPTH);
    let response = await this.request('PROPFIND', path, {
      isCollection: true,
      headers: { Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND_BODY,
      signal,
    });

    if ([400, 415, 501, 422].includes(response.status)) {
      response = await this.request('PROPFIND', path, {
        isCollection: true,
        headers: { Depth: depth },
        signal,
      });
    }
    this.assertSuccess(response);
    xml = typeof response.body === 'string' ? response.body : '';

    if (!xml.trim()) {
      throw new WebDavError({
        category: 'protocol',
        title: '目录响应为空',
        message: '服务端返回了成功状态但没有 multistatus 内容。',
        method: 'PROPFIND',
        suggestions: ['确认 WebDAV 服务端正确实现了 PROPFIND Depth: 1。'],
      });
    }

    const { entries, failedStatuses, responseCount } = parseMultistatus(
      xml,
      this.credentials.rootUrl,
      path,
    );
    // 空目录是合法的；只有连一个 <response> 都没有时才判定为协议异常
    if (responseCount === 0) {
      const failed = describeMultistatusErrors(failedStatuses);
      throw new WebDavError({
        category: 'protocol',
        title: 'PROPFIND 响应中没有资源记录',
        message: `服务端返回的 multistatus 不含任何 <response>${failed ? `（状态：${failed}）` : ''}。`,
        method: 'PROPFIND',
        detail: xml.slice(0, 600),
        suggestions: ['确认账号对该目录有读取权限，且服务端 WebDAV 模块配置正确。'],
      });
    }
    return entries;
  }

  /** 连接测试：读取根目录，任何失败都会抛出带分类的 WebDavError */
  async testConnection(signal?: AbortSignal): Promise<void> {
    await this.propfind('/', signal);
  }

  /**
   * GET 并以流的方式累积 Blob，可上报真实下载进度；maxBytes 用于在超大文件时提前中断读取。
   */
  async getBlob(
    path: string,
    options: {
      onProgress?: (snapshot: ProgressSnapshot) => void;
      signal?: AbortSignal;
      maxBytes?: number;
    } = {},
  ): Promise<Blob> {
    const url = buildResourceUrl(this.credentials.rootUrl, path, false);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CONFIG.REQUEST_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener('abort', forwardAbort, { once: true });

    let raw: Response;
    try {
      raw = await fetch(url, {
        method: 'GET',
        headers: this.baseHeaders(),
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (error) {
      if (timedOut) {
        throw new WebDavError(classifyHttpError({ status: 0, method: 'GET', path, body: '读取超时' }));
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', forwardAbort);
    }

    const headers = collectFetchHeaders(raw);
    if (!raw.ok) {
      const body = await raw.text().catch(() => '');
      throw new WebDavError(
        classifyHttpError({
          status: raw.status,
          statusText: raw.statusText,
          headers,
          body,
          method: 'GET',
          path,
        }),
      );
    }

    const contentLength = Number(headers['content-length'] ?? 0) || 0;
    const maxBytes = options.maxBytes;
    if (maxBytes !== undefined && contentLength > maxBytes) {
      await raw.body?.cancel().catch(() => undefined);
      throw new PreviewTooLargeError(contentLength, maxBytes);
    }

    const stream = raw.body;
    if (!stream) {
      const blob = await raw.blob();
      if (maxBytes !== undefined && blob.size > maxBytes) throw new PreviewTooLargeError(blob.size, maxBytes);
      options.onProgress?.({ loaded: blob.size, total: blob.size });
      return blob;
    }

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value as Uint8Array;
        if (maxBytes !== undefined && loaded + chunk.byteLength > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new PreviewTooLargeError(contentLength || loaded + chunk.byteLength, maxBytes);
        }
        chunks.push(chunk);
        loaded += chunk.byteLength;
        options.onProgress?.({ loaded, total: contentLength || loaded });
      }
    } finally {
      reader.releaseLock();
    }

    const blob = new Blob(chunks as BlobPart[], { type: headers['content-type'] || 'application/octet-stream' });
    if (maxBytes !== undefined && blob.size > maxBytes) throw new PreviewTooLargeError(blob.size, maxBytes);
    return blob;
  }

  /** 读取文本文件，默认应用 1 MB 预览上限 */
  async getText(
    path: string,
    options: {
      signal?: AbortSignal;
      onProgress?: (snapshot: ProgressSnapshot) => void;
      maxBytes?: number;
      knownSize?: number;
    } = {},
  ): Promise<string> {
    const limit = options.maxBytes ?? CONFIG.MAX_PREVIEW_SIZE;
    if (options.knownSize !== undefined && options.knownSize > limit) {
      throw new PreviewTooLargeError(options.knownSize, limit);
    }
    const blob = await this.getBlob(path, {
      signal: options.signal,
      onProgress: options.onProgress,
      maxBytes: limit,
    });
    const buffer = await blob.arrayBuffer();
    return decodeTextBuffer(buffer, blob.type);
  }

  /**
   * 用 XMLHttpRequest 执行 PUT —— fetch 无法上报上传进度。
   */
  async put(
    path: string,
    body: Blob | string,
    options: {
      contentType?: string;
      overwrite?: boolean;
      onProgress?: (snapshot: ProgressSnapshot) => void;
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ): Promise<void> {
    const url = buildResourceUrl(this.credentials.rootUrl, path, false);
    const payload: Blob =
      typeof body === 'string'
        ? new Blob([body], { type: options.contentType || 'text/plain; charset=utf-8' })
        : body;
    const headers = this.baseHeaders({
      'Content-Type': options.contentType || payload.type || 'application/octet-stream',
      Overwrite: options.overwrite === false ? 'F' : 'T',
    });
    const timeout = options.timeoutMs ?? CONFIG.REQUEST_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let canceledByCaller = false;
      const abort = () => {
        canceledByCaller = true;
        xhr.abort();
      };
      options.signal?.addEventListener('abort', abort, { once: true });

      xhr.open('PUT', url, true);
      xhr.timeout = timeout;
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (event) => {
        options.onProgress?.({ loaded: event.loaded, total: event.total || payload.size });
      };
      xhr.onload = () => {
        options.signal?.removeEventListener('abort', abort);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        reject(
          new WebDavError(
            classifyHttpError({
              status: xhr.status,
              statusText: xhr.statusText,
              headers: parseXhrHeaders(xhr.getAllResponseHeaders()),
              body: xhr.responseText || '',
              method: 'PUT',
              path,
            }),
          ),
        );
      };
      xhr.onerror = () => {
        options.signal?.removeEventListener('abort', abort);
        reject(new TypeError('Failed to fetch（网络错误或 CORS 拦截）'));
      };
      xhr.ontimeout = () => {
        options.signal?.removeEventListener('abort', abort);
        reject(
          new WebDavError(classifyHttpError({ status: 0, method: 'PUT', path, body: '上传超时' })),
        );
      };
      xhr.onabort = () => {
        options.signal?.removeEventListener('abort', abort);
        reject(canceledByCaller ? new DOMException('Aborted', 'AbortError') : new Error('上传被中断'));
      };
      xhr.send(payload);
    });
  }

  /** 上传本地文件；targetPath 为完整的目标路径 */
  async uploadFile(
    targetPath: string,
    file: File,
    onProgress?: (snapshot: ProgressSnapshot) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.put(targetPath, file, {
      contentType: file.type || 'application/octet-stream',
      onProgress,
      signal,
    });
  }

  /** 保存文本内容到原文件（Markdown / 文本编辑） */
  async saveText(path: string, text: string, signal?: AbortSignal): Promise<void> {
    const ext = extensionOf(baseName(path));
    const mime = TEXT_MIME[ext] ?? 'text/plain';
    await this.put(path, text, {
      contentType: `${mime}; charset=utf-8`,
      signal,
    });
  }

  async delete(path: string, isCollection: boolean): Promise<void> {
    const response = await this.request('DELETE', path, { isCollection });
    this.assertSuccess(response);
  }

  async move(fromPath: string, toPath: string, isCollection: boolean): Promise<void> {
    const destination = buildResourceUrl(this.credentials.rootUrl, toPath, isCollection);
    const response = await this.request('MOVE', fromPath, {
      isCollection,
      headers: { Destination: destination, Overwrite: 'F' },
    });
    this.assertSuccess(response);
  }

  async mkcol(parentPath: string, name: string): Promise<void> {
    const target = joinPath(parentPath, name);
    const response = await this.request('MKCOL', target, { isCollection: true });
    this.assertSuccess(response);
  }
}
