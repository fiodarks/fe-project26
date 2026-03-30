import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
export default defineConfig({
  base: (() => {
    const explicitBase = process.env.VITE_BASE ?? process.env.BASE
    if (explicitBase) return explicitBase

    const homepage =
      process.env.npm_package_homepage ?? readHomepageFromPackageJson()
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

function readHomepageFromPackageJson(): string | undefined {
  try {
    const raw = readFileSync(new URL('./package.json', import.meta.url), 'utf8')
    const parsed = JSON.parse(raw) as { homepage?: unknown }
    return typeof parsed.homepage === 'string' ? parsed.homepage : undefined
  } catch {
    return undefined
  }
}
