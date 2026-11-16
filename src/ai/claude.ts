import { z } from 'zod'
import type { GeneratorInput, Project, Settings } from '../types'
import { COMPLEXITY_LABEL, PROJECT_TYPE_LABEL, STATUS_LABEL } from '../types'
import { fmtLong, todayISO, wIdx, wIdxFloor } from '../lib/dates'
import { riskScore } from '../lib/risk'
import { analyze } from '../lib/schedule'
import type { PlanOutline } from './generator'
import { workload } from './insights'

/**
 * Optional Claude integration. Nothing here runs unless the user has chosen Claude as the AI
 * engine and entered an API key in Settings. The key stays in this browser and requests go
 * straight to api.anthropic.com. Every failure is thrown as an `AIError` with a plain-language
 * message so the caller can say what happened and fall back to the built-in engine — a failed
 * request is never presented as a result.
 */

export class AIError extends Error {}

export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (recommended)' },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2 (most capable)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest)' },
]

export const claudeEnabled = (s: Settings) => s.aiProvider === 'claude' && s.apiKey.trim().length > 0

async function sdk(settings: Settings) {
  if (!settings.apiKey.trim()) throw new AIError('No Anthropic API key is set. Add one in Settings → AI engine.')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  // Calling from the browser is a deliberate choice here: the user supplies their own key and there is no backend.
  const client = new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1 })
  return { Anthropic, client }
}

type SDK = Awaited<ReturnType<typeof sdk>>['Anthropic']

function explain(e: unknown, Anthropic: SDK): AIError {
  if (e instanceof AIError) return e
  if (e instanceof Anthropic.AuthenticationError) return new AIError('The API key was rejected (401). Check the key in Settings → AI engine.')
  if (e instanceof Anthropic.PermissionDeniedError) return new AIError('This API key does not have access to the selected model (403).')
  if (e instanceof Anthropic.NotFoundError) return new AIError('The selected model was not found for this API key (404).')
  if (e instanceof Anthropic.RateLimitError) return new AIError('The API rate limit was reached (429). Wait a moment and try again.')
  if (e instanceof Anthropic.APIConnectionError) return new AIError('Could not reach api.anthropic.com. Check the network connection.')
  if (e instanceof Anthropic.APIError) return new AIError(`The Claude API returned an error (${e.status ?? 'unknown status'}): ${e.message}`)
  return new AIError(e instanceof Error ? e.message : 'Unexpected error while calling the Claude API.')
}

/** Confirms the key and model work without spending tokens. Returns the model's display name. */
export async function testConnection(settings: Settings): Promise<string> {
  const { Anthropic, client } = await sdk(settings)
  try {
    const model = await client.models.retrieve(settings.model)
    return model.display_name
  } catch (e) {
    throw explain(e, Anthropic)
  }
}

const list = z.array(z.string())
const OutlineSchema = z.object({
  charter: z.object({
    objective: z.string(),
    justification: z.string(),
    scope: list,
    outOfScope: list,
    deliverables: list,
    stakeholders: list,
    successCriteria: list,
    assumptions: list,
    constraints: list,
  }),
  phases: z.array(
    z.object({
      name: z.string(),
      tasks: z.array(
        z.object({
          ref: z.string(),
          name: z.string(),
          description: z.string(),
          days: z.number(),
          role: z.string(),
          dependsOn: list,
          milestone: z.boolean(),
        }),
      ),
    }),
  ),
  risks: z.array(
    z.object({
      description: z.string(),
      category: z.string(),
      probability: z.number(),
      impact: z.number(),
      mitigation: z.string(),
      ownerRole: z.string(),
    }),
  ),
})

const PLANNER_SYSTEM = `You are a senior project manager producing a project plan for a planning tool. The tool schedules the plan itself, so you supply structure and estimates, never dates.

What to return:
- charter: a specific objective, business justification, scope, out-of-scope items, deliverables, key stakeholders, success criteria, assumptions and constraints. Write for this project in particular; generic filler is not useful.
- phases: 5 to 10 phases in delivery order, each with 3 to 8 tasks. Give every task a unique ref such as "1.1", a short action-oriented name, a one-sentence description, an estimate in working days (whole numbers), and the role responsible (a job title, not a person's name). Reuse the same role titles consistently so work can be assigned.
- dependsOn lists the refs of tasks that must finish first. A task may only depend on tasks that appear earlier in the plan. Tasks that can run in parallel should share predecessors instead of being chained.
- End each phase with a milestone: a task with milestone true and days 0 that depends on the phase's final tasks.
- risks: 6 to 10 risks specific to this project, with probability and impact as integers from 1 (very low) to 5 (very high), a concrete mitigation, and ownerRole set to one of the role titles used in the tasks.

Size the estimates so the critical path fits the working days available, and use no more distinct roles than the team size allows.`

export async function claudeOutline(input: GeneratorInput, settings: Settings): Promise<PlanOutline> {
  const { Anthropic, client } = await sdk(settings)
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
  const days = wIdxFloor(input.targetEnd) - wIdx(input.start) + 1
  const brief = [
    `Project name: ${input.name}`,
    `Description: ${input.description || '(none given)'}`,
    `Project type: ${PROJECT_TYPE_LABEL[input.type]}`,
    `Complexity: ${COMPLEXITY_LABEL[input.complexity]}`,
    `Start date: ${fmtLong(input.start)}`,
    `Target completion: ${fmtLong(input.targetEnd)} (${days} working days available, Monday to Friday)`,
    `Team size: ${input.teamSize}`,
    `Budget: ${input.budget != null ? `$${input.budget.toLocaleString('en-US')}` : 'not specified'}`,
  ].join('\n')

  try {
    const response = await client.messages.parse({
      model: settings.model,
      max_tokens: 16000,
      system: PLANNER_SYSTEM,
      messages: [{ role: 'user', content: brief }],
      output_config: { effort: 'medium', format: zodOutputFormat(OutlineSchema) },
    })
    if (response.stop_reason === 'refusal') throw new AIError('Claude declined to generate a plan for this request.')
    if (response.stop_reason === 'max_tokens') throw new AIError('Claude’s response was cut off before the plan was complete.')
    const plan = response.parsed_output
    if (!plan || !plan.phases.length) throw new AIError('Claude returned a response that could not be read as a project plan.')
    return plan
  } catch (e) {
    throw explain(e, Anthropic)
  }
}

/** Compact, factual snapshot of the project for the assistant to reason over. */
function projectContext(p: Project): string {
  const today = todayISO()
  const a = analyze(p, today)
  const name = (id: string | null) => p.resources.find((r) => r.id === id)?.name ?? 'unassigned'
  return JSON.stringify({
    today,
    project: {
      name: p.name,
      description: p.description,
      start: a.start,
      plannedFinish: a.end,
      forecastFinish: a.forecastEnd,
      targetFinish: p.targetEnd,
      percentComplete: a.percent,
      percentPlanned: a.planned,
      schedulePerformanceIndex: Number(a.spi.toFixed(2)),
      workingDaysBehindPlan: a.varianceDays,
      health: a.health,
      budget: p.budget,
      spent: p.spent,
    },
    tasks: a.rows.map((r) => ({
      wbs: r.code,
      name: r.task.name,
      type: r.isSummary ? 'summary' : r.task.milestone ? 'milestone' : 'task',
      owner: r.isSummary ? undefined : name(r.task.ownerId),
      start: r.start,
      end: r.end,
      workingDays: r.duration,
      status: STATUS_LABEL[r.status],
      progress: r.progress,
      critical: r.critical,
      slackDays: r.slack,
      overdue: r.overdue,
      dependsOn: r.isSummary ? undefined : r.preds.map((x) => a.byId.get(x)!.code),
    })),
    risks: p.risks.map((r) => ({
      id: r.code,
      description: r.description,
      probability: r.probability,
      impact: r.impact,
      score: riskScore(r),
      status: r.status,
      owner: name(r.ownerId),
      mitigation: r.mitigation,
    })),
    team: workload(p, a).map((l) => ({
      name: l.resource.name,
      role: l.resource.role,
      openTasks: l.openCount,
      remainingDays: l.remainingDays,
      weeklyCapacityDays: l.capacity,
      overAllocatedWeeks: l.overWeeks,
    })),
  })
}

const ASSISTANT_SYSTEM = `You are the project assistant inside ProjectPilot AI, a project management tool. You answer a project manager's questions about the project they currently have open.

The project's live data is provided as JSON in the first user message. Base every statement on it: cite tasks by WBS code and name, quote dates and numbers from the data, and say so plainly when the data does not contain what is needed. Dates are ISO; durations are working days (Monday to Friday). A task is on the critical path when "critical" is true.

Answer the way an experienced colleague would in a chat panel: lead with the answer, keep it short, and use a few bullet points when listing tasks or options. Plain text with **bold** and "- " bullets only; no headings or tables.`

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export async function askClaude(
  question: string,
  history: ChatTurn[],
  project: Project,
  settings: Settings,
  onText: (delta: string) => void,
): Promise<string> {
  const { Anthropic, client } = await sdk(settings)
  try {
    const stream = client.messages.stream({
      model: settings.model,
      max_tokens: 16000,
      system: ASSISTANT_SYSTEM,
      output_config: { effort: 'low' },
      messages: [
        { role: 'user', content: `Current project data:\n${projectContext(project)}` },
        { role: 'assistant', content: 'I have the project data and will answer from it.' },
        ...history.slice(-8).map((t) => ({ role: t.role, content: t.text })),
        { role: 'user', content: question },
      ],
    })
    stream.on('text', onText)
    const message = await stream.finalMessage()
    if (message.stop_reason === 'refusal') throw new AIError('Claude declined to answer this question.')
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    if (!text.trim()) throw new AIError('Claude returned an empty answer.')
    return text
  } catch (e) {
    throw explain(e, Anthropic)
  }
}
