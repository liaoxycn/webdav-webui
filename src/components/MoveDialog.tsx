import { useEffect, useState } from 'react';
import { ChevronRight, CornerUpLeft, Folder, FolderInput, Home, Loader2, ShieldAlert, X } from 'lucide-react';
import { asErrorInfo } from '../lib/errors';
import { dirName, pathSegments } from '../lib/path';
import type { WebDavClient } from '../lib/webdav';
import type { DavEntry } from '../types';
import { Modal } from './Overlays';

interface Props {
  open: boolean;
  client: WebDavClient;
  /** 打开时所在的目录（当前浏览目录） */
  initialPath: string;
  /** 选中项目所在的目录，移动到同目录视为无效 */
  sourcePath: string;
  /** 被移动的文件夹路径，用于阻止「移动到自身 / 子目录」 */
  blockedPaths: string[];
  count: number;
  onClose: () => void;
  onConfirm: (targetPath: string) => void;
}

/** 批量移动的目标目录选择器：逐层 PROPFIND 浏览文件夹 */
export function MoveDialog({
  open,
  client,
  initialPath,
  sourcePath,
  blockedPaths,
  count,
  onClose,
  onConfirm,
}: Props) {
  const [path, setPath] = useState(initialPath);
  const [dirs, setDirs] = useState<DavEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setPath(initialPath);
  }, [open, initialPath]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    client
      .propfind(path, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return;
        setDirs(
          entries
            .filter((entry) => entry.isCollection)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true })),
        );
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(asErrorInfo(err, 'PROPFIND').message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, path, client]);

  if (!open) return null;

  const invalidReason =
    path === sourcePath
      ? '所选项目已经位于此目录中，请选择其他目标位置。'
      : blockedPaths.some((blocked) => path === blocked || path.startsWith(`${blocked}/`))
        ? '不能把文件夹移动到它自己或它的子目录中。'
        : null;

  return (
    <Modal open onClose={onClose} size="md" ariaLabel="选择移动目标文件夹">
      <div className="dialog__head">
        <div className="dialog__icon"><FolderInput size={17} /></div>
        <div>
          <h2 className="dialog__title">移动到文件夹</h2>
          <div className="dialog__subtitle">将 {count} 个项目移动至下方选定的目录</div>
        </div>
        <div className="dialog__head-actions">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="dialog__body">
        <nav className="move-crumbs" aria-label="目标目录路径">
          <button type="button" className="crumb" onClick={() => setPath('/')}>
            <Home size={13} /> 根目录
          </button>
          {pathSegments(path).map((segment, index, array) => (
            <span key={segment.path} className="move-crumbs__seg">
              <ChevronRight size={13} className="crumb__sep" />
              <button
                type="button"
                className={`crumb ${index === array.length - 1 ? 'crumb--current' : ''}`}
                onClick={() => setPath(segment.path)}
                disabled={index === array.length - 1}
              >
                {segment.name}
              </button>
            </span>
          ))}
          <button
            type="button"
            className="icon-btn"
            style={{ width: 26, height: 26, marginLeft: 'auto' }}
            onClick={() => setPath(dirName(path))}
            disabled={path === '/'}
            title="返回上级"
            aria-label="返回上级"
          >
            <CornerUpLeft size={14} />
          </button>
        </nav>

        <div className="move-list">
          {loading ? (
            <div className="move-list__hint"><Loader2 size={15} className="spinner" /> 正在读取文件夹…</div>
          ) : error ? (
            <div className="move-list__hint move-list__hint--error">{error}</div>
          ) : dirs.length === 0 ? (
            <div className="move-list__hint">此目录下没有子文件夹，可直接选择当前目录作为目标。</div>
          ) : (
            dirs.map((dir) => (
              <button
                key={dir.path}
                type="button"
                className="move-list__item"
                onClick={() => setPath(dir.path)}
              >
                <Folder size={16} />
                <span>{dir.name}</span>
                <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.6 }} />
              </button>
            ))
          )}
        </div>

        {invalidReason && (
          <div className="notice notice--danger" style={{ marginTop: 12 }}>
            <ShieldAlert size={15} className="notice__icon" />
            <span>{invalidReason}</span>
          </div>
        )}
        <p className="dialog__text" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          目标：<code className="move-target">{path}</code>
          {invalidReason ? '' : ' · 若存在同名项目，下一步会逐项询问如何处理'}
        </p>
      </div>

      <div className="dialog__foot">
        <button type="button" className="btn" onClick={onClose}>取消</button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={Boolean(invalidReason) || loading}
          onClick={() => onConfirm(path)}
        >
          选择此文件夹
        </button>
      </div>
    </Modal>
  );
}
