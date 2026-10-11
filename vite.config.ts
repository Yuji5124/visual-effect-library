import { defineConfig } from 'vite';

// base: './' で GitHub Pages のサブパス（/visual-effect-library/）でもそのまま動作する
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // three.js を別チャンクにしてキャッシュを効かせる
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { host: true },
});
