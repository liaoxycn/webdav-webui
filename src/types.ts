/**
 * 全局类型定义。
 * 约定：应用内部的 `path` 一律为「相对 WebDAV 根 URL 的解码后路径」，
 * 以 `/` 开头、根目录为 `/`、结尾不带 `/`（集合的尾部斜杠只在发请求时补齐）。
 */

export interface Credentials {
  /** WebDAV 根 URL，例如 https://dav.example.com/remote.php/dav/files/alice/ */
  rootUrl: string;
  /** HTTP Basic Auth 用户名；空字符串表示匿名访问 */
  username: string;
  /** HTTP Basic Auth 密码；未勾选「记住密码」时仅存在于内存 */
  password: string;
}

/** 浏览器 localStorage 中持久化的连接信息 */
export interface StoredConnection {
  rootUrl: string;
  username: string;
  /** 仅当 rememberPassword === true 时写入 */
  password?: string;
  rememberPassword: boolean;
  savedAt?: string;
}

/** 连接表单的完整状态（含仅内存中的密码） */
export interface ConnectionFormState extends Credentials {
  rememberPassword: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** PROPFIND 解析后得到的一条资源记录 */
export interface DavEntry {
  /** 解码后的内部路径，如 /照片/2024/img 1.png */
  path: string;
  /** 展示用文件名 */
  name: string;
  isCollection: boolean;
  /** 字节数；集合或服务端未提供时为 undefined */
  size?: number;
  /** ISO 字符串（解析失败时为 undefined） */
  lastModified?: string;
  etag?: string;
  contentType?: string;
  /** 服务端返回的原始 href，便于调试 */
  href: string;
}

export type FileKind =
  | 'folder'
  | 'image'
  | 'markdown'
  | 'text'
  | 'code'
  | 'pdf'
  | 'archive'
  | 'audio'
  | 'video'
  | 'other';

export type ViewMode = 'list' | 'grid';
export type SortKey = 'name-asc' | 'name-desc' | 'size-desc' | 'modified-desc';
export type KindFilter = 'all' | 'folder' | 'document' | 'image' | 'other';

export type HttpMethod = 'PROPFIND' | 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'MOVE' | 'MKCOL';

export interface DavResponse {
  status: number;
  statusText: string;
  /** 小写 header 名 -> 值 */
  headers: Record<string, string>;
  body: string | Blob | ArrayBuffer | null;
}

export interface DavRequestOptions {
  method: HttpMethod;
  path: string;
  /** 集合（文件夹）需要在 URL 末尾补 `/` */
  isCollection?: boolean;
  headers?: Record<string, string>;
  body?: string | Blob | ArrayBuffer | null;
  responseType?: 'text' | 'blob' | 'arraybuffer';
  onUploadProgress?: (loaded: number, total: number) => void;
  onDownloadProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
  /** 单次请求超时（毫秒） */
  timeoutMs?: number;
}

export type ErrorCategory =
  | 'network'
  | 'cors'
  | 'auth'
  | 'unsupported-auth'
  | 'permission'
  | 'not-found'
  | 'conflict'
  | 'method'
  | 'server'
  | 'path'
  | 'protocol'
  | 'client'
  | 'unknown';

/** 分类后的错误，直接驱动 UI 上的「原因 + 处理建议」 */
export interface DavErrorInfo {
  category: ErrorCategory;
  title: string;
  message: string;
  suggestions: string[];
  status?: number;
  /** 服务端 WWW-Authenticate / 响应片段等诊断信息 */
  detail?: string;
  method?: HttpMethod;
}

export interface ProgressSnapshot {
  loaded: number;
  total: number;
}

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error' | 'skipped' | 'canceled';

export interface UploadTask {
  id: string;
  file: File;
  /** 实际写入的目标文件名（可能因「自动重命名」变化） */
  targetName: string;
  status: UploadStatus;
  loaded: number;
  total: number;
  error?: string;
}

export type ConflictChoice = 'overwrite' | 'rename' | 'skip';

export interface PendingConflict {
  name: string;
  /** 触发冲突的操作，用于让对话框文案区分「上传」与「移动」 */
  context?: 'upload' | 'move';
  resolve: (choice: ConflictChoice, applyToAll: boolean) => void;
}

/* ------------------------------ 批量处理 ------------------------------ */

export type BatchKind = 'delete' | 'download' | 'move' | 'zip';
export type BatchItemStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped' | 'canceled';

/** 批量任务中的一项；id 通常为资源的内部路径 */
export interface BatchItem {
  id: string;
  /** 展示名称（ZIP 场景为压缩包内的相对路径） */
  name: string;
  status: BatchItemStatus;
  detail?: string;
  loaded?: number;
  total?: number;
  isCollection?: boolean;
}

export interface BatchJob {
  id: string;
  kind: BatchKind;
  title: string;
  items: BatchItem[];
  finished: boolean;
  canceled: boolean;
}

/** 目录选择器返回的目标信息 */
export interface MoveTarget {
  path: string;
  existingNames: string[];
}

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

export interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
}

export interface InputDialogState {
  title: string;
  label: string;
  initialValue: string;
  placeholder?: string;
  confirmLabel: string;
  description?: string;
  validate: (value: string) => string | null;
  onSubmit: (value: string) => void | Promise<void>;
}

export interface UiPreferences {
  theme?: 'light' | 'dark';
  viewMode?: ViewMode;
  pageSize?: number;
}
