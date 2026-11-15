import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 允许通过 .env / 环境变量指定部署前缀（loadEnv 的第 3 个参数 '' 表示读取全部变量）
  // 用 '.' 作为 envDir，避免依赖 @types/node 才能拿到 process.cwd()
  const env = loadEnv(mode, '.', '');

  /**
   * 默认使用相对 base './'：构建产物中的 JS / CSS 均为 ./assets/...，
   * 同一份 dist 既能放在站点根目录，也能放在任意前缀子路径下
   * （/webui/、/apps/dav/ 等），无需为每个部署位置重新构建。
   *
   * 若需要固定绝对前缀（例如 Nginx 对 HTML 做了改写、或存在多级入口），
   * 在 .env 中设置 VITE_BASE=/webui/ 后重新构建即可。
   */
  const base = env.VITE_BASE?.trim() || './';

  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      host: '127.0.0.1',
    },
    preview: {
      port: 4173,
      host: '127.0.0.1',
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          // Vite 8 底层换成 Rolldown，manualChunks 只支持函数形式
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
            if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'icons';
            if (
              /[\\/]node_modules[\\/](markdown-it|dompurify|entities|linkify-it|mdurl|uc\.micro|punycode)[\\/]/.test(
                id,
              )
            ) {
              return 'markdown';
            }
            return;
          },
        },
      },
    },
  };
});
