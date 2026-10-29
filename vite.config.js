import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const PWA_ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

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
  plugins: [
    advertiseRoute(),
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        name: 'GTA Praha',
        short_name: 'GTA Praha',
        description: 'GTA Praha. Drive, walk and explore a playable Prague.',
        theme_color: '#f3f0e9',
        background_color: '#f3f0e9',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['games'],
        icons: [
          ...PWA_ICON_SIZES.map((size) => ({
            src: `/icons/icon-${size}x${size}.svg`,
            sizes: `${size}x${size}`,
            type: 'image/svg+xml',
            purpose: 'any',
          })),
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // App shell only. Streets, textures, models, sounds, and aerial photos stay on the network.
        globPatterns: ['**/*.{js,css,html}'],
        globIgnores: [
          '**/node_modules/**/*',
          'sw.js',
          'workbox-*.js',
          'cities/**',
          'models/**',
          'sounds/**',
          'data/**',
        ],
        // The tree renderer ships as one built JS chunk a little over 4 MB.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/$/],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {main: 'index.html', ads: 'ads.html'},
      output: {manualChunks: {three: ['three']}},
    },
  },
});
