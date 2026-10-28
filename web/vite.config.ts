import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const api = env.VITE_API_URL || ''
  return {
    plugins: [
      react(),
      {
        name: 'csp',
        // Tight CSP for builds; nginx sends the same policy as a header.
        transformIndexHtml(html) {
          if (mode !== 'production') return html
          const connect = ["'self'", api].filter(Boolean).join(' ')
          const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src ${connect}; base-uri 'none'; form-action 'none'; object-src 'none'`
          return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
        },
      },
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:8080' },
    },
    build: { sourcemap: false, target: 'es2022' },
  }
})
