import { Ban, CheckCircle2, Loader2, Minus, X, XCircle } from 'lucide-react';
import { ZIP_STEP_ID } from '../lib/batch';
import { formatBytes } from '../lib/format';
import type { BatchItem, BatchJob } from '../types';

const STATUS_LABEL: Record<BatchItem['status'], string> = {
  pending: '等待处理',
  running: '处理中',
  done: '已完成',
  error: '失败',
  skipped: '已跳过',
  canceled: '已取消',
};

function StatusIcon({ status }: { status: BatchItem['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={16} color="var(--success)" />;
    case 'error':
      return <XCircle size={16} color="var(--danger)" />;
    case 'running':
      return <Loader2 size={16} className="spinner" />;
    case 'skipped':
    case 'canceled':
      return <Ban size={15} color="var(--text-3)" />;
    default:
      return <span className="batch-dot" />;
  }
}

interface Props {
  job: BatchJob | null;
  onCancel: () => void;
  onClose: () => void;
  onCollapse?: () => void;
}

export function BatchPanel({ job, onCancel, onClose, onCollapse }: Props) {
  if (!job) return null;

  const realItems = job.items.filter((item) => item.id !== ZIP_STEP_ID);
  const done = realItems.filter((item) => item.status === 'done').length;
  const failed = realItems.filter((item) => item.status === 'error').length;
  const skipped = realItems.filter((item) => item.status === 'skipped').length;
  const canceled = realItems.filter((item) => item.status === 'canceled').length;
  const active = realItems.filter((item) => item.status === 'running' || item.status === 'pending').length;

  const bytesTotal = realItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const bytesLoaded = realItems.reduce((sum, item) => sum + (item.loaded ?? 0), 0);
  const percent =
    bytesTotal > 0
      ? Math.min(100, Math.round((bytesLoaded / bytesTotal) * 100))
      : realItems.length > 0
        ? Math.round(((done + failed + skipped + canceled) / realItems.length) * 100)
        : 100;

  return (
    <div className="transfer-panel batch-panel" role="status" aria-live="polite">
      <div className="transfer-panel__head">
        {job.finished ? (
          <CheckCircle2 size={16} color={failed > 0 ? 'var(--danger)' : 'var(--success)'} />
        ) : (
          <Loader2 size={16} className="spinner" />
        )}
        <span title={job.title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.title}
        </span>
        <span className="transfer-panel__count">
          {job.finished
            ? `${done} 成功${failed ? ` · ${failed} 失败` : ''}${skipped ? ` · ${skipped} 跳过` : ''}`
            : `${active} 个进行中`}
        </span>
        <button
          type="button"
          className="icon-btn"
          style={{ width: 26, height: 26 }}
          onClick={onCollapse ?? onClose}
          aria-label="收起批量任务面板"
          title="收起"
        >
          <Minus size={14} />
        </button>
      </div>

      <div className="transfer-panel__list batch-panel__list">
        {job.items.map((item) => {
          const ratio = item.total ? Math.min(100, ((item.loaded ?? 0) / item.total) * 100) : 0;
          return (
            <div className="transfer-item" key={item.id}>
              <span className="transfer-item__icon"><StatusIcon status={item.status} /></span>
              <div className="transfer-item__main">
                <div className="transfer-item__name" title={item.name}>{item.name}</div>
                <div className="transfer-item__meta">
                  {item.detail ?? STATUS_LABEL[item.status]}
                  {item.status === 'running' && item.total && item.loaded !== undefined
                    ? ` · ${formatBytes(item.loaded)} / ${formatBytes(item.total)}`
                    : ''}
                </div>
                {(item.status === 'running' || item.status === 'done') && item.total ? (
                  <div className="progress">
                    <div
                      className={`progress__bar ${item.status === 'done' ? 'progress__bar--done' : ''}`}
                      style={{ width: `${item.status === 'done' ? 100 : ratio}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="transfer-panel__foot">
        <span>总进度 {job.finished && failed === 0 ? 100 : percent}%</span>
        <div className="toolbar__group">
          {!job.finished ? (
            <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>
              <X size={13} /> 取消剩余
            </button>
          ) : (
            <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
