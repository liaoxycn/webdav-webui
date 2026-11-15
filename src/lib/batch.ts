/**
 * 批量处理的纯逻辑层：ZIP 文件清单收集与浏览器内打包。
 * 不依赖 React，便于单独复用与测试。
 */
import { CONFIG } from '../config';
import { formatBytes } from './format';
import type { WebDavClient } from './webdav';
import type { DavEntry } from '../types';

/** ZIP 任务中「生成压缩包」这一虚拟步骤的 id（不对应 WebDAV 资源） */
export const ZIP_STEP_ID = '__zip_generate__';

/** 超过打包安全上限时抛出，交由 UI 给出明确提示 */
export class BatchLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BatchLimitError';
  }
}

export interface ZipSource {
  /** WebDAV 内部路径 */
  path: string;
  /** 压缩包内的相对路径 */
  zipPath: string;
  size?: number;
}

export interface ZipPlan {
  sources: ZipSource[];
  /** 空文件夹，需要在压缩包中保留目录节点 */
  emptyDirs: string[];
  totalBytes: number;
}

/** 由「当前目录 + 资源完整路径」得到压缩包内的相对路径 */
export function relativeZipPath(basePath: string, fullPath: string): string {
  const prefixLength = basePath === '/' ? 1 : basePath.length + 1;
  return fullPath.slice(prefixLength);
}

/**
 * 递归展开选中的文件夹，收集需要打包的文件。
 * 使用广度优先遍历，逐目录 PROPFIND Depth:1；对文件数、总体积、深度做上限保护。
 */
export async function collectZipPlan(
  client: WebDavClient,
  basePath: string,
  selected: DavEntry[],
  signal: AbortSignal,
): Promise<ZipPlan> {
  const sources: ZipSource[] = [];
  const emptyDirs: string[] = [];
  const queue: Array<{ path: string; zipPath: string; depth: number }> = [];
  let totalBytes = 0;

  const addFile = (entry: DavEntry) => {
    sources.push({
      path: entry.path,
      zipPath: relativeZipPath(basePath, entry.path),
      size: entry.size,
    });
    totalBytes += entry.size ?? 0;
    if (sources.length > CONFIG.ZIP_MAX_FILES) {
      throw new BatchLimitError(
        `选中内容超过 ${CONFIG.ZIP_MAX_FILES} 个文件的打包上限，请缩小选择范围后重试。`,
      );
    }
    if (totalBytes > CONFIG.ZIP_MAX_TOTAL_BYTES) {
      throw new BatchLimitError(
        `选中内容总大小超过 ${formatBytes(CONFIG.ZIP_MAX_TOTAL_BYTES)} 的打包上限，请分批下载。`,
      );
    }
  };

  for (const entry of selected) {
    const zipPath = relativeZipPath(basePath, entry.path);
    if (entry.isCollection) queue.push({ path: entry.path, zipPath, depth: 1 });
    else addFile(entry);
  }

  while (queue.length > 0) {
    if (signal.aborted) throw new DOMException('Batch canceled', 'AbortError');
    const dir = queue.shift()!;
    if (dir.depth > CONFIG.ZIP_MAX_DEPTH) continue;
    const children = await client.propfind(dir.path, signal);
    if (children.length === 0) emptyDirs.push(`${dir.zipPath}/`);
    for (const child of children) {
      const childZipPath = relativeZipPath(basePath, child.path);
      if (child.isCollection) queue.push({ path: child.path, zipPath: childZipPath, depth: dir.depth + 1 });
      else addFile(child);
    }
  }

  return { sources, emptyDirs, totalBytes };
}

/** JSZip 的最小使用面（避免把整个库类型耦合进业务逻辑） */
export interface ZipArchive {
  file(name: string, data: Blob): void;
  folder(name: string): void;
  generateAsync(
    options: {
      type: 'blob';
      compression: 'DEFLATE';
      compressionOptions: { level: number };
      mimeType: string;
    },
    onUpdate?: (metadata: { percent: number }) => void,
  ): Promise<Blob>;
}

/**
 * 按需加载 JSZip。通过动态 import 形成独立 chunk，
 * 只有用户真正点击「打包下载」时才会下载，不影响首屏体积。
 */
export async function createZipArchive(): Promise<ZipArchive> {
  const { default: JSZip } = await import('jszip');
  return new JSZip() as ZipArchive;
}

export function zipGenerateOptions() {
  return {
    type: 'blob' as const,
    compression: 'DEFLATE' as const,
    compressionOptions: { level: CONFIG.ZIP_COMPRESSION_LEVEL },
    mimeType: 'application/zip',
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortedError')
  );
}

/** 生成默认 zip 文件名，如 webdav-文档-20261115-2130.zip */
export function defaultZipName(directoryName: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const safe = directoryName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  return `webdav-${safe || 'files'}-${stamp}.zip`;
}
