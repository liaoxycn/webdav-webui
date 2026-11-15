import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Copy,
  Info,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { CORS_EXAMPLE } from '../config';
import { asErrorInfo } from '../lib/errors';
import type {
  ConfirmState,
  ConflictChoice,
  DavErrorInfo,
  InputDialogState,
  PendingConflict,
  Toast,
} from '../types';

let openDialogCount = 0;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'wide';
  closeOnBackdrop?: boolean;
  ariaLabel?: string;
}

export function Modal({
  open,
  onClose,
  children,
  size = 'sm',
  closeOnBackdrop = true,
  ariaLabel,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    openDialogCount += 1;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0) document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizeClass = size === 'wide' ? 'dialog--wide' : size === 'md' ? 'dialog--md' : '';
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`dialog ${sizeClass}`} role="dialog" aria-modal="true" aria-label={ariaLabel}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 统一的「分类错误 + 处理建议」展示组件 */
export function ErrorPanel({
  info,
  onRetry,
  onDismiss,
  compact = false,
}: {
  info: DavErrorInfo;
  onRetry?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copyDiagnostic = async () => {
    const text = [
      `[${info.category}] ${info.title}`,
      info.status ? `HTTP ${info.status}` : '',
      info.method ? `Method ${info.method}` : '',
      info.message,
      info.detail ?? '',
      ...info.suggestions,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="error-card">
      <div className="error-card__head">
        <AlertCircle size={16} style={{ flex: 'none', marginTop: 1 }} />
        <span>{info.title}</span>
        {info.status ? (
          <span className="tag tag--muted" style={{ marginLeft: 'auto' }}>
            HTTP {info.status}
          </span>
        ) : null}
      </div>
      <p className="error-card__message">{info.message}</p>
      {info.suggestions.length > 0 && (
        <>
          <div className="error-card__label">处理建议</div>
          <ul className="error-suggestions">
            {info.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </>
      )}
      {info.category === 'cors' || info.category === 'network' ? (
        <details className="details" style={{ margin: '12px 0 0 26px' }}>
          <summary>服务端 CORS 配置参考（点击展开）</summary>
          <div className="details__body" style={{ padding: '10px 0 0' }}>
            <pre className="code-block">{CORS_EXAMPLE}</pre>
          </div>
        </details>
      ) : null}
      {!compact && info.detail ? <pre className="error-card__detail">{info.detail}</pre> : null}
      {(onRetry || onDismiss || navigator.clipboard) && (
        <div className="toolbar__group" style={{ margin: '13px 0 0 26px' }}>
          {onRetry && (
            <button type="button" className="btn btn--sm" onClick={onRetry}>
              <RotateCcw size={13} /> 重试
            </button>
          )}
          <button type="button" className="btn btn--sm btn--ghost" onClick={copyDiagnostic}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? '已复制' : '复制诊断信息'}
          </button>
          {onDismiss && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={onDismiss}>
              关闭
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [state]);

  if (!state) return null;
  const danger = state.tone === 'danger';

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await state.onConfirm();
      onClose();
    } catch (err) {
      setError(asErrorInfo(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={busy ? () => undefined : onClose} ariaLabel={state.title}>
      <div className="dialog__head">
        <div className={`dialog__icon ${danger ? 'dialog__icon--danger' : 'dialog__icon--warning'}`}>
          {danger ? <ShieldAlert size={17} /> : <CircleHelp size={17} />}
        </div>
        <h2 className="dialog__title">{state.title}</h2>
        <div className="dialog__head-actions">
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="dialog__body">
        <p className="dialog__text">{state.description}</p>
        {danger && (
          <div className="notice notice--danger" style={{ marginTop: 14 }}>
            <AlertTriangle size={15} className="notice__icon" />
            <span>此操作不可撤销，请确认目标无误后再继续。</span>
          </div>
        )}
        {error && <p className="field-error" style={{ marginTop: 12 }}>{error}</p>}
      </div>
      <div className="dialog__foot">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
          onClick={run}
          disabled={busy}
        >
          {busy ? <span className="spinner" /> : null}
          {state.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function InputDialog({
  state,
  onClose,
}: {
  state: InputDialogState | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state) {
      setValue(state.initialValue);
      setError(null);
      setBusy(false);
    }
  }, [state]);

  if (!state) return null;

  const submit = async () => {
    const validationError = state.validate(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await state.onSubmit(value.trim());
      onClose();
    } catch (err) {
      setError(asErrorInfo(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={busy ? () => undefined : onClose} ariaLabel={state.title}>
      <div className="dialog__head">
        <div className="dialog__icon">
          <ChevronRight size={17} />
        </div>
        <h2 className="dialog__title">{state.title}</h2>
        <div className="dialog__head-actions">
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="dialog__body">
        {state.description && <p className="dialog__text" style={{ marginBottom: 14 }}>{state.description}</p>}
        <label className="field">
          <span className="field__label">{state.label}</span>
          <input
            className={`input ${error ? 'input--error' : ''}`}
            value={value}
            placeholder={state.placeholder}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !busy) void submit();
            }}
            autoFocus
            spellCheck={false}
          />
          {error && <span className="field-error">{error}</span>}
        </label>
      </div>
      <div className="dialog__foot">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          {state.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** 同名上传冲突：覆盖 / 自动重命名 / 跳过 */
export function OverwriteDialog({ state }: { state: PendingConflict | null }) {
  const [applyToAll, setApplyToAll] = useState(false);

  useEffect(() => {
    setApplyToAll(false);
  }, [state]);

  if (!state) return null;
  const choose = (choice: ConflictChoice) => state.resolve(choice, applyToAll);

  return (
    <Modal open onClose={() => choose('skip')} closeOnBackdrop={false} ariaLabel="同名文件处理">
      <div className="dialog__head">
        <div className="dialog__icon dialog__icon--warning">
          <AlertTriangle size={17} />
        </div>
        <h2 className="dialog__title">目标文件已存在</h2>
      </div>
      <div className="dialog__body">
        <p className="dialog__text">
          当前目录下已存在 <strong>{state.name}</strong>，请选择如何处理本次上传。
        </p>
        <div className="notice notice--warning" style={{ margin: '14px 0' }}>
          <AlertTriangle size={15} className="notice__icon" />
          <span>「覆盖」会用新内容替换原文件，且不可撤销；「自动重命名」会保留两份文件。</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="btn btn--block" style={{ justifyContent: 'flex-start' }} onClick={() => choose('rename')}>
            <CheckCircle2 size={15} color="var(--success)" /> 自动重命名（推荐）
            <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 11.5 }}>保留两份</span>
          </button>
          <button type="button" className="btn btn--block" style={{ justifyContent: 'flex-start' }} onClick={() => choose('overwrite')}>
            <RotateCcw size={15} color="var(--warning)" /> 覆盖原文件
            <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 11.5 }}>不可撤销</span>
          </button>
          <button type="button" className="btn btn--block" style={{ justifyContent: 'flex-start' }} onClick={() => choose('skip')}>
            <X size={15} color="var(--text-3)" /> 跳过此文件
          </button>
        </div>
        <label className="checkbox" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(event) => setApplyToAll(event.target.checked)}
          />
          <span className="checkbox__text">对本次上传中的其他同名文件应用相同选择</span>
        </label>
      </div>
    </Modal>
  );
}

export function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: string) => void }) {
  if (items.length === 0) return null;
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {items.map((toast) => {
        const Icon =
          toast.tone === 'success'
            ? CheckCircle2
            : toast.tone === 'error'
              ? AlertCircle
              : toast.tone === 'warning'
                ? AlertTriangle
                : Info;
        return (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <Icon size={17} className="toast__icon" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="toast__title">{toast.title}</div>
              {toast.description && <div className="toast__desc">{toast.description}</div>}
            </div>
            <button
              type="button"
              className="toast__close"
              onClick={() => onDismiss(toast.id)}
              aria-label="关闭提示"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state__icon">{icon}</div>
      <div className="state__title">{title}</div>
      {description && <p className="state__desc">{description}</p>}
      {action}
    </div>
  );
}
