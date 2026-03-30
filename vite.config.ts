import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: (() => {
    const explicitBase = process.env.VITE_BASE ?? process.env.BASE
    if (explicitBase) return explicitBase

    const homepage = '/'
    if (homepage) {
      try {
        const pathname = new URL(homepage).pathname.replace(/\/?$/, '/')
        return pathname === '//' ? '/' : pathname
      } catch {
      }
    }

    if (!process.env.GITHUB_ACTIONS) return '/'

    const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
    if (!repoName) return '/'
    if (repoName.endsWith('.github.io')) return '/'
    return `/${repoName}/`
  })(),
  plugins: [react()],
})
