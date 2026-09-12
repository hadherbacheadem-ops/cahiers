/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'
import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Public path of the app. `/` locally; `/<dépôt>/` on GitHub Pages (set by
 * the deploy workflow), `/` on Cloudflare Pages or any root host.
 */
const base = normalizeBase(process.env.VITE_BASE)

function normalizeBase(raw: string | undefined): string {
  const b = (raw ?? '/').trim()
  if (!b || b === '/') return '/'
  return `/${b.replace(/^\/+|\/+$/g, '')}/`
}

/**
 * Static hosts without an SPA fallback (GitHub Pages) serve 404.html for
 * unknown paths: a copy of index.html there lets deep links open the app.
 */
function spaFallback404(): Plugin {
  return {
    name: 'cahiers:spa-404',
    apply: 'build',
    async closeBundle() {
      await copyFile(resolve('dist/index.html'), resolve('dist/404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    spaFallback404(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cahiers',
        short_name: 'Cahiers',
        description: 'Fiches de cours, exercices générés avec Claude, révision espacée (FSRS).',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0f1115',
        theme_color: '#3b5bdb',
        // Relative to the manifest, which sits at the base: valid for any base.
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          // Safari ignores `sizes: any` SVG icons: a real PNG for the home screen.
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        // Fonts, KaTeX and the sql.js wasm are large but must work offline.
        globPatterns: ['**/*.{js,css,html,svg,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
