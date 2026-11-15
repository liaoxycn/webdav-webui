import { safeDownloadName } from './path';

/** 通过 Blob URL 触发浏览器原生下载（WebDAV 需要 Authorization，不能用普通 <a href>） */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeDownloadName(filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 延迟回收，避免部分浏览器下载尚未开始就释放 URL
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function makeObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
