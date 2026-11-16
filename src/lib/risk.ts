import type { Risk } from '../types'

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical'

/** Risk Score = Probability × Impact, each rated 1–5. */
export const riskScore = (r: Pick<Risk, 'probability' | 'impact'>) => r.probability * r.impact

export function severityOf(score: number): Severity {
  if (score >= 16) return 'Critical'
  if (score >= 10) return 'High'
  if (score >= 5) return 'Medium'
  return 'Low'
}

export const SCALE_LABEL = ['', 'Very low', 'Low', 'Medium', 'High', 'Very high']

export const nextRiskCode = (risks: Risk[]) => {
  const max = risks.reduce((m, r) => Math.max(m, Number(r.code.replace(/\D/g, '')) || 0), 0)
  return `R-${String(max + 1).padStart(3, '0')}`
}
