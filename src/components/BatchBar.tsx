import { Archive, Download, FolderInput, ListChecks, Trash2, X } from 'lucide-react';
import { formatBytes } from '../lib/format';

interface Props {
  count: number;
  fileCount: number;
  folderCount: number;
  totalBytes: number;
  allCount: number;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDownload: () => void;
  onZip: () => void;
  onMove: () => void;
  onDelete: () => void;
}

/** 选中若干项目后出现的上下文操作栏 */
export function BatchBar({
  count,
  fileCount,
  folderCount,
  totalBytes,
  allCount,
  busy,
  onSelectAll,
  onClear,
  onDownload,
  onZip,
  onMove,
  onDelete,
}: Props) {
  if (count === 0) return null;
  const parts = [
    fileCount > 0 ? `${fileCount} 个文件` : '',
    folderCount > 0 ? `${folderCount} 个文件夹` : '',
    totalBytes > 0 ? formatBytes(totalBytes) : '',
  ].filter(Boolean);

  return (
    <div className="batch-bar" role="region" aria-label="批量操作">
      <div className="batch-bar__info">
        <span className="batch-bar__icon"><ListChecks size={16} /></span>
        <span className="batch-bar__count">已选择 {count} 项</span>
        <span className="batch-bar__meta">{parts.join(' · ')}</span>
        {count < allCount && (
          <button type="button" className="batch-bar__link" onClick={onSelectAll} disabled={busy}>
            选择全部 {allCount} 项
          </button>
        )}
      </div>
      <div className="batch-bar__actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={onDownload}
          disabled={busy || fileCount === 0}
          title={fileCount === 0 ? '所选项目均为文件夹' : '依次下载所选文件'}
        >
          <Download size={14} /> 下载
        </button>
        <button type="button" className="btn btn--sm" onClick={onZip} disabled={busy} title="把所选项目（含文件夹内容）打包成一个 ZIP">
          <Archive size={14} /> 打包 ZIP
        </button>
        <button type="button" className="btn btn--sm" onClick={onMove} disabled={busy}>
          <FolderInput size={14} /> 移动到…
        </button>
        <button type="button" className="btn btn--sm btn--danger" onClick={onDelete} disabled={busy}>
          <Trash2 size={14} /> 删除
        </button>
        <span className="batch-bar__divider" />
        <button
          type="button"
          className="icon-btn"
          onClick={onClear}
          disabled={busy}
          aria-label="取消选择"
          title="取消选择（Esc）"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
