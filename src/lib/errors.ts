import { CORS_EXAMPLE } from '../config';
import type { DavErrorInfo, ErrorCategory, HttpMethod } from '../types';

/** 携带「分类 + 原因 + 处理建议」的应用级错误 */
export class WebDavError extends Error {
  readonly info: DavErrorInfo;

  constructor(info: DavErrorInfo) {
    super(info.message);
    this.name = 'WebDavError';
    this.info = info;
  }
}

export class PreviewTooLargeError extends Error {
  constructor(public readonly size: number, public readonly limit: number) {
    super(`文件内容超过预览上限（${size} > ${limit} 字节）`);
    this.name = 'PreviewTooLargeError';
  }
}

export class AbortedError extends Error {
  constructor() {
    super('请求已被取消');
    this.name = 'AbortedError';
  }
}

const CORS_SUGGESTIONS = [
  '确认 WebDAV 服务端允许来自当前站点来源的跨域请求；浏览器无法绕过 CORS，纯前端应用不能自行添加代理。',
  '在服务端（或反向代理）补充响应头：\n' + CORS_EXAMPLE,
  '确认 OPTIONS 预检请求返回 2xx，并放行 Authorization、Depth、Destination、Overwrite、Content-Type 等请求头。',
  '若本站点通过 HTTPS 访问，WebDAV 地址也必须使用 HTTPS，否则会被浏览器的混合内容策略拦截。',
  '若使用自签名证书，请先在浏览器新标签页中单独打开 WebDAV 地址并信任该证书。',
];

const NETWORK_SUGGESTIONS = [
  '检查 WebDAV 地址是否可从当前浏览器访问（协议、域名、端口、路径是否正确）。',
  '确认服务端正在运行，且防火墙 / 反向代理未拦截请求。',
  '检查是否存在 CORS 限制或混合内容（HTTPS 页面请求 HTTP 服务）拦截，详见下方 CORS 说明。',
  '打开浏览器开发者工具的 Network 与 Console 面板，查看预检请求或失败请求的具体信息。',
];

function base(category: ErrorCategory, title: string, message: string, suggestions: string[]): DavErrorInfo {
  return { category, title, message, suggestions };
}

/** 把「fetch/XHR 抛出的底层异常」转成可读的网络 / CORS 错误 */
export function classifyNetworkError(err: unknown, method?: HttpMethod): DavErrorInfo {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  const looksLikeCors =
    /cors|access-control|cross-origin|preflight|blocked by.*policy|not allowed by access-control/i.test(lower);

  if (looksLikeCors) {
    return {
      ...base(
        'cors',
        '跨域（CORS）请求被浏览器拦截',
        `发起 ${method ?? 'WebDAV'} 请求时被同源策略拦截：${raw || '未返回具体信息'}`,
        CORS_SUGGESTIONS,
      ),
      method,
      detail: raw,
    };
  }

  return {
    ...base(
      'network',
      '无法连接到 WebDAV 服务',
      `网络请求失败（${method ?? '请求'}）：${raw || '浏览器未提供具体原因，通常与网络、CORS 或混合内容有关'}`,
      NETWORK_SUGGESTIONS,
    ),
    method,
    detail: raw,
  };
}

/** 依据 HTTP 状态码分类，并给出对应的处理建议 */
export function classifyHttpError(params: {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  method?: HttpMethod;
  path?: string;
}): DavErrorInfo {
  const { status, statusText = '', headers = {}, body = '', method, path } = params;
  const wwwAuth = headers['www-authenticate'] ?? '';
  const snippet = body.trim().slice(0, 600);
  const common = { status, method, detail: snippet || statusText || wwwAuth || undefined };

  const withCommon = (info: DavErrorInfo): DavErrorInfo => ({ ...info, ...common });

  if (status === 0) {
    return withCommon(
      base('network', '请求未完成', '浏览器未收到响应，通常是网络中断、超时或被 CORS / 混合内容策略拦截。', NETWORK_SUGGESTIONS),
    );
  }

  if (status === 401 || status === 407) {
    const digest = /digest/i.test(wwwAuth);
    const negotiate = /negotiate|ntlm|bearer|oauth/i.test(wwwAuth);
    if (digest || negotiate) {
      return withCommon(
        base(
          'unsupported-auth',
          '服务端要求了暂不支持的认证方式',
          `服务端返回 WWW-Authenticate: ${wwwAuth || '(未提供)'}。本工具只支持 HTTP Basic Auth（及匿名访问），无法在纯前端安全地完成 Digest / NTLM / Negotiate / OAuth 认证。`,
          [
            '在 WebDAV 服务端启用 HTTP Basic Auth（建议同时启用 HTTPS），然后重新连接。',
            '若必须使用 Digest / NTLM / OAuth，请改用支持该认证方式的原生客户端或带后端代理的方案。',
            '注意：即使浏览器地址栏能直接访问 Digest 资源，跨域的 fetch / XHR 预检仍会失败。',
          ],
        ),
      );
    }
    return withCommon(
      base(
        'auth',
        '认证失败（401）',
        '用户名或密码不正确，或服务端未启用 HTTP Basic Auth。' +
          (snippet ? ` 服务端响应：${snippet.slice(0, 200)}` : ''),
        [
          '检查用户名与密码（注意部分服务需要使用「应用专用密码」而不是账号登录密码）。',
          '确认服务端启用了 HTTP Basic Auth，且根 URL 路径正确（例如 Nextcloud 通常是 /remote.php/dav/files/<用户名>/）。',
          '确认反向代理没有剥离 Authorization 请求头。',
          '确认 CORS 的 Access-Control-Allow-Headers 中包含 Authorization。',
          '若根 URL 会发生跨域重定向（如 http → https 或补尾斜杠），浏览器会剥离 Authorization 头，请直接填写最终地址。',
        ],
      ),
    );
  }

  if (status === 403) {
    return withCommon(
      base(
        'permission',
        '没有权限（403）',
        '服务端拒绝了本次操作：账号可能没有读 / 写权限，或服务端策略禁用了该方法。',
        [
          '确认账号对当前目录拥有读取、写入、删除权限。',
          '确认服务端 WebDAV 模块允许该方法（部分服务默认禁用 PUT / DELETE / MOVE / MKCOL）。',
          '确认 CORS 的 Access-Control-Allow-Methods 中包含本次使用的方法。',
          '若访问的是只读共享链接，请改用具备写权限的账号。',
        ],
      ),
    );
  }

  if (status === 404) {
    return withCommon(
      base(
        'not-found',
        '资源不存在（404）',
        `找不到路径 ${path ?? ''}：可能已被删除、重命名，或 WebDAV 根 URL 填错。`,
        [
          '点击「刷新」重新读取目录。',
          '检查连接设置中的 WebDAV 根 URL 是否指向真实的 WebDAV 端点（而不是网站首页）。',
          '检查路径中是否包含特殊字符；本工具已对每段路径做 URL 编码，但个别服务端仍有兼容问题。',
        ],
      ),
    );
  }

  if (status === 405 || status === 501) {
    return withCommon(
      base(
        'method',
        `${method ?? '该'} 方法不被支持（${status}）`,
        '服务端或反向代理未实现 / 未放行该 WebDAV 方法，也可能是 CORS 允许的 methods 列表不完整。',
        [
          '确认 WebDAV 服务端已启用完整 DAV 支持（PROPFIND / MKCOL / MOVE / PUT / DELETE）。',
          '确认反向代理（Nginx / Apache / Caddy）转发了非标准 HTTP 方法，没有把它们改写或拒绝。',
          '确认 CORS 的 Access-Control-Allow-Methods 包含：GET, HEAD, PUT, DELETE, MOVE, MKCOL, PROPFIND, OPTIONS。',
          '某些对象存储或网盘的「WebDAV 网关」只实现了只读方法，写操作需要换用其原生 API。',
        ],
      ),
    );
  }

  if (status === 409) {
    return withCommon(
      base(
        'conflict',
        '操作冲突（409）',
        '目标路径的父目录不存在、名称冲突，或服务端检测到中间目录缺失。',
        [
          '确认父目录仍然存在（新建文件夹 / 上传前请先刷新目录）。',
          '确认名称没有与现有项目冲突。',
          'MKCOL 不会自动创建多级父目录，请逐级创建。',
        ],
      ),
    );
  }

  if (status === 412 || status === 423 || status === 428) {
    return withCommon(
      base(
        'conflict',
        '资源被锁定或条件不满足',
        '文件可能正被其他客户端锁定，或 ETag / If-Match 前置条件不满足。',
        [
          '关闭其他正在编辑该文件的程序后重试。',
          '刷新目录获取最新状态，再重新执行操作。',
        ],
      ),
    );
  }

  if (status === 400) {
    return withCommon(
      base(
        'protocol',
        '请求格式有误（400）',
        '服务端无法解析本次请求，可能是 PROPFIND 请求体或路径编码不被接受。' +
          (snippet ? ` 服务端响应：${snippet.slice(0, 200)}` : ''),
        [
          '本工具会在 PROPFIND 请求体被拒绝时自动改用无请求体方式重试；若仍然失败，请检查服务端实现。',
          '检查路径中是否包含特殊字符或过长的名称。',
          '确认反向代理没有改写 Depth / Content-Type 等请求头。',
        ],
      ),
    );
  }

  if (status === 413 || status === 507) {
    return withCommon(
      base('server', '服务端容量限制', '文件超过服务端单文件大小限制，或服务器存储空间不足。', [
        '检查服务端上传体积限制（Nginx client_max_body_size 等）。',
        '清理服务端存储空间后重试。',
      ]),
    );
  }

  if (status >= 500) {
    return withCommon(
      base(
        'server',
        `服务端错误（${status}）`,
        'WebDAV 服务内部出错。' + (snippet ? ` 响应片段：${snippet.slice(0, 200)}` : ''),
        [
          '查看服务端日志定位具体错误。',
          '稍后重试；若持续出现，检查服务端磁盘、权限与 WebDAV 模块配置。',
        ],
      ),
    );
  }

  if (status >= 300) {
    return withCommon(
      base(
        'protocol',
        `意外的响应状态（${status}）`,
        `服务端返回了 ${status} ${statusText}。WebDAV 的 PROPFIND 应返回 207，写操作应返回 2xx。`,
        [
          '确认填写的是 WebDAV 端点地址，而不是会重定向到登录页的普通网页地址。',
          '浏览器跨域时不会暴露 Set-Cookie 或自动完成交互式登录，请改用 Basic Auth。',
        ],
      ),
    );
  }

  return withCommon(
    base('unknown', `请求未完成（${status}）`, `服务端返回 ${status} ${statusText}。`, ['刷新后重试，并查看浏览器 Network 面板。']),
  );
}

/** 任意异常统一转成 DavErrorInfo，供 UI 直接渲染 */
export function asErrorInfo(err: unknown, method?: HttpMethod): DavErrorInfo {
  if (err instanceof WebDavError) return err.info;
  if (err instanceof AbortedError) {
    return base('client', '操作已取消', '本次请求已被取消。', ['如需继续，请重新发起操作。']);
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return base('client', '操作已取消', '本次请求已被取消。', []);
  }
  return classifyNetworkError(err, method);
}

/** 解析 207 Multistatus 中非 2xx 的 <status>，返回错误描述（无则返回 null） */
export function describeMultistatusErrors(statuses: string[]): string | null {
  const failed = statuses.filter((status) => !/\s2\d\d\s/.test(status));
  if (failed.length === 0) return null;
  return failed.slice(0, 3).join('；');
}
