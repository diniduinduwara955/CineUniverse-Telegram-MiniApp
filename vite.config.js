import { defineConfig, loadEnv } from 'vite';

const RENDER_API = 'https://cineuniverse-telegram-miniapp.onrender.com/api';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = String(env.VITE_API_BASE_URL || RENDER_API).trim() || RENDER_API;

  return {
    // Keep the existing local development proxy.
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },

    // Production fallback for the Mini App API.
    // Existing VITE_API_BASE_URL still wins when configured.
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBase),
    },
  };
});
