import { Bot, Cpu, Send, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { answer, SUGGESTED_QUESTIONS } from '../ai/assistant'
import { AIError, askClaude, claudeEnabled, CLAUDE_MODELS, type ChatTurn } from '../ai/claude'
import { useApp, useProject } from '../store'
import { Badge, cx, IconButton, RichText } from './ui'

interface Message {
  id: number
  role: 'user' | 'assistant' | 'notice'
  text: string
  /** Which engine produced an assistant message. */
  source?: 'engine' | 'claude'
  pending?: boolean
}

// Conversations are kept per project for the browser session.
const threads = new Map<string, Message[]>()
let nextId = 1

export function Assistant() {
  const open = useApp((s) => s.assistantOpen)
  const setOpen = useApp((s) => s.setAssistantOpen)
  const settings = useApp((s) => s.settings)
  const project = useProject()
  const [, rerender] = useState(0)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  const messages = project ? (threads.get(project.id) ?? []) : []
  const usingClaude = claudeEnabled(settings)
  const modelLabel = CLAUDE_MODELS.find((m) => m.id === settings.model)?.label.replace(/ \(.*\)$/, '') ?? settings.model

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  })
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open, project?.id])

  const update = (projectId: string, fn: (list: Message[]) => Message[]) => {
    threads.set(projectId, fn(threads.get(projectId) ?? []))
    rerender((n) => n + 1)
  }

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy || !project) return
    const pid = project.id
    setDraft('')
    update(pid, (l) => [...l, { id: nextId++, role: 'user', text: q }])

    if (!usingClaude) {
      update(pid, (l) => [...l, { id: nextId++, role: 'assistant', source: 'engine', text: answer(q, project) }])
      return
    }

    setBusy(true)
    const replyId = nextId++
    const history: ChatTurn[] = (threads.get(pid) ?? [])
      .filter((m) => m.role !== 'notice' && !m.pending)
      .slice(0, -1)
      .map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }))
    update(pid, (l) => [...l, { id: replyId, role: 'assistant', source: 'claude', text: '', pending: true }])
    try {
      const full = await askClaude(q, history, project, settings, (delta) =>
        update(pid, (l) => l.map((m) => (m.id === replyId ? { ...m, text: m.text + delta } : m))),
      )
      update(pid, (l) => l.map((m) => (m.id === replyId ? { ...m, text: full, pending: false } : m)))
    } catch (e) {
      // Say what failed, then answer from the built-in engine so the user still gets a result.
      const reason = e instanceof AIError ? e.message : 'The request to Claude failed.'
      update(pid, (l) => [
        ...l.filter((m) => m.id !== replyId),
        { id: nextId++, role: 'notice', text: `${reason} Answered by the built-in engine instead.` },
        { id: nextId++, role: 'assistant', source: 'engine', text: answer(q, project) },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-print">
      {open && (
        <section
          aria-label="Project assistant"
          className="fixed right-4 bottom-20 z-30 flex h-[min(620px,calc(100dvh-110px))] w-[min(400px,calc(100vw-32px))] animate-rise flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-pop"
        >
          <header className="flex items-center gap-2.5 bg-navy-900 px-4 py-3 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
              <Bot size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Project assistant</p>
              <p className="truncate text-xs text-navy-300">{project ? project.name : 'No project selected'}</p>
            </div>
            <IconButton label="Close assistant" onClick={() => setOpen(false)} className="text-navy-300 hover:bg-white/10 hover:text-white">
              <X size={17} />
            </IconButton>
          </header>

          <div className="flex items-center gap-1.5 border-b border-line-soft bg-canvas px-4 py-1.5 text-xs text-ink-500">
            {usingClaude ? <Sparkles size={12} className="text-brand-600" /> : <Cpu size={12} />}
            {usingClaude ? `Answers from ${modelLabel} using this project’s data` : 'Rule-based answers from this project’s live data'}
          </div>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {!project ? (
              <p className="py-8 text-center text-[13px] text-ink-500">Select or create a project to ask questions about it.</p>
            ) : messages.length === 0 ? (
              <div>
                <p className="text-[13.5px] text-ink-700">
                  Ask about schedule, risks, workload or budget. I read the tasks, dates, dependencies and risk register of <strong className="font-semibold text-ink-900">{project.name}</strong> as they are right now.
                </p>
                <div className="mt-3 space-y-1.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void ask(q)}
                      className="block w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-[13.5px] text-white">{m.text}</p>
                  </div>
                ) : m.role === 'notice' ? (
                  <div key={m.id} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                    <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                    {m.text}
                  </div>
                ) : (
                  <div key={m.id} className="max-w-[94%]">
                    <div className="rounded-2xl rounded-bl-md bg-canvas px-3.5 py-2.5">
                      {m.text ? <RichText text={m.text} /> : <span className="text-[13px] text-ink-400">Thinking…</span>}
                    </div>
                    {!m.pending && (
                      <div className="mt-1 pl-1">
                        {m.source === 'claude' ? <Badge tone="brand" icon={<Sparkles size={11} />}>Claude</Badge> : <Badge icon={<Cpu size={11} />}>Built-in engine</Badge>}
                      </div>
                    )}
                  </div>
                ),
              )
            )}
          </div>

          {project && messages.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto border-t border-line-soft px-3 py-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={busy}
                  onClick={() => void ask(q)}
                  className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-end gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void ask(draft)
            }}
          >
            <textarea
              ref={input}
              value={draft}
              rows={1}
              disabled={!project}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void ask(draft)
                }
              }}
              placeholder="Ask about this project"
              aria-label="Message"
              className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-line px-3 py-2 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim() || busy || !project}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close project assistant' : 'Open project assistant'}
        aria-expanded={open}
        className={cx(
          'fixed right-4 bottom-4 z-30 flex h-13 items-center gap-2 rounded-full bg-brand-600 pr-5 pl-4 text-sm font-semibold text-white shadow-pop transition-all hover:bg-brand-700',
          open && 'pr-4',
        )}
      >
        {open ? <X size={20} /> : <Bot size={20} />}
        {!open && 'Ask AI'}
      </button>
    </div>
  )
}
