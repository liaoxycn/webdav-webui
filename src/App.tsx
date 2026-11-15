import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, X } from 'lucide-react';
import { Browser } from './components/Browser';
import { ConnectScreen } from './components/ConnectScreen';
import { ConnectionForm } from './components/ConnectionForm';
import { Modal, Toasts } from './components/Overlays';
import { normalizeRootUrl } from './lib/path';
import { clearConnection, loadStoredConnection, loadUiPreferences, saveConnection, saveUiPreferences } from './lib/storage';
import { WebDavClient } from './lib/webdav';
import { asErrorInfo } from './lib/errors';
import type {
  ConnectionFormState,
  Credentials,
  DavErrorInfo,
  Toast,
  ToastTone,
} from './types';

interface Session {
  credentials: Credentials;
  rememberPassword: boolean;
}

function initialForm(): ConnectionFormState {
  const stored = loadStoredConnection();
  return {
    rootUrl: stored?.rootUrl ?? '',
    username: stored?.username ?? '',
    // 未记住密码时，密码绝不从 localStorage 恢复，刷新页面后需要重新输入
    password: stored?.rememberPassword ? (stored.password ?? '') : '',
    rememberPassword: stored?.rememberPassword ?? false,
  };
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadUiPreferences().theme ?? 'light');
  const [session, setSession] = useState<Session | null>(null);
  const [formInitial, setFormInitial] = useState<ConnectionFormState>(initialForm);
  const [formVersion, setFormVersion] = useState(0);
  const [hasSaved, setHasSaved] = useState(() => loadStoredConnection() !== null);
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState<DavErrorInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const client = useMemo(
    () => (session ? new WebDavClient(session.credentials) : null),
    [session],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveUiPreferences({ theme });
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((value) => (value === 'light' ? 'dark' : 'light')),
    [],
  );

  const pushToast = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = `app-t${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, tone, title, description }].slice(-3));
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4800);
  }, []);

  const connect = async (form: ConnectionFormState) => {
    setConnectError(null);
    const { url, error: urlError } = normalizeRootUrl(form.rootUrl);
    if (urlError) {
      setConnectError({
        category: 'client',
        title: '连接配置有误',
        message: urlError,
        suggestions: [
          '请填写完整的绝对地址，例如 https://dav.example.com/dav/ 。',
          '不要填写网站首页地址，也不要在 URL 中内嵌账号密码。',
        ],
      });
      return;
    }

    const credentials: Credentials = {
      rootUrl: url,
      username: form.username.trim(),
      password: form.password,
    };
    const normalizedForm: ConnectionFormState = { ...form, ...credentials };
    const client = new WebDavClient(credentials);
    setBusy(true);
    try {
      // 连接前先用 PROPFIND Depth:1 探测根目录，失败时给出分类错误与处理建议
      await client.testConnection();
      saveConnection(normalizedForm);
      setHasSaved(true);
      setFormInitial(normalizedForm);
      setSession({ credentials, rememberPassword: form.rememberPassword });
      setSettingsOpen(false);
      pushToast('success', '连接成功', `${new URL(url).host} 的 WebDAV 根目录已就绪`);
    } catch (err) {
      setConnectError(asErrorInfo(err, 'PROPFIND'));
    } finally {
      setBusy(false);
    }
  };

  const clearSaved = () => {
    clearConnection();
    setFormInitial({ rootUrl: '', username: '', password: '', rememberPassword: false });
    setFormVersion((version) => version + 1);
    setHasSaved(false);
    setConnectError(null);
    pushToast('success', '已清除连接信息', 'localStorage 中的根 URL、用户名与已保存的密码均已移除');
  };

  const disconnect = () => {
    setSession(null);
    setConnectError(null);
    setFormInitial(initialForm());
    setFormVersion((version) => version + 1);
    pushToast('info', '已断开连接', '未记住密码时，密码已仅存在于内存中，断开后需要重新输入');
  };

  const sharedFormProps = {
    busy,
    error: connectError,
    hasSaved,
    theme,
    onToggleTheme: toggleTheme,
    onSubmit: (form: ConnectionFormState) => void connect(form),
    onClear: clearSaved,
    onDismissError: () => setConnectError(null),
  };

  return (
    <>
      {session && client ? (
        <Browser
          key={`${session.credentials.rootUrl}|${session.credentials.username}|${session.credentials.password}`}
          client={client}
          credentials={session.credentials}
          theme={theme}
          onToggleTheme={toggleTheme}
          onDisconnect={disconnect}
          onOpenSettings={() => {
            setConnectError(null);
            setFormVersion((version) => version + 1);
            setSettingsOpen(true);
          }}
        />
      ) : (
        <ConnectScreen
          initial={formInitial}
          formVersion={formVersion}
          {...sharedFormProps}
          theme={theme}
        />
      )}

      <Modal
        open={settingsOpen}
        onClose={() => {
          if (busy) return;
          setSettingsOpen(false);
          setConnectError(null);
        }}
        size="md"
        ariaLabel="连接设置"
      >
        <div className="dialog__head">
          <div className="dialog__icon"><Cloud size={17} /></div>
          <div className="preview-head-info">
            <h2 className="dialog__title">连接设置</h2>
            <div className="dialog__subtitle">读取 / 修改 / 清除本浏览器保存的连接信息</div>
          </div>
          <div className="dialog__head-actions">
            <button type="button" className="icon-btn" onClick={() => setSettingsOpen(false)} aria-label="关闭">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="dialog__body" style={{ padding: '18px 22px' }}>
          <ConnectionForm
            key={`settings-${formVersion}`}
            initial={formInitial}
            {...sharedFormProps}
            submitLabel="测试并应用新配置"
            compact
            hideHead
            onCancel={() => {
              setSettingsOpen(false);
              setConnectError(null);
            }}
          />
        </div>
      </Modal>

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />
    </>
  );
}
