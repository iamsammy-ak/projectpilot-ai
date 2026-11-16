export const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 10)

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** "$240,000" */
export const fmtMoney = (n: number) => USD.format(n)
/** "$240K" */
export const fmtMoneyCompact = (n: number) => COMPACT.format(n)

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (parts[0][0] + last).toUpperCase()
}

const AVATAR_COLORS = ['#6250d6', '#2a78d6', '#0e8f63', '#c2410c', '#b83280', '#0f766e', '#7c3aed', '#1d4ed8', '#a16207', '#be123c']

/** Stable colour for a name, so a person looks the same in every view. */
export function colorFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export const PROJECT_COLORS = ['#6250d6', '#2a78d6', '#1baf7a', '#eb6834', '#e87ba4', '#eda100']

export function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  const m = t.match(/^.*?[.!?](?=\s|$)/)
  return (m ? m[0] : t).trim()
}

export function download(filename: string, content: string | Blob, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // Leading BOM so Excel opens UTF-8 correctly.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project'
