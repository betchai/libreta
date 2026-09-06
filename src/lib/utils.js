// Merge Tailwind classes, resolving conflicts.
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Build a relative URL for a page name (mirrors Base44's createPageUrl).
export function createPageUrl(pageName) {
  if (!pageName) return window.__DEMO__ ? '/demo' : '/'
  const base = window.__DEMO__ ? '/demo' : ''
  return `${base}/${pageName}`
}
