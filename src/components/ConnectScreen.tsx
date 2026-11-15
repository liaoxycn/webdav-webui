import { Cloud, FolderOpen, Moon, ShieldCheck, Sun, Zap } from 'lucide-react';
import type { ConnectionFormState, DavErrorInfo } from '../types';
import { ConnectionForm } from './ConnectionForm';

interface Props {
  initial: ConnectionFormState;
  formVersion: number;
  busy: boolean;
  error: DavErrorInfo | null;
  hasSaved: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSubmit: (form: ConnectionFormState) => void;
  onClear: () => void;
  onDismissError: () => void;
}

function BrandIllustration() {
  return (
    <svg className="connect-illustration" viewBox="0 0 340 168" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="328" height="156" rx="16" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.24)" />
      <path d="M6 40h328" stroke="rgba(255,255,255,0.2)" />
      <circle cx="24" cy="23" r="4" fill="rgba(255,255,255,0.55)" />
      <circle cx="38" cy="23" r="4" fill="rgba(255,255,255,0.35)" />
      <circle cx="52" cy="23" r="4" fill="rgba(255,255,255,0.22)" />
      <rect x="72" y="17" width="128" height="12" rx="6" fill="rgba(255,255,255,0.16)" />

      <rect x="22" y="54" width="296" height="26" rx="7" fill="rgba(255,255,255,0.07)" />
      <path d="M34 67h8l2-4h10l2 4h8" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="74" y="63" width="76" height="7" rx="3.5" fill="rgba(255,255,255,0.34)" />
      <rect x="262" y="63" width="40" height="7" rx="3.5" fill="rgba(255,255,255,0.18)" />

      <rect x="22" y="86" width="296" height="26" rx="7" fill="rgba(255,255,255,0.07)" />
      <rect x="34" y="93" width="12" height="12" rx="3" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" />
      <rect x="74" y="95" width="112" height="7" rx="3.5" fill="rgba(255,255,255,0.3)" />
      <rect x="262" y="95" width="40" height="7" rx="3.5" fill="rgba(255,255,255,0.18)" />

      <rect x="22" y="118" width="296" height="26" rx="7" fill="rgba(255,255,255,0.07)" />
      <rect x="34" y="125" width="12" height="12" rx="3" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" />
      <rect x="74" y="127" width="88" height="7" rx="3.5" fill="rgba(255,255,255,0.3)" />
      <rect x="262" y="127" width="40" height="7" rx="3.5" fill="rgba(255,255,255,0.18)" />

      <g transform="translate(238 108)">
        <rect width="92" height="54" rx="12" fill="#ffffff" fillOpacity="0.94" />
        <rect x="12" y="12" width="30" height="30" rx="8" fill="#e0e7ff" />
        <path d="M19 27h16M27 21v12" stroke="#4f46e5" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="50" y="16" width="30" height="6" rx="3" fill="#c7d2fe" />
        <rect x="50" y="28" width="22" height="5" rx="2.5" fill="#e2e8f0" />
      </g>
    </svg>
  );
}

export function ConnectScreen(props: Props) {
  return (
    <div className="connect-page">
      <div className="connect-page__top">
        <button type="button" className="icon-btn icon-btn--bordered" onClick={props.onToggleTheme} aria-label="切换主题">
          {props.theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      <div className="connect-card">
        <div className="connect-brand">
          <div className="brand-row">
            <span className="brand-mark">
              <Cloud size={20} strokeWidth={2} />
            </span>
            <span>
              <div className="brand-name">WebDAV Studio</div>
              <div className="brand-sub">PURE FRONTEND FILE MANAGER</div>
            </span>
          </div>

          <h2 className="connect-brand__title">
            把 WebDAV
            <br />
            装进浏览器
          </h2>
          <p className="connect-brand__desc">
            无需后端、无需代理。用标准 WebDAV 协议直接管理远端文件，凭据始终留在你自己的浏览器里。
          </p>

          <BrandIllustration />

          <div className="connect-features">
            <div className="connect-feature">
              <span className="connect-feature__icon"><Zap size={14} /></span>
              <span>
                <strong>浏览器直连</strong>
                PROPFIND / GET / PUT / MOVE / DELETE / MKCOL 全协议操作
              </span>
            </div>
            <div className="connect-feature">
              <span className="connect-feature__icon"><FolderOpen size={14} /></span>
              <span>
                <strong>完整文件闭环</strong>
                浏览、上传、下载、重命名、新建文件夹与在线编辑
              </span>
            </div>
            <div className="connect-feature">
              <span className="connect-feature__icon"><ShieldCheck size={14} /></span>
              <span>
                <strong>本地凭据 · 安全渲染</strong>
                密码默认不落盘，Markdown 预览禁用原始 HTML
              </span>
            </div>
          </div>
        </div>

        <div className="connect-form">
          <ConnectionForm
            key={props.formVersion}
            initial={props.initial}
            busy={props.busy}
            error={props.error}
            hasSaved={props.hasSaved}
            theme={props.theme}
            onToggleTheme={props.onToggleTheme}
            onSubmit={props.onSubmit}
            onClear={props.onClear}
            onDismissError={props.onDismissError}
          />
        </div>
      </div>
    </div>
  );
}
