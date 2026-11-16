import { describe, expect, it } from 'vitest'
import { answer, SUGGESTED_QUESTIONS } from '../ai/assistant'
import { generateWithEngine } from '../ai/generator'
import { projectInsights, riskRecommendations } from '../ai/insights'
import { createDemoProject, createSeedWorkspace } from '../data/seed'
import type { ProjectType, Task } from '../types'
import { PROJECT_TYPE_LABEL } from '../types'
import { addDays, fromWIdx, toDay, weekday, wIdx, wIdxFloor } from './dates'
import { analyze, autoSchedule, buildGraph, cascade, wouldCycle } from './schedule'

const MONDAY = '2026-11-16'

describe('working-day calendar', () => {
  it('counts Monday to Friday only', () => {
    expect(weekday(toDay(MONDAY))).toBe(0)
    expect(wIdx('2026-11-20') - wIdx(MONDAY)).toBe(4) // Friday
    expect(wIdx('2026-11-23') - wIdx(MONDAY)).toBe(5) // next Monday
  })
  it('maps weekends forward for starts and back for deadlines', () => {
    expect(fromWIdx(wIdx('2026-11-21'))).toBe('2026-11-23')
    expect(fromWIdx(wIdxFloor('2026-11-22'))).toBe('2026-11-20')
  })
  it('round-trips every working day', () => {
    for (let i = 0; i < 400; i++) {
      const iso = addDays(MONDAY, i)
      if (weekday(toDay(iso)) < 5) expect(fromWIdx(wIdx(iso))).toBe(iso)
    }
  })
})

describe('demo project', () => {
  const p = createDemoProject(MONDAY)
  const a = analyze(p, MONDAY)

  it('has the ten required phases and spans exactly 12 weeks', () => {
    expect(a.phases.map((r) => r.task.name)).toEqual([
      'Project Initiation',
      'Requirements Gathering',
      'System Architecture',
      'UI/UX Design',
      'Backend Development',
      'Frontend Development',
      'AI Integration',
      'Testing and Quality Assurance',
      'Deployment',
      'Project Closure',
    ])
    expect(a.eIdx - a.sIdx + 1).toBe(60)
    expect(a.end).toBe(p.targetEnd)
  })
  it('numbers the WBS hierarchically', () => {
    expect(a.rows[0].code).toBe('1.0')
    expect(a.rows[1].code).toBe('1.1')
    expect(a.byId.get(a.phases[9].childIds[3])!.code).toBe('10.4')
  })
  it('respects every dependency', () => {
    for (const r of a.leaves) for (const pid of r.preds) expect(a.byId.get(pid)!.eIdx).toBeLessThanOrEqual(r.sIdx)
  })
  it('has a critical path that reaches the project end', () => {
    expect(a.critical.length).toBeGreaterThan(5)
    expect(Math.max(...a.critical.map((r) => r.eIdx))).toBe(a.eIdx)
  })
  it('is in flight with realistic problems to analyse', () => {
    expect(a.percent).toBeGreaterThan(20)
    expect(a.percent).toBeLessThan(70)
    expect(a.overdue.length).toBeGreaterThan(0)
    expect(riskRecommendations(p, MONDAY).length).toBeGreaterThan(2)
    const g = projectInsights(p, MONDAY)
    expect(g.deadlines.length + g.improvements.length).toBeGreaterThan(1)
  })
  it('answers each suggested question from project data', () => {
    for (const q of SUGGESTED_QUESTIONS) {
      const text = answer(q, p)
      expect(text.length).toBeGreaterThan(60)
      expect(text).not.toContain('Try one of these')
    }
    expect(answer('Tell me about task 5.2', p)).toContain('User authentication')
  })
})

describe('scheduling', () => {
  const p = createDemoProject(MONDAY)
  const find = (tasks: Task[], name: string) => tasks.find((t) => t.name === name)!

  it('pushes successors when a task gets longer', () => {
    const before = analyze(p, MONDAY)
    const target = find(p.tasks, 'Shopping cart and checkout service')
    const tasks = cascade(p.tasks.map((t) => (t.id === target.id ? { ...t, duration: t.duration + 4 } : t)))
    const after = analyze({ ...p, tasks }, MONDAY)
    expect(after.eIdx).toBeGreaterThan(before.eIdx)
    for (const r of after.leaves) for (const pid of r.preds) expect(after.byId.get(pid)!.eIdx).toBeLessThanOrEqual(r.sIdx)
  })
  it('rejects dependencies that would loop', () => {
    const first = find(p.tasks, 'Define project vision and business case')
    const last = find(p.tasks, 'Project closed')
    expect(wouldCycle(p.tasks, first.id, last.id)).toBe(true)
    expect(wouldCycle(p.tasks, last.id, first.id)).toBe(false)
    expect(wouldCycle(p.tasks, first.id, first.id)).toBe(true)
    expect(wouldCycle(p.tasks, first.id, first.parentId!)).toBe(true)
  })
  it('auto-schedule leaves a consistent plan untouched', () => {
    const fresh = p.tasks.map((t) => ({ ...t, status: 'todo' as const, progress: 0 }))
    expect(autoSchedule(fresh, p.start)).toBe(fresh)
  })
})

describe('plan generator', () => {
  const types = Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]
  const base = { name: 'Test project', description: 'A test.', start: MONDAY, teamSize: 6, budget: 100_000 }

  it.each(types)('fits a %s plan to the target date', (type) => {
    for (const complexity of ['simple', 'medium', 'complex'] as const) {
      const targetEnd = addDays(MONDAY, 7 * 16 - 3)
      const p = generateWithEngine({ ...base, type, complexity, targetEnd })
      const a = analyze(p, MONDAY)
      expect(buildGraph(p.tasks).cyclic).toBe(false)
      expect(a.eIdx).toBeLessThanOrEqual(wIdxFloor(targetEnd))
      expect(wIdxFloor(targetEnd) - a.eIdx).toBeLessThan(6)
      expect(a.milestones.length).toBeGreaterThanOrEqual(5)
      expect(p.resources.length).toBeLessThanOrEqual(6)
      expect(a.leaves.every((r) => r.task.ownerId)).toBe(true)
      expect(p.risks.length).toBeGreaterThanOrEqual(6)
      for (const r of a.leaves) for (const pid of r.preds) expect(a.byId.get(pid)!.eIdx).toBeLessThanOrEqual(r.sIdx)
    }
  })
  it('gives complex projects a deeper breakdown', () => {
    const targetEnd = addDays(MONDAY, 7 * 16 - 3)
    const simple = generateWithEngine({ ...base, type: 'software', complexity: 'simple', targetEnd })
    const complex = generateWithEngine({ ...base, type: 'software', complexity: 'complex', targetEnd })
    expect(complex.tasks.length).toBeGreaterThan(simple.tasks.length)
  })
  it('says so when the target date is impossible', () => {
    const p = generateWithEngine({ ...base, type: 'construction', complexity: 'complex', targetEnd: addDays(MONDAY, 4) })
    expect(p.planNotes.join(' ')).toContain('cannot be met')
    expect(analyze(p, MONDAY).eIdx).toBeGreaterThan(wIdxFloor(addDays(MONDAY, 4)))
  })
  it('merges roles for a small team and splits them for a large one', () => {
    const targetEnd = addDays(MONDAY, 7 * 12 - 3)
    expect(generateWithEngine({ ...base, type: 'software', complexity: 'medium', targetEnd, teamSize: 3 }).resources).toHaveLength(3)
    expect(generateWithEngine({ ...base, type: 'software', complexity: 'medium', targetEnd, teamSize: 12 }).resources.length).toBeGreaterThan(8)
  })
})

describe('seed workspace', () => {
  it('contains a mixed portfolio', () => {
    const ws = createSeedWorkspace(MONDAY)
    const labels = ws.projects.map((p) => analyze(p, MONDAY).health.label)
    expect(ws.projects).toHaveLength(5)
    expect(labels).toContain('Completed')
    expect(new Set(labels).size).toBeGreaterThanOrEqual(3)
  })
})
