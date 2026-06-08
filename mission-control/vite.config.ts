import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for Mission Control.
// - dev server proxies /admin and /socket.io to the local Piqabu server so
//   the dashboard can run alongside `node server/server.js` during dev.
// - production build is a static bundle suitable for Netlify (config in
//   mission-control/netlify.toml below).
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5174,
        proxy: {
            '/admin': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
});
