import { IMAGE_EXTENSIONS, MARKDOWN_EXTENSIONS, TEXT_EXTENSIONS } from '../config';
import type { DavEntry, FileKind } from '../types';
import { extensionOf } from './path';

export function formatBytes(size?: number): string {
  if (size === undefined || !Number.isFinite(size)) return '—';
  if (size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** exponent;
  return `${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[exponent]}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isMarkdownFile(name: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

export function isTextFile(name: string): boolean {
  const ext = extensionOf(name);
  if ((TEXT_EXTENSIONS as readonly string[]).includes(ext)) return true;
  // README / Makefile / Dockerfile 等无扩展名的常见文本
  return /^(readme|license|makefile|dockerfile|changelog|gitignore|env|\.gitignore)$/i.test(name);
}

export function isImageFile(name: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

export function getFileKind(entry: DavEntry): FileKind {
  if (entry.isCollection) return 'folder';
  const ext = extensionOf(entry.name);
  if (isImageFile(entry.name)) return 'image';
  if (isMarkdownFile(entry.name)) return 'markdown';
  if (isTextFile(entry.name)) return 'text';
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'cs', 'rb', 'php', 'sh', 'sql', 'css', 'scss', 'html', 'vue', 'svelte'].includes(ext)) return 'code';
  if (ext === 'pdf') return 'pdf';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz'].includes(ext)) return 'archive';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv'].includes(ext)) return 'video';
  return 'other';
}

export function kindLabel(kind: FileKind): string {
  const labels: Record<FileKind, string> = {
    folder: '文件夹',
    image: '图片',
    markdown: 'Markdown',
    text: '文本',
    code: '代码',
    pdf: 'PDF 文档',
    archive: '压缩包',
    audio: '音频',
    video: '视频',
    other: '文件',
  };
  return labels[kind];
}

/** 侧栏「类型筛选」分组 */
export function matchesKindFilter(kind: FileKind, filter: 'all' | 'folder' | 'document' | 'image' | 'other'): boolean {
  if (filter === 'all') return true;
  if (filter === 'folder') return kind === 'folder';
  if (filter === 'image') return kind === 'image';
  if (filter === 'document') return ['markdown', 'text', 'code', 'pdf'].includes(kind);
  return !['folder', 'image', 'markdown', 'text', 'code', 'pdf'].includes(kind);
}

export function pluralize(count: number, unit: string): string {
  return `${count} ${unit}`;
}
