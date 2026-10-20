import {defineConfig} from 'vite';
export default defineConfig({
  build: {
    rollupOptions: {
      input: {main: 'index.html', ads: 'ads.html'},
      output: {manualChunks: {three: ['three']}},
    },
  },
});
