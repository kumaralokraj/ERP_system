import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite';

const spaRoutePrefixes = ['/admin', '/student']

const isSpaNavigationRequest = (req) => {
  if (req.method !== 'GET') {
    return false
  }

  const acceptHeader = req.headers?.accept || ''
  if (!acceptHeader.includes('text/html')) {
    return false
  }

  const requestPath = req.url?.split('?')[0] || '/'
  return spaRoutePrefixes.some(
    (prefix) => requestPath === prefix || requestPath.startsWith(`${prefix}/`),
  )
}

const spaRefreshFallbackPlugin = {
  name: 'spa-refresh-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      // Keep API proxying intact, but serve index.html for browser refreshes on SPA routes.
      if (isSpaNavigationRequest(req)) {
        req.url = '/'
      }
      next()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), spaRefreshFallbackPlugin],
  server: {
    proxy: {
      '/admin': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/classes': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/class-sessions': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/enroll-student': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/promote-students': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/promotions': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/results': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/session-rollover': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '^/student(?:/|$)': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/students': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/adminLogin': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/studentLogin': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
