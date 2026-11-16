import { Download, ExternalLink, ListPlus, Plus, ShieldAlert, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { riskRecommendations, type Recommendation } from '../ai/insights'
import { NoProject } from '../components/NoProject'
import {
  Button,
  Card,
  CardHeader,
  cellInputCls,
  ConfirmDialog,
  cx,
  Empty,
  Field,
  IconButton,
  InlineText,
  inputCls,
  Modal,
  PageHeader,
  Segmented,
  SeverityBadge,
  textareaCls,
} from '../components/ui'
import { download, slug } from '../lib/format'
import { risksCsv } from '../lib/report'
import { riskScore, SCALE_LABEL, severityOf, type Severity } from '../lib/risk'
import { useApp, useProject } from '../store'
import { SEVERITY_COLOR } from '../theme'
import type { Project, Risk, RiskStatus } from '../types'
import { RISK_STATUS_LABEL } from '../types'

type Filter = 'all' | RiskStatus
const SCALE = [1, 2, 3, 4, 5]
const STATUSES: RiskStatus[] = ['open', 'mitigating', 'closed']
const BANDS: { severity: Severity; range: string }[] = [
  { severity: 'Low', range: '1–4' },
  { severity: 'Medium', range: '5–9' },
  { severity: 'High', range: '10–15' },
  { severity: 'Critical', range: '16–25' },
]

export default function Risks() {
  const project = useProject()
  if (!project) return <NoProject />
  return <RiskPage project={project} />
}

function RiskPage({ project }: { project: Project }) {
  const toast = useApp((s) => s.toast)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const live = project.risks.filter((r) => r.status !== 'closed')
  const scores = live.map(riskScore)
  const stats = [
    { label: 'Open risks', value: project.risks.filter((r) => r.status === 'open').length, note: `${project.risks.length} in the register` },
    { label: 'Critical', value: scores.filter((s) => s >= 16).length, note: 'Score 16 or higher' },
    { label: 'High', value: scores.filter((s) => s >= 10 && s < 16).length, note: 'Score 10 to 15' },
    { label: 'Average score', value: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '–', note: 'Across risks not yet closed' },
    { label: 'Mitigating', value: project.risks.filter((r) => r.status === 'mitigating').length, note: 'Mitigation under way' },
  ]

  const select = (id: string) => {
    const risk = project.risks.find((r) => r.id === id)
    if (risk && filter !== 'all' && risk.status !== filter) setFilter('all')
    setSelected(id)
  }
  useEffect(() => {
    if (!selected) return
    const el = document.getElementById(`risk-row-${selected}`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selected, filter])

  return (
    <>
      <PageHeader
        title="Risk Analysis"
        description="Score each risk by probability and impact, see where the exposure sits, and act on what the schedule itself is telling you."
        actions={
          <>
            <Button
              icon={<Download size={15} />}
              onClick={() => {
                download(`${slug(project.name)}-risk-register.csv`, risksCsv(project), 'text/csv;charset=utf-8')
                toast('Risk register exported')
              }}
              disabled={!project.risks.length}
            >
              Export CSV
            </Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
              Add risk
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s, i) => (
            <div key={s.label} className={cx('px-5 py-3.5', i > 0 && 'lg:border-l lg:border-line-soft')}>
              <dt className="text-[13px] text-ink-500">{s.label}</dt>
              <dd className="mt-0.5 text-2xl leading-tight font-semibold text-ink-900">{s.value}</dd>
              <dd className="text-xs text-ink-400">{s.note}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Matrix risks={live} selected={selected} onSelect={select} />
        <Analyst project={project} />
      </div>

      <Register project={project} filter={filter} setFilter={setFilter} selected={selected} setSelected={setSelected} />

      {adding && <AddRiskModal project={project} onClose={() => setAdding(false)} onAdded={(id) => select(id)} />}
    </>
  )
}

/* ───────────────────────────── Probability–impact matrix ───────────────────────────── */

function Matrix({ risks, selected, onSelect }: { risks: Risk[]; selected: string | null; onSelect: (id: string) => void }) {
  const cells = useMemo(() => {
    const map = new Map<string, Risk[]>()
    for (const r of risks) {
      const key = `${r.probability}-${r.impact}`
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return map
  }, [risks])

  return (
    <Card>
      <CardHeader title="Probability–impact matrix" hint="Risk score = Probability × Impact. Select a risk to find it in the register." />
      <div className="px-5 pb-5">
        <div className="flex gap-2">
          <div className="flex w-4 shrink-0 items-center justify-center">
            <span className="-rotate-90 text-xs font-medium whitespace-nowrap text-ink-500">Probability</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-[4.75rem_repeat(5,minmax(0,1fr))] gap-1">
              {[...SCALE].reverse().map((p) => (
                <MatrixRow key={p} p={p} cells={cells} selected={selected} onSelect={onSelect} />
              ))}
              <div />
              {SCALE.map((i) => (
                <div key={i} className="pt-1 text-center text-xs leading-tight text-ink-500">
                  <span className="tnum font-medium text-ink-700">{i}</span>
                  <span className="block truncate">{SCALE_LABEL[i]}</span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 pl-[4.75rem] text-center text-xs font-medium text-ink-500">Impact</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-soft pt-3 text-xs text-ink-600">
          {BANDS.map((b) => (
            <span key={b.severity} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] border" style={{ background: `${SEVERITY_COLOR[b.severity]}2e`, borderColor: `${SEVERITY_COLOR[b.severity]}80` }} />
              {b.severity} <span className="tnum text-ink-400">{b.range}</span>
            </span>
          ))}
          <span className="ml-auto text-ink-400">Closed risks are not plotted.</span>
        </div>
      </div>
    </Card>
  )
}

function MatrixRow({ p, cells, selected, onSelect }: { p: number; cells: Map<string, Risk[]>; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="flex flex-col justify-center pr-1 text-right text-xs leading-tight text-ink-500">
        <span className="tnum font-medium text-ink-700">{p}</span>
        <span className="truncate">{SCALE_LABEL[p]}</span>
      </div>
      {SCALE.map((i) => {
        const score = p * i
        const color = SEVERITY_COLOR[severityOf(score)]
        const here = cells.get(`${p}-${i}`) ?? []
        return (
          <div
            key={i}
            className="relative flex min-h-[62px] flex-wrap content-start gap-1 rounded-lg p-1.5 pr-5"
            style={{ background: `${color}${here.length ? '2e' : '17'}` }}
            aria-label={`Probability ${p}, impact ${i}, score ${score}: ${here.length ? here.map((r) => r.code).join(', ') : 'no risks'}`}
          >
            <span className="tnum pointer-events-none absolute top-1 right-1.5 text-[10px] font-medium text-ink-900/30">{score}</span>
            {here.map((r) => (
              <button
                key={r.id}
                type="button"
                title={`${r.code}: ${r.description}`}
                onClick={() => onSelect(r.id)}
                className={cx(
                  'tnum rounded-md border bg-white px-1.5 py-0.5 text-[11px] leading-tight font-semibold text-ink-900 shadow-card transition-colors hover:border-brand-400',
                  selected === r.id ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-line',
                )}
              >
                {r.code}
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

/* ───────────────────────────── AI Risk Analyst ───────────────────────────── */

function Analyst({ project }: { project: Project }) {
  const addRisk = useApp((s) => s.addRisk)
  const toast = useApp((s) => s.toast)
  const recs = riskRecommendations(project)

  const add = (rec: Recommendation) => {
    if (!rec.suggested) return
    addRisk(rec.suggested)
    toast('Risk added to register')
  }

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="AI Risk Analyst"
        hint="Rule-based analysis of this project’s tasks, deadlines and dependencies. It recalculates whenever the plan changes."
        action={<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Sparkles size={16} /></span>}
      />
      {recs.length === 0 ? (
        <Empty icon={<ShieldAlert size={20} />} title="No schedule-driven risks detected">
          Nothing on the critical path is overdue, nobody is over-allocated and every high-severity risk has mitigation under way.
        </Empty>
      ) : (
        <ul className="max-h-[520px] flex-1 divide-y divide-line-soft overflow-y-auto border-t border-line-soft">
          {recs.map((rec) => (
            <li key={rec.id} className="px-5 py-3.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">
                  <SeverityBadge severity={rec.severity} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{rec.title}</p>
                  <p className="mt-0.5 text-[13px] text-ink-600">{rec.detail}</p>
                  <p className="mt-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-[13px] text-ink-700">
                    <span className="font-medium text-ink-900">Recommended action: </span>
                    {rec.action}
                  </p>
                  {(rec.taskId || rec.suggested) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rec.taskId && (
                        <Button size="sm" icon={<ExternalLink size={13} />} onClick={() => useApp.getState().openTask(rec.taskId!)}>
                          View task
                        </Button>
                      )}
                      {rec.suggested && (
                        <Button size="sm" icon={<ListPlus size={14} />} onClick={() => add(rec)}>
                          Add to register
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ───────────────────────────── Risk register ───────────────────────────── */

const selectCls = cx(cellInputCls, 'pr-0')
const TH = 'px-2 py-2 text-left text-xs font-medium text-ink-500'

function Register({
  project,
  filter,
  setFilter,
  selected,
  setSelected,
}: {
  project: Project
  filter: Filter
  setFilter: (f: Filter) => void
  selected: string | null
  setSelected: (id: string | null) => void
}) {
  const updateRisk = useApp((s) => s.updateRisk)
  const deleteRisk = useApp((s) => s.deleteRisk)
  const [removing, setRemoving] = useState<Risk | null>(null)

  const count = (f: Filter) => (f === 'all' ? project.risks.length : project.risks.filter((r) => r.status === f).length)
  const rows = project.risks.filter((r) => filter === 'all' || r.status === filter).sort((x, y) => riskScore(y) - riskScore(x) || x.code.localeCompare(y.code))

  return (
    <Card>
      <CardHeader
        title="Risk register"
        hint="Edit any cell in place. Sorted by score, highest first."
        action={
          <Segmented<Filter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={(['all', ...STATUSES] as Filter[]).map((f) => ({
              value: f,
              label: (
                <>
                  {f === 'all' ? 'All' : RISK_STATUS_LABEL[f]}
                  <span className="tnum text-ink-400">{count(f)}</span>
                </>
              ),
            }))}
          />
        }
      />
      {rows.length === 0 ? (
        <Empty icon={<ShieldAlert size={20} />} title={project.risks.length ? `No ${filter === 'all' ? '' : RISK_STATUS_LABEL[filter as RiskStatus].toLowerCase() + ' '}risks` : 'The register is empty'}>
          {project.risks.length ? 'Choose another filter to see the rest of the register.' : 'Add a risk, or use “Add to register” on an AI Risk Analyst recommendation.'}
        </Empty>
      ) : (
        <div className="overflow-x-auto border-t border-line-soft">
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-[13px]">
            <colgroup>
              <col style={{ width: 74 }} />
              <col />
              <col style={{ width: 118 }} />
              <col style={{ width: 118 }} />
              <col style={{ width: 106 }} />
              <col style={{ width: 138 }} />
              <col />
              <col style={{ width: 112 }} />
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-line-soft bg-canvas/60">
                <th className={cx(TH, 'pl-5')}>Risk ID</th>
                <th className={TH}>Description and category</th>
                <th className={TH}>Probability</th>
                <th className={TH}>Impact</th>
                <th className={TH}>Severity</th>
                <th className={TH}>Owner</th>
                <th className={TH}>Mitigation strategy</th>
                <th className={TH}>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const score = riskScore(r)
                return (
                  <tr
                    key={r.id}
                    id={`risk-row-${r.id}`}
                    onClick={() => setSelected(r.id)}
                    className={cx('border-b border-line-soft align-top transition-colors last:border-0', selected === r.id ? 'bg-brand-50/70' : 'hover:bg-canvas/50', r.status === 'closed' && 'opacity-60')}
                  >
                    <td className="tnum py-2 pr-2 pl-5 font-semibold whitespace-nowrap text-ink-900">
                      <span className="inline-block pt-1">{r.code}</span>
                    </td>
                    <td className="px-1 py-1.5">
                      <InlineText multiline value={r.description} placeholder="Describe the risk" onCommit={(v) => v && updateRisk(r.id, { description: v })} />
                      <InlineText value={r.category} placeholder="Category" className="h-6! text-xs! text-ink-500!" onCommit={(v) => updateRisk(r.id, { category: v || 'General' })} />
                    </td>
                    <td className="px-1 py-1.5">
                      <select aria-label={`Probability of ${r.code}`} className={selectCls} value={r.probability} onChange={(e) => updateRisk(r.id, { probability: Number(e.target.value) })}>
                        {SCALE.map((n) => (
                          <option key={n} value={n}>
                            {n} – {SCALE_LABEL[n]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1.5">
                      <select aria-label={`Impact of ${r.code}`} className={selectCls} value={r.impact} onChange={(e) => updateRisk(r.id, { impact: Number(e.target.value) })}>
                        {SCALE.map((n) => (
                          <option key={n} value={n}>
                            {n} – {SCALE_LABEL[n]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2.5" title={`Score ${score} = ${r.probability} × ${r.impact}`}>
                      <SeverityBadge severity={severityOf(score)} score={score} />
                    </td>
                    <td className="px-1 py-1.5">
                      <select aria-label={`Owner of ${r.code}`} className={cx(selectCls, !r.ownerId && 'text-ink-400')} value={r.ownerId ?? ''} onChange={(e) => updateRisk(r.id, { ownerId: e.target.value || null })}>
                        <option value="">Unassigned</option>
                        {project.resources.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1.5">
                      <InlineText multiline value={r.mitigation} placeholder="Add a mitigation strategy" onCommit={(v) => updateRisk(r.id, { mitigation: v })} />
                    </td>
                    <td className="px-1 py-1.5">
                      <select aria-label={`Status of ${r.code}`} className={selectCls} value={r.status} onChange={(e) => updateRisk(r.id, { status: e.target.value as RiskStatus })}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {RISK_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-3">
                      <IconButton
                        label={`Delete ${r.code}`}
                        className="hover:bg-red-50 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRemoving(r)
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.code}?`}
          body={`“${removing.description}” will be removed from the register. This cannot be undone.`}
          confirmLabel="Delete risk"
          onConfirm={() => {
            deleteRisk(removing.id)
            if (selected === removing.id) setSelected(null)
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </Card>
  )
}

/* ───────────────────────────── Add risk ───────────────────────────── */

function AddRiskModal({ project, onClose, onAdded }: { project: Project; onClose: () => void; onAdded: (id: string) => void }) {
  const addRisk = useApp((s) => s.addRisk)
  const toast = useApp((s) => s.toast)
  const [form, setForm] = useState({
    description: '',
    category: '',
    probability: 3,
    impact: 3,
    ownerId: '',
    mitigation: '',
    status: 'open' as RiskStatus,
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const categories = [...new Set(project.risks.map((r) => r.category))].sort()
  const score = form.probability * form.impact
  const valid = form.description.trim().length > 0

  const save = () => {
    if (!valid) return
    const id = addRisk({
      description: form.description.trim(),
      category: form.category.trim() || 'General',
      probability: form.probability,
      impact: form.impact,
      ownerId: form.ownerId || null,
      mitigation: form.mitigation.trim(),
      status: form.status,
    })
    toast('Risk added to register')
    onClose()
    if (id) onAdded(id)
  }

  return (
    <Modal
      title="Add risk"
      description="Rate probability and impact from 1 to 5. The score and severity are calculated for you."
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            Add risk
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Risk description" className="sm:col-span-2">
          <textarea autoFocus className={textareaCls} rows={2} value={form.description} placeholder="What could happen, and what would it affect?" onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Category">
          <input className={inputCls} list="risk-categories" value={form.category} placeholder="e.g. Technical, Schedule" onChange={(e) => set('category', e.target.value)} />
          <datalist id="risk-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Owner">
          <select className={inputCls} value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            <option value="">Unassigned</option>
            {project.resources.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.role})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Probability">
          <select className={inputCls} value={form.probability} onChange={(e) => set('probability', Number(e.target.value))}>
            {SCALE.map((n) => (
              <option key={n} value={n}>
                {n} – {SCALE_LABEL[n]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Impact">
          <select className={inputCls} value={form.impact} onChange={(e) => set('impact', Number(e.target.value))}>
            {SCALE.map((n) => (
              <option key={n} value={n}>
                {n} – {SCALE_LABEL[n]}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-600 sm:col-span-2">
          Risk score
          <span className="tnum font-semibold text-ink-900">
            {form.probability} × {form.impact} = {score}
          </span>
          <SeverityBadge severity={severityOf(score)} />
        </div>
        <Field label="Mitigation strategy" className="sm:col-span-2">
          <textarea className={textareaCls} rows={2} value={form.mitigation} placeholder="How will the probability or impact be reduced?" onChange={(e) => set('mitigation', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value as RiskStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {RISK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}
