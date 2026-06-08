import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for Mission Control.
//
// Hosting: served by the Piqabu Node server (Render) at the /mission/
// path. So the production build uses `base: '/mission/'` to prefix all
// asset URLs, and the SPA is reachable at:
//   https://piqabu.onrender.com/mission/
//   https://admin.piqabu.live/  (server rewrites / -> /mission/)
//
// Dev: Vite serves at http://localhost:5174 with `base: '/'` so the
// dev server feels natural. The proxy forwards /admin and /socket.io
// to the local Node server on :3000 so login + data calls work.
export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === 'build' ? '/mission/' : '/',
    server: {
        port: 5174,
        proxy: {
            '/admin': { target: 'http://localhost:3000', changeOrigin: true },
            '/api':   { target: 'http://localhost:3000', changeOrigin: true },
            '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
}));
