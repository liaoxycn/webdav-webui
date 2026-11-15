import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  FileWarning,
  Pencil,
  RefreshCw,
  Save,
  WrapText,
  X,
} from 'lucide-react';
import { CONFIG } from '../config';
import { formatBytes, getFileKind, kindLabel } from '../lib/format';
import { makeObjectUrl } from '../lib/download';
import { PreviewTooLargeError, asErrorInfo } from '../lib/errors';
import { renderMarkdown } from '../lib/markdown';
import type { WebDavClient } from '../lib/webdav';
import type { DavEntry, DavErrorInfo, ProgressSnapshot, ToastTone } from '../types';
import { FileIcon } from './FileIcon';
import { ConfirmDialog, EmptyState, ErrorPanel, Modal } from './Overlays';

interface Props {
  entry: DavEntry;
  client: WebDavClient;
  onClose: () => void;
  onDownload: (entry: DavEntry) => void;
  onToast: (tone: ToastTone, title: string, description?: string) => void;
  /** 保存成功后刷新目录，更新大小 / 修改时间 */
  onSaved: () => void;
}

export function PreviewModal({ entry, client, onClose, onDownload, onToast, onSaved }: Props) {
  const kind = getFileKind(entry);
  const editable = kind === 'markdown' || kind === 'text' || kind === 'code';
  const previewable = editable || kind === 'image';

  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DavErrorInfo | null>(null);
  const [tooLarge, setTooLarge] = useState<{ size: number; limit: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const dirty = editable && draft !== content;

  useEffect(() => {
    let canceled = false;
    let createdUrl: string | null = null;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      setTooLarge(null);
      setProgress(null);
      try {
        if (kind === 'image') {
          const blob = await client.getBlob(entry.path, {
            signal: controller.signal,
            onProgress: (snapshot) => {
              if (!canceled) setProgress(snapshot);
            },
          });
          createdUrl = makeObjectUrl(blob);
          if (!canceled) setImageUrl(createdUrl);
        } else if (editable) {
          const text = await client.getText(entry.path, {
            signal: controller.signal,
            knownSize: entry.size,
            onProgress: (snapshot) => {
              if (!canceled) setProgress(snapshot);
            },
          });
          if (!canceled) {
            setContent(text);
            setDraft(text);
            setMode('preview');
            setWrap(true);
          }
        }
      } catch (err) {
        if (canceled) return;
        if (err instanceof PreviewTooLargeError) {
          setTooLarge({ size: err.size, limit: err.limit });
        } else {
          setError(asErrorInfo(err, 'GET'));
        }
      } finally {
        if (!canceled) {
          setLoading(false);
          setProgress(null);
        }
      }
    };

    void load();
    return () => {
      canceled = true;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [client, entry.path, entry.size, kind, editable, reloadKey]);

  const safeHtml = useMemo(
    () => (kind === 'markdown' && mode === 'preview' ? renderMarkdown(content) : ''),
    [kind, mode, content],
  );

  const requestClose = () => {
    if (dirty) {
      setDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await client.saveText(entry.path, draft);
      setContent(draft);
      setMode('preview');
      onToast('success', '已保存到 WebDAV', `${entry.name} 已通过 PUT 写回原文件`);
      onSaved();
    } catch (err) {
      const info = asErrorInfo(err, 'PUT');
      onToast('error', `保存失败：${info.title}`, info.message);
    } finally {
      setSaving(false);
    }
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="state">
          <span className="spinner spinner--lg" />
          <div className="state__title">正在读取文件…</div>
          <p className="state__desc">
            {progress
              ? `${formatBytes(progress.loaded)}${progress.total ? ` / ${formatBytes(progress.total)}` : ''}`
              : '通过 GET 从 WebDAV 服务端读取内容'}
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="inline-error">
          <ErrorPanel
            info={error}
            onRetry={() => setReloadKey((key) => key + 1)}
            onDismiss={onClose}
          />
        </div>
      );
    }

    if (tooLarge) {
      return (
        <EmptyState
          icon={<FileWarning size={28} />}
          title="文件过大，暂不预览"
          description={
            <>
              该文件约 {formatBytes(tooLarge.size)}，超过集中配置的预览上限{' '}
              {formatBytes(tooLarge.limit)}（CONFIG.MAX_PREVIEW_SIZE，默认 1 MB）。
              为避免浏览器卡顿与内存占用，请下载后使用本地编辑器查看或修改。
            </>
          }
          action={
            <button type="button" className="btn btn--primary" onClick={() => onDownload(entry)}>
              <Download size={15} /> 下载文件
            </button>
          }
        />
      );
    }

    if (!previewable) {
      return (
        <EmptyState
          icon={<FileIcon kind={kind} size="lg" />}
          title="此类型暂不支持在线预览"
          description=".txt / .json / .xml / .csv / .log / .md 等文本与常见图片可直接预览，其他类型请下载后查看。"
          action={
            <button type="button" className="btn btn--primary" onClick={() => onDownload(entry)}>
              <Download size={15} /> 下载文件
            </button>
          }
        />
      );
    }

    if (kind === 'image') {
      return imageUrl ? (
        <div className="image-stage">
          <img src={imageUrl} alt={entry.name} />
        </div>
      ) : null;
    }

    if (mode === 'edit') {
      return (
        <textarea
          className={`editor ${wrap ? 'editor--wrap' : ''}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          autoFocus
          aria-label="文件内容编辑器"
        />
      );
    }

    if (kind === 'markdown') {
      return (
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: safeHtml }} />
      );
    }

    // React 会自动对 {} 中的文本做转义，绝不会把文件内容当作 HTML 执行
    return <pre className={`text-preview ${wrap ? 'text-preview--wrap' : ''}`}>{content}</pre>;
  };

  return (
    <>
      <Modal
        open
        onClose={discardConfirm ? () => undefined : requestClose}
        size="wide"
        closeOnBackdrop={false}
        ariaLabel={`预览 ${entry.name}`}
      >
        <div className="dialog__head">
          <FileIcon kind={kind} size="sm" />
          <div className="preview-head-info">
            <h2 className="dialog__title">{entry.name}</h2>
            <div className="dialog__subtitle">
              {kindLabel(kind)} · {formatBytes(entry.size)} · {entry.path}
            </div>
          </div>
          <div className="dialog__head-actions">
            {dirty && (
              <span className="tag" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                未保存
              </span>
            )}
            <button
              type="button"
              className="icon-btn icon-btn--bordered"
              onClick={() => onDownload(entry)}
              title="下载文件"
              aria-label="下载文件"
            >
              <Download size={15} />
            </button>
            <button type="button" className="icon-btn" onClick={requestClose} aria-label="关闭预览">
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="preview-toolbar">
          {editable && !tooLarge && !loading && (
            <div className="segmented" role="group" aria-label="模式切换">
              <button
                type="button"
                className={`segmented__btn ${mode === 'preview' ? 'segmented__btn--active' : ''}`}
                onClick={() => setMode('preview')}
                title="预览"
                aria-label="预览"
              >
                <Eye size={15} />
              </button>
              <button
                type="button"
                className={`segmented__btn ${mode === 'edit' ? 'segmented__btn--active' : ''}`}
                onClick={() => setMode('edit')}
                title="编辑"
                aria-label="编辑"
              >
                <Pencil size={15} />
              </button>
            </div>
          )}
          {editable && !tooLarge && !loading && (
            <button
              type="button"
              className={`btn btn--sm ${wrap ? 'btn--ghost' : ''}`}
              onClick={() => setWrap((value) => !value)}
              title="切换自动换行"
            >
              <WrapText size={14} /> 自动换行 {wrap ? '开' : '关'}
            </button>
          )}
          {editable && !tooLarge && !loading && (
            <button type="button" className="btn btn--sm" onClick={() => setReloadKey((key) => key + 1)} title="重新读取">
              <RefreshCw size={14} /> 重新读取
            </button>
          )}
          <div className="preview-toolbar__spacer" />
          {editable && !tooLarge && !loading && mode === 'edit' && (
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => void save()}
              disabled={saving || !dirty}
            >
              {saving ? <span className="spinner" /> : <Save size={14} />}
              {saving ? '保存中…' : '保存到 WebDAV'}
            </button>
          )}
        </div>

        <div className="preview-body">{renderBody()}</div>

        <div className="preview-foot">
          {kind === 'image' ? (
            <span>使用浏览器原生 &lt;img&gt; 展示，内容通过 GET 读取为 Blob URL</span>
          ) : kind === 'markdown' ? (
            <span>Markdown 渲染默认禁用原始 HTML，链接协议经白名单过滤，输出再经 DOMPurify 净化</span>
          ) : editable ? (
            <span>内容以转义后的纯文本展示，不会执行任何 HTML / 脚本</span>
          ) : (
            <span>仅提供下载</span>
          )}
          <div className="preview-foot__spacer" />
          {editable && !tooLarge && (
            <span>
              预览上限 {formatBytes(CONFIG.MAX_PREVIEW_SIZE)} · 共 {content.length.toLocaleString()} 字符
            </span>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        state={
          discardConfirm
            ? {
                title: '放弃未保存的修改？',
                description: `「${entry.name}」有尚未保存的内容。关闭预览后这些修改将丢失，且不会写回 WebDAV 服务端。`,
                confirmLabel: '放弃修改',
                tone: 'danger',
                onConfirm: onClose,
              }
            : null
        }
        onClose={() => setDiscardConfirm(false)}
      />
    </>
  );
}
