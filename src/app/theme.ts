export type Theme = 'light' | 'dark' | 'contrast'

export function loadTheme(): Theme {
  const stored = (window.localStorage.getItem('dsa_theme') ?? '').toLowerCase()
  if (stored === 'dark' || stored === 'contrast' || stored === 'light')
    return stored
  return 'light'
}

export function themeLabel(theme: Theme): string {
  switch (theme) {
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
    case 'contrast':
      return 'High contrast'
  }
}

