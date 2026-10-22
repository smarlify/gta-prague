import {defineConfig} from 'vite';

function advertiseRoute() {
  const rewrite = (req, _res, next) => {
    const raw = req.url || '';
    const q = raw.indexOf('?');
    const path = q === -1 ? raw : raw.slice(0, q);
    const search = q === -1 ? '' : raw.slice(q);
    if (path === '/advertise' || path === '/advertise/') req.url = `/ads.html${search}`;
    next();
  };
  return {
    name: 'advertise-route',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); },
  };
}

export default defineConfig({
  plugins: [advertiseRoute()],
  build: {
    rollupOptions: {
      input: {main: 'index.html', ads: 'ads.html'},
      output: {manualChunks: {three: ['three']}},
    },
  },
});
