import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FilePlus2,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  List,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import { CONFIG } from '../config';
import { useBatchActions } from '../hooks/useBatchActions';
import { useSelection } from '../hooks/useSelection';
import { saveBlob } from '../lib/download';
import { asErrorInfo } from '../lib/errors';
import { formatBytes, getFileKind, matchesKindFilter } from '../lib/format';
import {
  baseName,
  dirName,
  safeDecode,
  joinPath,
  pathSegments,
  uniqueName,
  validateEntryName,
} from '../lib/path';
import { loadUiPreferences, saveUiPreferences } from '../lib/storage';
import type { WebDavClient } from '../lib/webdav';
import type {
  ConfirmState,
  ConflictChoice,
  Credentials,
  DavEntry,
  DavErrorInfo,
  InputDialogState,
  KindFilter,
  PendingConflict,
  SortKey,
  Toast,
  ToastTone,
  UploadTask,
  ViewMode,
} from '../types';
import { BatchBar } from './BatchBar';
import { BatchPanel } from './BatchPanel';
import { FileSkeleton, FileTable } from './FileTable';
import { MoveDialog } from './MoveDialog';
import {
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  InputDialog,
  OverwriteDialog,
  Toasts,
} from './Overlays';
import { PreviewModal } from './PreviewModal';
import { TransferPanel, type DownloadProgress } from './TransferPanel';

interface Props {
  client: WebDavClient;
  credentials: Credentials;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onDisconnect: () => void;
  onOpenSettings: () => void;
}

const FILTER_ITEMS: Array<{ key: KindFilter; label: string; Icon: typeof Folder }> = [
  { key: 'all', label: '全部项目', Icon: HardDrive },
  { key: 'folder', label: '文件夹', Icon: Folder },
  { key: 'document', label: '文档 / 文本', Icon: FilePlus2 },
  { key: 'image', label: '图片', Icon: ImageIcon },
  { key: 'other', label: '其他', Icon: FileUp },
];

function hostLabel(rootUrl: string): string {
  try {
    const url = new URL(rootUrl);
    return `${url.host}${safeDecode(url.pathname)}`;
  } catch {
    return rootUrl;
  }
}

export function Browser({
  client,
  credentials,
  theme,
  onToggleTheme,
  onDisconnect,
  onOpenSettings,
}: Props) {
  const initialPrefs = useMemo(() => loadUiPreferences(), []);
  const [viewMode, setViewMode] = useState<ViewMode>(initialPrefs.viewMode ?? 'list');
  const [pageSize, setPageSize] = useState(initialPrefs.pageSize ?? CONFIG.PAGE_SIZE);

  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<DavEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DavErrorInfo | null>(null);
  const loadAbort = useRef<AbortController | null>(null);
  const pathRef = useRef('/');

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [sort, setSort] = useState<SortKey>('name-asc');
  const [page, setPage] = useState(1);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [previewEntry, setPreviewEntry] = useState<DavEntry | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [transferOpen, setTransferOpen] = useState(true);
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const applyAllChoice = useRef<ConflictChoice | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastSeq = useRef(0);

  /* ------------------------------ 批量多选 ------------------------------ */
  const { selected, select, togglePage, selectAll, clear, keep } = useSelection();
  const [moveOpen, setMoveOpen] = useState(false);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const pushToast = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = `t${(toastSeq.current += 1)}`;
    setToasts((prev) => [...prev, { id, tone, title, description }].slice(-4));
    window.setTimeout(
      () => setToasts((prev) => prev.filter((item) => item.id !== id)),
      tone === 'error' ? 9000 : 4800,
    );
  }, []);

  const loadDirectory = useCallback(
    async (target: string) => {
      loadAbort.current?.abort();
      const controller = new AbortController();
      loadAbort.current = controller;
      setLoading(true);
      setError(null);
      try {
        const result = await client.propfind(target, controller.signal);
        if (controller.signal.aborted) return;
        setEntries(result);
        setPath(target);
        setPage(1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(asErrorInfo(err, 'PROPFIND'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadDirectory('/');
    return () => loadAbort.current?.abort();
  }, [loadDirectory]);

  // 阻止浏览器在拖拽文件到页面空白区时直接打开文件
  useEffect(() => {
    const prevent = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    saveUiPreferences({ viewMode: mode });
  };
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    saveUiPreferences({ pageSize: size });
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter(
      (entry) =>
        (!query || entry.name.toLowerCase().includes(query)) &&
        matchesKindFilter(getFileKind(entry), kindFilter),
    );
  }, [entries, search, kindFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (a.isCollection !== b.isCollection) return a.isCollection ? -1 : 1;
      switch (sort) {
        case 'name-desc':
          return b.name.localeCompare(a.name, 'zh-CN', { numeric: true });
        case 'size-desc':
          return (b.size ?? -1) - (a.size ?? -1);
        case 'modified-desc':
          return (
            (b.lastModified ? Date.parse(b.lastModified) : 0) -
            (a.lastModified ? Date.parse(a.lastModified) : 0)
          );
        default:
          return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
      }
    });
    return list;
  }, [filtered, sort]);

  useEffect(() => {
    setPage(1);
  }, [search, kindFilter, sort, path]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pagePaths = useMemo(() => pageItems.map((entry) => entry.path), [pageItems]);

  /** 选择集基于「全部筛选结果」，因此跨分页仍然保留 */
  const selectedEntries = useMemo(
    () => sorted.filter((entry) => selected.has(entry.path)),
    [sorted, selected],
  );
  const selectedFileCount = selectedEntries.filter((entry) => !entry.isCollection).length;
  const selectedFolderCount = selectedEntries.length - selectedFileCount;
  const selectedBytes = selectedEntries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);

  // 切换目录后清空选择，避免把上一个目录的路径带进批量操作
  useEffect(() => {
    clear();
  }, [path, clear]);

  // Ctrl/Cmd+A 全选当前筛选结果，Esc 取消选择；输入框与弹窗内不拦截
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.dialog-backdrop')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAll(sorted.map((entry) => entry.path));
      } else if (event.key === 'Escape' && selected.size > 0) {
        clear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sorted, selected.size, selectAll, clear]);

  const folderCount = useMemo(() => entries.filter((item) => item.isCollection).length, [entries]);
  const fileCount = entries.length - folderCount;

  const navigate = (target: string) => void loadDirectory(target);
  const goUp = () => navigate(dirName(path));
  const refresh = () => void loadDirectory(path);

  /* ------------------------------ 批量操作 ------------------------------ */

  const askConflict = (name: string, context: 'upload' | 'move' = 'upload'): Promise<ConflictChoice> =>
    new Promise((resolve) => {
      setConflict({
        name,
        context,
        resolve: (choice, applyToAll) => {
          if (applyToAll) applyAllChoice.current = choice;
          setConflict(null);
          resolve(choice);
        },
      });
    });

  const batch = useBatchActions({
    client,
    currentPath: path,
    refresh,
    toast: pushToast,
    askConflict,
    clearSelection: clear,
    keepSelection: keep,
  });

  const handleBatchDelete = () => {
    const list = selectedEntries;
    if (list.length === 0) return;
    const preview = list.slice(0, 3).map((entry) => `「${entry.name}」`).join('、');
    setConfirm({
      title: `批量删除 ${list.length} 项`,
      description: `将删除 ${preview}${list.length > 3 ? ` 等共 ${list.length} 项` : ''}。${
        selectedFolderCount > 0
          ? '其中包含的文件夹会按 WebDAV DELETE 语义连同内部所有内容一并删除。'
          : '删除后文件内容将无法通过本工具恢复。'
      }`,
      confirmLabel: `确认删除 ${list.length} 项`,
      tone: 'danger',
      onConfirm: () => {
        void batch.deleteSelected(list);
      },
    });
  };

  const handleBatchDownload = () => {
    const list = selectedEntries;
    if (list.length === 0) return;
    const files = list.filter((entry) => !entry.isCollection);
    if (files.length > 1) {
      setConfirm({
        title: `批量下载 ${files.length} 个文件`,
        description: `将依次触发 ${files.length} 次浏览器下载。Chrome 等浏览器默认会拦截「自动下载多个文件」，出现提示时请在地址栏选择「允许」；也可改用「打包 ZIP」一次下载。`,
        confirmLabel: '开始下载',
        tone: 'default',
        onConfirm: () => {
          void batch.downloadSelected(list);
        },
      });
    } else {
      void batch.downloadSelected(list);
    }
  };

  const handleBatchMoveConfirm = (targetPath: string) => {
    setMoveOpen(false);
    const list = selectedEntries;
    if (list.length > 0) void batch.moveSelected(list, targetPath);
  };

  /* ------------------------------ 文件操作 ------------------------------ */

  const handleOpen = (entry: DavEntry) => {
    if (entry.isCollection) navigate(entry.path);
    else setPreviewEntry(entry);
  };

  const handleDownload = async (entry: DavEntry) => {
    if (entry.isCollection) {
      pushToast('warning', '无法直接下载文件夹', 'WebDAV 标准不支持把整个文件夹打包下载，请进入文件夹逐个下载。');
      return;
    }
    setTransferOpen(true);
    setDownload({ name: entry.name, loaded: 0, total: entry.size ?? 0, done: false });
    try {
      const blob = await client.getBlob(entry.path, {
        onProgress: ({ loaded, total }) => {
          setDownload({ name: entry.name, loaded, total: total || entry.size || loaded, done: false });
        },
      });
      saveBlob(blob, entry.name);
      setDownload({ name: entry.name, loaded: blob.size, total: blob.size, done: true });
      pushToast('success', '下载已开始', `${entry.name} · ${formatBytes(blob.size)}`);
      window.setTimeout(() => {
        setDownload((prev) => (prev?.done && prev.name === entry.name ? null : prev));
      }, 4500);
    } catch (err) {
      const info = asErrorInfo(err, 'GET');
      setDownload(null);
      pushToast('error', `下载失败：${info.title}`, info.message);
    }
  };

  const handleRename = (entry: DavEntry) => {
    const names = entries.map((item) => item.name);
    setInputDialog({
      title: `重命名${entry.isCollection ? '文件夹' : '文件'}`,
      label: '新名称',
      initialValue: entry.name,
      confirmLabel: '确认重命名',
      description:
        '重命名通过 WebDAV MOVE 完成：原路径会失效，引用该文件的链接可能中断。路径中的特殊字符会自动逐段 URL 编码。',
      validate: (value) => {
        if (value.trim() === entry.name) return '新名称与当前名称相同。';
        return validateEntryName(value, names, entry.name);
      },
      onSubmit: async (value) => {
        await client.move(entry.path, joinPath(path, value), entry.isCollection);
        pushToast('success', '重命名成功', `${entry.name} → ${value}`);
        await loadDirectory(path);
      },
    });
  };

  const handleDelete = (entry: DavEntry) => {
    setConfirm({
      title: `删除${entry.isCollection ? '文件夹' : '文件'}`,
      description: `确定要删除「${entry.name}」吗？${
        entry.isCollection
          ? '该文件夹及其中的所有内容会按 WebDAV DELETE 语义一并删除。'
          : '删除后文件内容将无法通过本工具恢复。'
      }`,
      confirmLabel: '确认删除',
      tone: 'danger',
      onConfirm: async () => {
        await client.delete(entry.path, entry.isCollection);
        pushToast('success', '已删除', entry.name);
        await loadDirectory(path);
      },
    });
  };

  const handleMkcol = () => {
    const names = entries.map((item) => item.name);
    setInputDialog({
      title: '新建文件夹',
      label: '文件夹名称',
      initialValue: '',
      placeholder: '例如：2026 项目资料',
      confirmLabel: '创建文件夹',
      description: '使用 WebDAV MKCOL 创建，名称中的空格、中文与特殊字符会被逐段 URL 编码。',
      validate: (value) => validateEntryName(value, names),
      onSubmit: async (value) => {
        await client.mkcol(path, value);
        pushToast('success', '文件夹已创建', value);
        await loadDirectory(path);
      },
    });
  };

  /* ------------------------------ 上传 ------------------------------ */

  const updateTask = (id: string, patch: Partial<UploadTask>) =>
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const targetDir = pathRef.current;
    const usedNames = entries.map((item) => item.name);
    applyAllChoice.current = null;

    const prepared: Array<{ file: File; targetName: string; skipped: boolean }> = [];
    for (const file of files) {
      const exists = usedNames.some((name) => name.toLowerCase() === file.name.toLowerCase());
      let targetName = file.name;
      if (exists) {
        const choice = applyAllChoice.current ?? (await askConflict(file.name));
        if (choice === 'skip') {
          prepared.push({ file, targetName, skipped: true });
          continue;
        }
        if (choice === 'rename') targetName = uniqueName(file.name, usedNames);
      }
      usedNames.push(targetName);
      prepared.push({ file, targetName, skipped: false });
    }

    const newTasks: UploadTask[] = prepared.map((item) => ({
      id: `u${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file: item.file,
      targetName: item.targetName,
      status: item.skipped ? 'skipped' : 'pending',
      loaded: 0,
      total: item.file.size,
    }));
    setTasks((prev) => [...prev, ...newTasks]);
    setTransferOpen(true);

    let succeeded = 0;
    let failed = 0;
    let firstError = '';
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= newTasks.length) return;
        const task = newTasks[index];
        if (task.status === 'skipped') continue;

        const controller = new AbortController();
        controllers.current.set(task.id, controller);
        updateTask(task.id, { status: 'uploading' });
        try {
          await client.uploadFile(
            joinPath(targetDir, task.targetName),
            task.file,
            ({ loaded, total }) => updateTask(task.id, { loaded, total: total || task.file.size }),
            controller.signal,
          );
          updateTask(task.id, {
            status: 'done',
            loaded: task.file.size,
            total: task.file.size,
          });
          succeeded += 1;
        } catch (err) {
          const aborted = err instanceof DOMException && err.name === 'AbortError';
          const info = asErrorInfo(err, 'PUT');
          updateTask(task.id, {
            status: aborted ? 'canceled' : 'error',
            ...(aborted ? {} : { error: info.message }),
          });
          if (!aborted) {
            failed += 1;
            if (!firstError) firstError = `${info.title}：${info.message}`;
          }
        } finally {
          controllers.current.delete(task.id);
        }
      }
    };

    const concurrency = Math.min(CONFIG.UPLOAD_CONCURRENCY, newTasks.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (pathRef.current === targetDir) await loadDirectory(targetDir);
    if (succeeded > 0) pushToast('success', `已上传 ${succeeded} 个文件`, `目标目录 ${targetDir}`);
    if (failed > 0) pushToast('error', `${failed} 个文件上传失败`, firstError);
    if (newTasks.some((task) => task.status === 'skipped')) {
      pushToast('info', '部分同名文件已跳过', '可在传输任务面板中查看详情');
    }
  };

  const cancelTask = (id: string) => controllers.current.get(id)?.abort();
  const clearFinishedTasks = () => {
    setTasks((prev) => prev.filter((task) => task.status === 'pending' || task.status === 'uploading'));
    setDownload(null);
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.dataTransfer.types.includes('Files')) return;
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  /* ------------------------------ 渲染 ------------------------------ */

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
    const end = Math.min(totalPages, start + 2);
    for (let index = start; index <= end; index += 1) pages.push(index);
    return pages;
  }, [currentPage, totalPages]);

  const filterCounts = useMemo(
    () => ({
      all: entries.length,
      folder: folderCount,
      document: entries.filter((item) => ['markdown', 'text', 'code', 'pdf'].includes(getFileKind(item))).length,
      image: entries.filter((item) => getFileKind(item) === 'image').length,
      other: entries.filter((item) =>
        !['folder', 'markdown', 'text', 'code', 'pdf', 'image'].includes(getFileKind(item)),
      ).length,
    }),
    [entries, folderCount],
  );

  const fileActions = {
    onOpen: handleOpen,
    onPreview: (entry: DavEntry) => setPreviewEntry(entry),
    onDownload: (entry: DavEntry) => void handleDownload(entry),
    onRename: handleRename,
    onDelete: handleDelete,
  };

  return (
    <div className="app-shell">
      {/* 顶栏 */}
      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand-mark"><Cloud size={19} strokeWidth={2} /></span>
          <span>
            <div className="brand-name">WebDAV Studio</div>
            <div className="brand-sub">PURE FRONTEND</div>
          </span>
        </div>
        <div className="topbar__divider" />
        <div className="topbar__connection">
          <span
            className={`status-pill ${loading ? 'status-pill--loading' : error ? 'status-pill--error' : ''}`}
          >
            <span className="status-pill__dot" />
            {loading ? '同步中' : error ? '连接异常' : '已连接'}
          </span>
          <span className="topbar__host" title={credentials.rootUrl}>
            {hostLabel(credentials.rootUrl)}
          </span>
        </div>
        <div className="topbar__actions">
          <button type="button" className="icon-btn" onClick={refresh} title="刷新目录" aria-label="刷新目录">
            <RefreshCw size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={onToggleTheme} title="切换主题" aria-label="切换主题">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button type="button" className="btn btn--sm" onClick={onOpenSettings}>
            <Settings size={14} /> 连接设置
          </button>
          <button type="button" className="btn btn--sm" onClick={onDisconnect}>
            <LogOut size={14} /> 断开
          </button>
        </div>
      </header>

      <div className="workspace">
        {/* 侧栏 */}
        <aside className="sidebar">
          <div>
            <div className="sidebar__label">位置</div>
            <button type="button" className="nav-item nav-item--active" onClick={() => navigate('/')}>
              <Home size={16} /> WebDAV 根目录
            </button>
            <button type="button" className="nav-item" onClick={goUp} disabled={path === '/'}>
              <ArrowLeft size={16} /> 返回上级
            </button>
          </div>

          <div>
            <div className="sidebar__label">类型筛选</div>
            {FILTER_ITEMS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                className={`nav-item ${kindFilter === key ? 'nav-item--active' : ''}`}
                onClick={() => setKindFilter(key)}
              >
                <Icon size={16} /> {label}
                <span className="nav-item__count">{filterCounts[key]}</span>
              </button>
            ))}
          </div>

          <div>
            <div className="sidebar__label">当前目录</div>
            <div className="sidebar__stats">
              <div className="stat-box">
                <div className="stat-box__value">{folderCount}</div>
                <div className="stat-box__label">文件夹</div>
              </div>
              <div className="stat-box">
                <div className="stat-box__value">{fileCount}</div>
                <div className="stat-box__label">文件</div>
              </div>
            </div>
          </div>

          <div className="sidebar__spacer" />
          <div className="sidebar-note">
            <div className="sidebar-note__title">
              <ShieldCheck size={14} /> 本地凭据 · 直连服务端
            </div>
            所有 WebDAV 请求都由浏览器直接发出，没有后端代理。若出现跨域错误，请在服务端放行 CORS 方法与请求头（详见连接设置中的说明）。
          </div>
        </aside>

        {/* 主区 */}
        <main className="main">
          <div className="page-head">
            <div>
              <h1 className="page-head__title">{path === '/' ? '全部文件' : baseName(path)}</h1>
              <p className="page-head__subtitle">
                {loading ? '正在读取目录…' : `共 ${entries.length} 个项目 · ${sorted.length} 个符合当前筛选`}
              </p>
            </div>
          </div>

          {/* 面包屑 */}
          <nav className="breadcrumbs" aria-label="路径导航">
            <button type="button" className={`crumb ${path === '/' ? 'crumb--current' : ''}`} onClick={() => navigate('/')}>
              <Home size={14} /> 根目录
            </button>
            {pathSegments(path).map((segment, index, array) => (
              <span key={segment.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <ChevronRight size={13} className="crumb__sep" />
                <button
                  type="button"
                  className={`crumb ${index === array.length - 1 ? 'crumb--current' : ''}`}
                  onClick={() => navigate(segment.path)}
                  disabled={index === array.length - 1}
                  title={segment.name}
                >
                  {segment.name}
                </button>
              </span>
            ))}
            <div className="breadcrumbs__actions">
              <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} onClick={goUp} disabled={path === '/'} title="返回上级">
                <ArrowLeft size={15} />
              </button>
              <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} onClick={refresh} title="刷新">
                <RefreshCw size={15} />
              </button>
            </div>
          </nav>

          {/* 工具栏 */}
          <div className="toolbar">
            <div className="toolbar__group">
              <button type="button" className="btn btn--primary" onClick={() => fileInputRef.current?.click()}>
                <Upload size={15} /> 上传文件
              </button>
              <button type="button" className="btn" onClick={handleMkcol}>
                <FolderPlus size={15} /> 新建文件夹
              </button>
              <button type="button" className="icon-btn icon-btn--bordered" onClick={refresh} title="刷新">
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="toolbar__group">
              <div className="search-box">
                <span className="search-box__icon"><Search size={15} /></span>
                <input
                  className="input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索当前目录…"
                  aria-label="搜索当前目录"
                />
                {search && (
                  <button type="button" className="search-box__clear" onClick={() => setSearch('')} aria-label="清除搜索">
                    <X size={13} />
                  </button>
                )}
              </div>
              <select
                className="select"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                aria-label="排序方式"
              >
                <option value="name-asc">名称 A → Z</option>
                <option value="name-desc">名称 Z → A</option>
                <option value="size-desc">大小（大 → 小）</option>
                <option value="modified-desc">最近修改</option>
              </select>
              <div className="segmented" role="group" aria-label="视图切换">
                <button
                  type="button"
                  className={`segmented__btn ${viewMode === 'list' ? 'segmented__btn--active' : ''}`}
                  onClick={() => changeViewMode('list')}
                  title="列表视图"
                  aria-label="列表视图"
                >
                  <List size={15} />
                </button>
                <button
                  type="button"
                  className={`segmented__btn ${viewMode === 'grid' ? 'segmented__btn--active' : ''}`}
                  onClick={() => changeViewMode('grid')}
                  title="网格视图"
                  aria-label="网格视图"
                >
                  <LayoutGrid size={15} />
                </button>
              </div>
            </div>
          </div>

          <BatchBar
            count={selectedEntries.length}
            fileCount={selectedFileCount}
            folderCount={selectedFolderCount}
            totalBytes={selectedBytes}
            allCount={sorted.length}
            busy={batch.busy}
            onSelectAll={() => selectAll(sorted.map((entry) => entry.path))}
            onClear={clear}
            onDownload={handleBatchDownload}
            onZip={() => void batch.zipSelected(selectedEntries)}
            onMove={() => setMoveOpen(true)}
            onDelete={handleBatchDelete}
          />

          {/* 文件区 */}
          <div
            className="drop-area"
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={onDrop}
          >
            {dragActive && (
              <div className="drop-overlay">
                <div className="drop-overlay__inner">
                  <Upload size={30} />
                  <span>松开鼠标，上传到当前目录</span>
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
                    目标：{path}
                  </span>
                </div>
              </div>
            )}

            <div className="file-panel">
              {loading ? (
                <FileSkeleton />
              ) : error ? (
                <div className="inline-error">
                  <ErrorPanel
                    info={error}
                    onRetry={refresh}
                    onDismiss={() => setError(null)}
                  />
                  <div className="toolbar__group" style={{ marginTop: 14 }}>
                    <button type="button" className="btn btn--sm" onClick={() => navigate('/')}>
                      <Home size={13} /> 返回根目录
                    </button>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={onOpenSettings}>
                      <Settings size={13} /> 检查连接设置
                    </button>
                  </div>
                </div>
              ) : entries.length === 0 ? (
                <EmptyState
                  icon={<FolderOpen size={30} />}
                  title="这个文件夹是空的"
                  description="上传文件、新建文件夹，或把文件直接拖拽到这个区域。"
                  action={
                    <div className="toolbar__group">
                      <button type="button" className="btn btn--primary" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={15} /> 上传文件
                      </button>
                      <button type="button" className="btn" onClick={handleMkcol}>
                        <FolderPlus size={15} /> 新建文件夹
                      </button>
                    </div>
                  }
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<Search size={28} />}
                  title="没有匹配的项目"
                  description="当前搜索词或类型筛选没有命中任何文件 / 文件夹。"
                  action={
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setSearch('');
                        setKindFilter('all');
                      }}
                    >
                      <X size={14} /> 清除筛选
                    </button>
                  }
                />
              ) : (
                <>
                  <FileTable
                    entries={pageItems}
                    viewMode={viewMode}
                    selected={selected}
                    onSelect={(target, mods) => select(target, mods, pagePaths)}
                    onTogglePage={(checked) => togglePage(pagePaths, checked)}
                    {...fileActions}
                  />
                  <div className="pagination">
                    <span>
                      第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} 项，
                      共 {sorted.length} 项{totalPages > 1 ? ` · ${totalPages} 页` : ''}
                      {sorted.length > CONFIG.PAGE_SIZE ? ' · 已启用分页保护大目录' : ''}
                      {' · 按住 Ctrl / Shift 可多选'}
                    </span>
                    <div className="pagination__controls">
                      <select
                        className="select"
                        style={{ height: 30 }}
                        value={pageSize}
                        onChange={(event) => changePageSize(Number(event.target.value))}
                        aria-label="每页条数"
                      >
                        {CONFIG.PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>{size} / 页</option>
                        ))}
                      </select>
                      {totalPages > 1 && (
                        <>
                          <button
                            type="button"
                            className="page-btn"
                            onClick={() => setPage((value) => Math.max(1, value - 1))}
                            disabled={currentPage === 1}
                            aria-label="上一页"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          {pageNumbers.map((number) => (
                            <button
                              key={number}
                              type="button"
                              className={`page-btn ${number === currentPage ? 'page-btn--active' : ''}`}
                              onClick={() => setPage(number)}
                            >
                              {number}
                            </button>
                          ))}
                          {totalPages > 3 && currentPage < totalPages - 1 && (
                            <span style={{ padding: '0 2px' }}>…</span>
                          )}
                          {totalPages > 3 && !pageNumbers.includes(totalPages) && (
                            <button
                              type="button"
                              className={`page-btn ${currentPage === totalPages ? 'page-btn--active' : ''}`}
                              onClick={() => setPage(totalPages)}
                            >
                              {totalPages}
                            </button>
                          )}
                          <button
                            type="button"
                            className="page-btn"
                            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                            disabled={currentPage === totalPages}
                            aria-label="下一页"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          void handleFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />

      {/* 浮层：批量任务与传输任务共用右下角堆叠容器 */}
      <div className="floating-stack">
        {batch.panelOpen && batch.job && (
          <BatchPanel
            job={batch.job}
            onCancel={batch.cancel}
            onClose={batch.close}
            onCollapse={() => batch.setPanelOpen(false)}
          />
        )}
        {transferOpen && (
          <TransferPanel
            tasks={tasks}
            download={download}
            onClose={() => setTransferOpen(false)}
            onClearFinished={clearFinishedTasks}
            onCancel={cancelTask}
          />
        )}
        {batch.job && !batch.panelOpen && (
          <button type="button" className="btn btn--primary floating-chip" onClick={() => batch.setPanelOpen(true)}>
            <Layers size={15} /> {batch.job.title}
            {batch.job.finished ? '' : ' · 进行中'}
          </button>
        )}
        {tasks.length > 0 && !transferOpen && (
          <button type="button" className="btn btn--primary floating-chip" onClick={() => setTransferOpen(true)}>
            <Upload size={15} /> 传输任务 ({tasks.length})
          </button>
        )}
      </div>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <InputDialog state={inputDialog} onClose={() => setInputDialog(null)} />
      <OverwriteDialog state={conflict} />
      <MoveDialog
        open={moveOpen}
        client={client}
        initialPath={path}
        sourcePath={path}
        blockedPaths={selectedEntries.filter((entry) => entry.isCollection).map((entry) => entry.path)}
        count={selectedEntries.length}
        onClose={() => setMoveOpen(false)}
        onConfirm={handleBatchMoveConfirm}
      />
      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />

      {previewEntry && (
        <PreviewModal
          key={previewEntry.path}
          entry={previewEntry}
          client={client}
          onClose={() => setPreviewEntry(null)}
          onDownload={(entry) => void handleDownload(entry)}
          onToast={pushToast}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
