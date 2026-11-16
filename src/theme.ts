import type { Status } from './types'

/**
 * Chart colours. Workflow states use a palette checked for colour-blind separation
 * (violet → amber → green for the three active states); the two "not started" states are
 * neutral greys so they recede. Every chart also carries text labels, so colour is never
 * the only cue.
 */
export const STATUS_COLOR: Record<Status, string> = {
  backlog: '#c5cad8',
  todo: '#8d96ab',
  in_progress: '#6250d6',
  review: '#eda100',
  done: '#1baf7a',
}

export const CHART = {
  actual: '#6250d6',
  planned: '#b9bfd0',
  grid: '#e6e9f1',
  axis: '#8a92a8',
  good: '#12925a',
  warning: '#d98a00',
  serious: '#e06a2c',
  critical: '#d03b3b',
}

export const SEVERITY_COLOR = {
  Low: '#12925a',
  Medium: '#d98a00',
  High: '#e06a2c',
  Critical: '#d03b3b',
} as const
