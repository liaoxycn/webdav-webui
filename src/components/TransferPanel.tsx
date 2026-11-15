import {
  CheckCircle2,
  DownloadCloud,
  FileUp,
  Minus,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import { formatBytes } from '../lib/format';
import type { UploadTask } from '../types';

export interface DownloadProgress {
  name: string;
  loaded: number;
  total: number;
  done: boolean;
}

interface Props {
  tasks: UploadTask[];
  download: DownloadProgress | null;
  onClose: () => void;
  onClearFinished: () => void;
  onCancel: (id: string) => void;
}

function statusText(task: UploadTask): string {
  switch (task.status) {
    case 'pending':
      return '等待上传';
    case 'uploading':
      return `${formatBytes(task.loaded)} / ${formatBytes(task.total || task.file.size)}`;
    case 'done':
      return `已完成 · ${formatBytes(task.total || task.file.size)}`;
    case 'error':
      return task.error ?? '上传失败';
    case 'skipped':
      return '已跳过（同名文件）';
    case 'canceled':
      return '已取消';
    default:
      return '';
  }
}

export function TransferPanel({ tasks, download, onClose, onClearFinished, onCancel }: Props) {
  if (tasks.length === 0 && !download) return null;

  const active = tasks.filter((task) => task.status === 'uploading' || task.status === 'pending').length;
  const done = tasks.filter((task) => task.status === 'done').length;
  const failed = tasks.filter((task) => task.status === 'error').length;
  const overallTotal = tasks.reduce((sum, task) => sum + (task.total || task.file.size), 0);
  const overallLoaded = tasks.reduce((sum, task) => sum + task.loaded, 0);
  const percent = overallTotal > 0 ? Math.min(100, Math.round((overallLoaded / overallTotal) * 100)) : 0;

  return (
    <div className="transfer-panel">
      <div className="transfer-panel__head">
        {active > 0 ? <UploadCloud size={16} /> : <CheckCircle2 size={16} color="var(--success)" />}
        <span>传输任务</span>
        <span className="transfer-panel__count">
          {active > 0 ? `${active} 个进行中` : `${done} 成功${failed ? ` · ${failed} 失败` : ''}`}
        </span>
        <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} onClick={onClose} aria-label="收起">
          <Minus size={14} />
        </button>
      </div>

      <div className="transfer-panel__list">
        {download && (
          <div className="transfer-item">
            <span className="transfer-item__icon"><DownloadCloud size={16} /></span>
            <div className="transfer-item__main">
              <div className="transfer-item__name" title={download.name}>{download.name}</div>
              <div className="transfer-item__meta">
                {download.done
                  ? `下载完成 · ${formatBytes(download.loaded)}`
                  : `正在下载 · ${formatBytes(download.loaded)}${download.total ? ` / ${formatBytes(download.total)}` : ''}`}
              </div>
              {!download.done && (
                <div className="progress">
                  <div
                    className="progress__bar"
                    style={{ width: download.total ? `${Math.min(100, (download.loaded / download.total) * 100)}%` : '35%' }}
                  />
                </div>
              )}
            </div>
            {download.done && <CheckCircle2 size={16} color="var(--success)" />}
          </div>
        )}

        {tasks.map((task) => {
          const ratio = task.total ? Math.min(100, (task.loaded / task.total) * 100) : 0;
          return (
            <div className="transfer-item" key={task.id}>
              <span className="transfer-item__icon">
                {task.status === 'done' ? (
                  <CheckCircle2 size={16} color="var(--success)" />
                ) : task.status === 'error' ? (
                  <XCircle size={16} color="var(--danger)" />
                ) : (
                  <FileUp size={16} />
                )}
              </span>
              <div className="transfer-item__main">
                <div className="transfer-item__name" title={task.targetName}>
                  {task.targetName}
                  {task.targetName !== task.file.name ? ` ← ${task.file.name}` : ''}
                </div>
                <div className="transfer-item__meta">{statusText(task)}</div>
                {(task.status === 'uploading' || task.status === 'done') && (
                  <div className="progress">
                    <div
                      className={`progress__bar ${task.status === 'done' ? 'progress__bar--done' : ''}`}
                      style={{ width: `${task.status === 'done' ? 100 : ratio}%` }}
                    />
                  </div>
                )}
              </div>
              {(task.status === 'uploading' || task.status === 'pending') && (
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 26, height: 26 }}
                  onClick={() => onCancel(task.id)}
                  aria-label="取消上传"
                  title="取消"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="transfer-panel__foot">
        <span>
          总进度 {percent}%{tasks.length > 0 ? ` · ${tasks.length} 个文件` : ''}
        </span>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClearFinished}>
          清除已完成
        </button>
      </div>
    </div>
  );
}
