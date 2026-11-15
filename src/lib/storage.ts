import { CONFIG } from '../config';
import type { ConnectionFormState, StoredConnection, UiPreferences } from '../types';

/**
 * 连接信息仅写入当前浏览器的 localStorage。
 * 密码默认不落盘：只有 rememberPassword === true 时才写入（且是明文，界面上有风险提示）。
 */
function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式 / 存储配额受限时静默失败，不影响当前会话使用
  }
}

export function loadStoredConnection(): StoredConnection | null {
  const stored = readJson<StoredConnection>(CONFIG.STORAGE_KEYS.connection);
  if (!stored || typeof stored.rootUrl !== 'string') return null;
  return {
    rootUrl: stored.rootUrl,
    username: typeof stored.username === 'string' ? stored.username : '',
    // 兼容旧数据：只有在显式标记 rememberPassword 时才把密码带出来
    password: stored.rememberPassword && typeof stored.password === 'string' ? stored.password : undefined,
    rememberPassword: Boolean(stored.rememberPassword),
    savedAt: stored.savedAt,
  };
}

/** 保存连接信息。取消勾选「记住密码」时会把已落盘的密码一并删除。 */
export function saveConnection(form: ConnectionFormState): void {
  const stored: StoredConnection = {
    rootUrl: form.rootUrl,
    username: form.username,
    rememberPassword: form.rememberPassword,
    savedAt: new Date().toISOString(),
  };
  if (form.rememberPassword) stored.password = form.password;
  writeJson(CONFIG.STORAGE_KEYS.connection, stored);
}

/** 清除连接信息：同时移除所有可能保存过的凭据。 */
export function clearConnection(): void {
  const keys: string[] = [CONFIG.STORAGE_KEYS.connection];
  try {
    // 顺带清理历史版本 / 自定义键里可能残留的凭据
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && /^webdav\./i.test(key) && /password|credential|auth|secret/i.test(key)) keys.push(key);
    }
    for (const key of new Set(keys)) window.localStorage.removeItem(key);
  } catch {
    // localStorage 不可用时忽略
  }
}

export function loadUiPreferences(): UiPreferences {
  return readJson<UiPreferences>(CONFIG.STORAGE_KEYS.ui) ?? {};
}

export function saveUiPreferences(patch: Partial<UiPreferences>): void {
  writeJson(CONFIG.STORAGE_KEYS.ui, { ...loadUiPreferences(), ...patch });
}
