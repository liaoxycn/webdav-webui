import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import { CONFIG, CORS_EXAMPLE } from '../config';
import type { ConnectionFormState, DavErrorInfo } from '../types';
import { ErrorPanel } from './Overlays';

interface Props {
  initial: ConnectionFormState;
  busy: boolean;
  error: DavErrorInfo | null;
  hasSaved: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSubmit: (form: ConnectionFormState) => void;
  onClear: () => void;
  onDismissError: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  compact?: boolean;
  /** 是否显示主题切换（连接页与设置弹窗共用一个开关即可） */
  showThemeToggle?: boolean;
  hideHead?: boolean;
}

export function ConnectionForm({
  initial,
  busy,
  error,
  hasSaved,
  theme,
  onToggleTheme,
  onSubmit,
  onClear,
  onDismissError,
  onCancel,
  submitLabel = '连接并进入文件管理',
  compact = false,
  showThemeToggle = false,
  hideHead = false,
}: Props) {
  const [form, setForm] = useState<ConnectionFormState>(initial);
  const [showPassword, setShowPassword] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // 连接失败时把「原因 + 处理建议」滚入可视区域，避免被折叠在表单底部
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  const update = (patch: Partial<ConnectionFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit(form);
      }}
    >
      {!hideHead && (
        <div className="connect-form__head">
          <div className="connect-form__eyebrow">CONNECTION</div>
          <h1 className="connect-form__title">连接到 WebDAV</h1>
          <p className="connect-form__subtitle">
            填写服务端信息后先发起一次 PROPFIND 探测，成功即进入文件管理界面。
          </p>
        </div>
      )}

      <div className="connect-form__fields">
        <label className="field">
          <span className="field__label">WebDAV 根 URL</span>
          <div className="input-wrap">
            <span className="input-wrap__icon">
              <Globe size={16} />
            </span>
            <input
              className="input input--mono"
              type="url"
              value={form.rootUrl}
              onChange={(event) => update({ rootUrl: event.target.value })}
              placeholder="https://dav.example.com/remote.php/dav/files/alice/"
              autoComplete="url"
              spellCheck={false}
              required
            />
          </div>
          <span className="field__hint">
            必须指向真正的 WebDAV 端点（不是网站首页），建议以 / 结尾。
          </span>
        </label>

        <div className="connect-form__row">
          <label className="field">
            <span className="field__label">用户名</span>
            <div className="input-wrap">
              <span className="input-wrap__icon">
                <UserRound size={16} />
              </span>
              <input
                className="input"
                type="text"
                value={form.username}
                onChange={(event) => update({ username: event.target.value })}
                placeholder="留空表示匿名访问"
                autoComplete="username"
                spellCheck={false}
              />
            </div>
          </label>
          <label className="field">
            <span className="field__label">密码</span>
            <div className="input-wrap">
              <span className="input-wrap__icon">
                <Lock size={16} />
              </span>
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => update({ password: event.target.value })}
                placeholder="应用专用密码"
                autoComplete="current-password"
              />
              <span className="input-wrap__trailing">
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 30, height: 30 }}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </div>
          </label>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.rememberPassword}
            onChange={(event) => update({ rememberPassword: event.target.checked })}
          />
          <span className="checkbox__text">
            <strong>记住密码</strong>
            <br />
            默认只保存根 URL 与用户名。勾选后密码才会写入本浏览器的 localStorage，未勾选时密码仅保留在当前会话内存中，刷新页面即需重新输入。
          </span>
        </label>
      </div>

      <div className="notice" style={{ marginTop: 18 }}>
        <ShieldCheck size={16} className="notice__icon" />
        <span>
          <strong>凭据仅保存在当前浏览器本地</strong>，不会上传到任何第三方服务：本应用是纯前端静态站点，没有后端、没有代理、没有统计上报，所有请求都由浏览器直接发往你填写的 WebDAV 服务端。
        </span>
      </div>
      <div className="notice notice--warning" style={{ marginTop: 9 }}>
        <AlertTriangle size={16} className="notice__icon" />
        <span>
          <strong>本地明文存储风险：</strong>勾选「记住密码」后，密码会以<strong>明文</strong>存放在 localStorage，任何能访问该浏览器配置文件的人或同源页面脚本都可能读取。请勿在公共 / 共用设备上勾选；点击「清除连接信息」可同步移除已保存的凭据。
        </span>
      </div>

      {error && (
        <div style={{ marginTop: 16 }} ref={errorRef}>
          <ErrorPanel info={error} onDismiss={onDismissError} compact />
        </div>
      )}

      <div className="connect-form__actions">
        <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
          {busy ? <span className="spinner" /> : <KeyRound size={16} />}
          {busy ? '正在验证连接…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--lg" onClick={onCancel} disabled={busy}>
            取消
          </button>
        )}
      </div>

      <details className="details">
        <summary>
          <ShieldCheck size={14} /> 支持的认证方式与浏览器限制
        </summary>
        <div className="details__body">
          <h4>已支持</h4>
          <ul>
            <li>
              <span className="tag">HTTP Basic Auth</span> — 通过 Authorization: Basic 头发送（用户名 / 密码按 UTF-8 编码后再 Base64）。
            </li>
            <li>
              <span className="tag tag--muted">匿名访问</span> — 用户名与密码都留空时不发送认证头。
            </li>
          </ul>
          <h4>暂不支持（会明确报错）</h4>
          <ul>
            <li>Digest / NTLM / Negotiate（Kerberos）等质询式认证：浏览器跨域预检请求无法完成握手。</li>
            <li>OAuth2 Bearer Token、客户端证书、需要登录 Cookie 或 CSRF Token 的网盘网关。</li>
            <li>URL 中内嵌凭据（https://user:pass@host）：浏览器会主动拦截这类子请求。</li>
            <li>
              若服务端返回 WWW-Authenticate: Digest / Negotiate 等，连接时会给出「不支持的认证方式」提示与改造建议。
            </li>
          </ul>
          <h4>浏览器限制</h4>
          <ul>
            <li>浏览器同源策略不可绕过：WebDAV 服务端必须返回允许当前站点来源的 CORS 响应头，本应用<strong>没有后端代理</strong>。</li>
            <li>Authorization、Depth、Destination、Overwrite 等自定义头会触发 OPTIONS 预检，必须被 Allow-Headers 放行。</li>
            <li>若本站以 HTTPS 打开，WebDAV 地址也必须是 HTTPS；HTTP 地址会被混合内容策略拦截。自签名证书需先在浏览器中单独访问并信任。</li>
            <li>浏览器不暴露被 CORS 隐藏的响应头；请通过 Access-Control-Expose-Headers 暴露 ETag、Content-Length 等。</li>
          </ul>
          <h4>服务端 CORS 配置参考</h4>
          <pre className="code-block">{CORS_EXAMPLE}</pre>
        </div>
      </details>

      {!compact && (
        <div className="connect-form__foot">
          <span>
            {hasSaved
              ? '已在本浏览器保存连接信息（根 URL 与用户名）'
              : '尚未保存连接信息；连接成功后自动保存根 URL 与用户名'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {showThemeToggle && (
              <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label="切换主题">
                {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              </button>
            )}
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={onClear}
              disabled={!hasSaved && !form.rootUrl && !form.username && !form.password}
              title="清除本浏览器保存的连接信息与凭据"
            >
              <Trash2 size={13} /> 清除连接信息
            </button>
          </span>
        </div>
      )}
      {compact && (
        <div className="connect-form__foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClear} disabled={!hasSaved}>
            <Trash2 size={13} /> 清除连接信息与已保存的凭据
          </button>
          <span>预览上限 {Math.round(CONFIG.MAX_PREVIEW_SIZE / 1024)} KB · 分页 {CONFIG.PAGE_SIZE} 项/页</span>
        </div>
      )}
    </form>
  );
}
