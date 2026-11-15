import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Eye,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { formatBytes, formatDate, getFileKind, kindLabel } from '../lib/format';
import type { DavEntry, ViewMode } from '../types';
import { FileIcon } from './FileIcon';

export interface FileActions {
  onOpen: (entry: DavEntry) => void;
  onPreview: (entry: DavEntry) => void;
  onDownload: (entry: DavEntry) => void;
  onRename: (entry: DavEntry) => void;
  onDelete: (entry: DavEntry) => void;
}

interface Props extends FileActions {
  entries: DavEntry[];
  viewMode: ViewMode;
}

interface MenuPosition {
  path: string;
  top: number;
  left: number;
}

const MENU_WIDTH = 172;
const MENU_HEIGHT = 190;

export function FileSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-label="正在加载目录">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 9, flex: 'none' }} />
          <div className="skeleton" style={{ width: `${120 + ((index * 47) % 160)}px`, height: 12 }} />
          <div className="skeleton" style={{ width: 70, height: 10, marginLeft: 'auto' }} />
          <div className="skeleton" style={{ width: 100, height: 10, marginLeft: 30 }} />
          <div className="skeleton" style={{ width: 46, height: 10, marginLeft: 30 }} />
        </div>
      ))}
    </div>
  );
}

function ActionMenu({
  entry,
  position,
  actions,
  onClose,
}: {
  entry: DavEntry;
  position: MenuPosition;
  actions: FileActions;
  onClose: () => void;
}) {
  const run = (fn: (target: DavEntry) => void) => () => {
    onClose();
    fn(entry);
  };
  return createPortal(
    <div
      className="menu"
      role="menu"
      style={{ position: 'fixed', top: position.top, left: position.left, right: 'auto', bottom: 'auto' }}
      onClick={(event) => event.stopPropagation()}
    >
      {entry.isCollection ? (
        <button type="button" className="menu__item" onClick={run(actions.onOpen)}>
          <FolderOpen size={15} /> 打开文件夹
        </button>
      ) : (
        <>
          <button type="button" className="menu__item" onClick={run(actions.onPreview)}>
            <Eye size={15} /> 预览 / 编辑
          </button>
          <button type="button" className="menu__item" onClick={run(actions.onDownload)}>
            <Download size={15} /> 下载文件
          </button>
        </>
      )}
      <div className="menu__divider" />
      <button type="button" className="menu__item" onClick={run(actions.onRename)}>
        <Pencil size={15} /> 重命名
      </button>
      <button type="button" className="menu__item menu__item--danger" onClick={run(actions.onDelete)}>
        <Trash2 size={15} /> 删除
      </button>
    </div>,
    document.body,
  );
}

export function FileTable({ entries, viewMode, ...actions }: Props) {
  const [menu, setMenu] = useState<MenuPosition | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.menu') && !target?.closest('[data-menu-trigger]')) setMenu(null);
    };
    const onScroll = () => setMenu(null);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu]);

  const toggleMenu = (event: ReactMouseEvent<HTMLButtonElement>, path: string) => {
    if (menu?.path === path) {
      setMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const goUp = window.innerHeight - rect.bottom < MENU_HEIGHT + 16;
    const top = goUp ? Math.max(8, rect.top - MENU_HEIGHT - 6) : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setMenu({ path, top, left });
  };

  const activeEntry = menu ? entries.find((item) => item.path === menu.path) : undefined;

  if (viewMode === 'grid') {
    return (
      <>
        <div className="grid-view">
          {entries.map((entry) => {
            const kind = getFileKind(entry);
            return (
              <div
                key={entry.path}
                className="grid-card"
                onClick={() => actions.onOpen(entry)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') actions.onOpen(entry);
                }}
              >
                <div className="grid-card__thumb">
                  <FileIcon kind={kind} size="lg" />
                </div>
                <div className="grid-card__name" title={entry.name}>{entry.name}</div>
                <div className="grid-card__meta">
                  {entry.isCollection ? '文件夹' : formatBytes(entry.size)} · {formatDate(entry.lastModified)}
                </div>
                <button
                  type="button"
                  data-menu-trigger
                  className="grid-card__menu"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleMenu(event, entry.path);
                  }}
                  aria-label="更多操作"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            );
          })}
        </div>
        {menu && activeEntry && (
          <ActionMenu entry={activeEntry} position={menu} actions={actions} onClose={() => setMenu(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="file-table-wrap">
        <table className="file-table">
          <thead>
            <tr>
              <th>名称</th>
              <th className="col-size">大小</th>
              <th className="col-date">修改时间</th>
              <th className="col-type">类型</th>
              <th className="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const kind = getFileKind(entry);
              const canPreview = ['markdown', 'text', 'code', 'image'].includes(kind);
              return (
                <tr key={entry.path}>
                  <td>
                    <div className="file-name-cell">
                      <FileIcon kind={kind} size="sm" />
                      <button
                        type="button"
                        className="file-name"
                        title={entry.name}
                        onClick={() => actions.onOpen(entry)}
                      >
                        {entry.name}
                      </button>
                    </div>
                  </td>
                  <td className="cell-num cell-muted">{entry.isCollection ? '—' : formatBytes(entry.size)}</td>
                  <td className="cell-num cell-muted">{formatDate(entry.lastModified)}</td>
                  <td>
                    <span className="type-chip">{kindLabel(kind)}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      {entry.isCollection ? (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 28, height: 28 }}
                          title="打开"
                          onClick={() => actions.onOpen(entry)}
                        >
                          <FolderOpen size={15} />
                        </button>
                      ) : (
                        <>
                          {canPreview && (
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ width: 28, height: 28 }}
                              title="预览 / 编辑"
                              onClick={() => actions.onPreview(entry)}
                            >
                              <Eye size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 28, height: 28 }}
                            title="下载"
                            onClick={() => actions.onDownload(entry)}
                          >
                            <Download size={15} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        data-menu-trigger
                        className="icon-btn"
                        style={{ width: 28, height: 28 }}
                        title="更多操作"
                        aria-label="更多操作"
                        onClick={(event) => toggleMenu(event, entry.path)}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {menu && activeEntry && (
        <ActionMenu entry={activeEntry} position={menu} actions={actions} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
