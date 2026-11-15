import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

/**
 * Markdown 渲染的两道安全防线：
 * 1) MarkdownIt({ html: false }) —— 原始 HTML 一律被当作纯文本转义，不进入 DOM。
 * 2) DOMPurify —— 对最终 HTML 再做白名单净化，并过滤链接协议 / 强制 noopener。
 */

const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
  xhtmlOut: false,
});

// 即便 markdown-it 已有默认校验，这里再收紧一次链接协议白名单
const defaultValidateLink = renderer.validateLink.bind(renderer);
renderer.validateLink = (url: string) => {
  if (!defaultValidateLink(url)) return false;
  return /^(https?:|mailto:|ftp:|#|\/|\.\/|\.\.\/)/i.test(url.trim()) || /^[\w.-]+\.(md|txt|html?)$/i.test(url.trim());
};

let hookInstalled = false;
function installSanitizeHooks(): void {
  if (hookInstalled) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const element = node as Element;
    if (element.nodeName === 'A') {
      const href = element.getAttribute('href') ?? '';
      // 移除所有非安全协议（javascript:、data:、vbscript: 等）
      if (!/^(https?:|mailto:|ftp:|#|\/|\.\/|\.\.\/)/i.test(href.trim())) {
        element.removeAttribute('href');
      } else if (/^https?:/i.test(href.trim())) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }
    if (element.nodeName === 'IMG') {
      const src = element.getAttribute('src') ?? '';
      if (/^(data:|javascript:|vbscript:)/i.test(src.trim())) element.removeAttribute('src');
    }
  });
  hookInstalled = true;
}

/** 返回可直接 dangerouslySetInnerHTML 的安全 HTML */
export function renderMarkdown(source: string): string {
  installSanitizeHooks();
  const rawHtml = renderer.render(source);
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: [
      'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
      'textarea', 'select', 'option', 'link', 'meta', 'base', 'svg', 'math',
      'template', 'audio', 'video', 'source', 'track',
    ],
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'onload', 'onerror', 'onclick', 'onmouseover'],
    ALLOW_DATA_ATTR: false,
  });
}
