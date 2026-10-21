import { defineConfig } from 'vite';

// The wall tablet runs Android WebView 106 — keep JS output within Chromium 106.
// CSS targets chrome61 on purpose: the tablet's WebView rejects 4/8-digit hex colours (#0000,
// #ffffffbf) even though Chrome 106 should support them, and a newer target lets the minifier
// rewrite transparent/rgba() into that form. Verified on-device with CSS.supports().
// Reverse geocoding (city of a person who is away) goes through this relay: the wall tablet's old Android does not
// trust Let's Encrypt certificates, so the PC that serves the dashboard makes the HTTPS request for it.
// Nominatim's usage policy asks for an identifying User-Agent and at most 1 request per second (the dashboard throttles).
const nominatim = {
  '/nominatim': {
    target: 'https://nominatim.openstreetmap.org',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/nominatim/, ''),
    configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('User-Agent', 'Home-Screen/1.0'))
  }
};

// Album covers come from Home Assistant through this relay, so they are same-origin: the player can then read the
// cover's pixels to colour its background (Home Assistant itself sends no CORS headers for them).
const ha = {
  '/ha': { target: (process.env.HA_URL || 'http://homeassistant.local:8123'), changeOrigin: true, rewrite: (p) => p.replace(/^\/ha/, '') }
};

export default defineConfig({
  build: {
    target: 'chrome106',
    cssTarget: 'chrome61',
  },
  server: { host: true, proxy: Object.assign({}, nominatim, ha) },
  preview: { proxy: Object.assign({}, nominatim, ha) },
});
