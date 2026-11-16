import type { Activity, GeneratorInput, Project, Resource, Risk, RiskStatus, Settings, Status, Task, Workspace } from '../types'
import { blankTask, generateWithEngine } from '../ai/generator'
import { addDays, fromWIdx, mondayOf, todayISO, toDay, wIdx } from '../lib/dates'
import { uid } from '../lib/format'
import { analyze, autoSchedule, buildGraph } from '../lib/schedule'

export const WORKSPACE_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  userName: 'Alex Morgan',
  userEmail: 'alex.morgan@northwind.example',
  userRole: 'Senior Project Manager',
  workspace: 'Northwind Digital',
  aiProvider: 'engine',
  apiKey: '',
  model: 'claude-opus-5-5',
  notificationsSeenAt: 0,
}

/* ───────────────────────── Demo project: AI-powered e-commerce platform ───────────────────────── */

const TEAM: [key: string, name: string, role: string, allocation: number][] = [
  ['PM', 'Priya Sharma', 'Project Manager', 100],
  ['BA', 'Daniel Okafor', 'Business Analyst', 80],
  ['AR', 'Mei Lin Chen', 'Solutions Architect', 80],
  ['UX', 'Sofia Alvarez', 'UX/UI Designer', 100],
  ['BE', 'Arjun Mehta', 'Backend Lead', 100],
  ['BE2', 'Lucas Martin', 'Backend Developer', 100],
  ['FE', 'Hannah Kim', 'Frontend Lead', 100],
  ['FE2', 'Omar Farouk', 'Frontend Developer', 100],
  ['ML', 'Elena Petrova', 'ML Engineer', 100],
  ['QA', 'Tom Becker', 'QA Lead', 100],
  ['OPS', 'Nadia Rahman', 'DevOps Engineer', 80],
]

/** [wbs ref, name, working days, owner key, predecessor refs, description]. 0 days = milestone gate. */
type DemoTask = [string, string, number, string, string[], string]

const DEMO_PHASES: { name: string; tasks: DemoTask[] }[] = [
  {
    name: 'Project Initiation',
    tasks: [
      ['1.1', 'Define project vision and business case', 2, 'PM', [], 'Agree why the platform is being built, the revenue targets it supports and how success will be measured.'],
      ['1.2', 'Identify stakeholders and form core team', 2, 'PM', ['1.1'], 'Map sponsors, decision makers and delivery leads; confirm availability with line managers.'],
      ['1.3', 'Develop project charter', 2, 'PM', ['1.1'], 'Document objectives, scope, budget, governance and approval route.'],
      ['1.4', 'Kickoff meeting', 1, 'PM', ['1.2', '1.3'], 'Walk the full team through goals, plan, ways of working and the first two weeks.'],
      ['1.5', 'Project charter approved', 0, 'PM', ['1.4'], 'Sponsor signs the charter and releases budget.'],
    ],
  },
  {
    name: 'Requirements Gathering',
    tasks: [
      ['2.1', 'Stakeholder interviews and workshops', 3, 'BA', ['1.5'], 'Interview merchandising, marketing, customer service and operations on current pain points.'],
      ['2.2', 'Document functional requirements', 3, 'BA', ['2.1'], 'Write user stories for catalog, search, cart, checkout, accounts and admin.'],
      ['2.3', 'Define AI feature requirements', 2, 'ML', ['2.1'], 'Specify recommendations, semantic search and shopping assistant behaviour, data needs and quality targets.'],
      ['2.4', 'Non-functional and compliance requirements', 2, 'AR', ['2.1'], 'Performance, availability, PCI-DSS scope for payments and GDPR obligations for customer data.'],
      ['2.5', 'Requirements review and prioritisation', 1, 'PM', ['2.2', '2.3', '2.4'], 'Rank stories by value and effort; confirm what is in the launch release.'],
      ['2.6', 'Requirements sign-off', 0, 'PM', ['2.5'], 'Product owner approves the requirements baseline.'],
    ],
  },
  {
    name: 'System Architecture',
    tasks: [
      ['3.1', 'Design system architecture and service boundaries', 3, 'AR', ['2.6'], 'Define services, data flows and how AI components plug into the commerce core.'],
      ['3.2', 'Database schema and data model', 3, 'BE', ['3.1'], 'Model products, inventory, customers, carts, orders and event data for recommendations.'],
      ['3.3', 'Cloud infrastructure and environment design', 2, 'OPS', ['3.1'], 'Environments, networking, scaling policy, secrets and cost estimate.'],
      ['3.4', 'API contracts and integration design', 2, 'BE2', ['3.1'], 'Internal API contracts plus payment gateway, shipping and email integrations.'],
      ['3.5', 'Security and architecture review', 1, 'AR', ['3.2', '3.3', '3.4'], 'Threat model and review against non-functional requirements.'],
      ['3.6', 'Architecture approved', 0, 'AR', ['3.5'], 'Architecture board approves the design for build.'],
    ],
  },
  {
    name: 'UI/UX Design',
    tasks: [
      ['4.1', 'User research and personas', 2, 'UX', ['2.6'], 'Synthesize shopper interviews into personas and key journeys.'],
      ['4.2', 'Wireframes and user flows', 3, 'UX', ['4.1'], 'Browse, search, product detail, cart, checkout and account flows.'],
      ['4.3', 'Design system and component library', 3, 'UX', ['4.2'], 'Typography, colour, spacing and reusable components for web.'],
      ['4.4', 'High-fidelity mockups', 4, 'UX', ['4.3'], 'Pixel-accurate screens for all launch pages on desktop and mobile.'],
      ['4.5', 'Usability testing and design sign-off', 2, 'UX', ['4.4'], 'Test the prototype with eight shoppers and resolve blocking findings.'],
      ['4.6', 'Design approved', 0, 'UX', ['4.5'], 'Product owner approves the design for implementation.'],
    ],
  },
  {
    name: 'Backend Development',
    tasks: [
      ['5.1', 'Set up repositories, CI pipeline and dev environments', 2, 'OPS', ['3.6'], 'Monorepo, branch policy, build and test pipeline, preview environments.'],
      ['5.2', 'User authentication and account service', 4, 'BE2', ['5.1'], 'Registration, login, password reset, sessions and role-based access.'],
      ['5.3', 'Product catalog and inventory service', 5, 'BE', ['5.1'], 'Products, variants, categories, pricing and stock levels with admin APIs.'],
      ['5.4', 'Shopping cart and checkout service', 5, 'BE', ['5.3'], 'Cart persistence, promotions, tax, shipping options and order creation.'],
      ['5.5', 'Payment gateway integration', 4, 'BE2', ['5.2', '5.4'], 'Card payments, 3-D Secure, refunds and webhook reconciliation.'],
      ['5.6', 'Order management and notifications', 4, 'BE2', ['5.2'], 'Order lifecycle, fulfilment status and transactional email.'],
      ['5.7', 'Admin dashboard APIs', 3, 'BE', ['5.4'], 'Reporting and management endpoints for merchandising and support.'],
      ['5.8', 'Backend APIs complete', 0, 'BE', ['5.5', '5.6', '5.7'], 'All launch APIs deployed to the integration environment.'],
    ],
  },
  {
    name: 'Frontend Development',
    tasks: [
      ['6.1', 'Frontend scaffolding and design system implementation', 3, 'FE', ['4.6'], 'App shell, routing, state management and coded component library.'],
      ['6.2', 'Product listing, search and detail pages', 5, 'FE', ['6.1', '5.3'], 'Category browsing, filters, search results and product pages.'],
      ['6.3', 'Cart and checkout flow', 5, 'FE2', ['6.1', '5.4'], 'Cart, address, shipping, payment and confirmation steps.'],
      ['6.4', 'User account and order history', 4, 'FE2', ['6.3'], 'Profile, addresses, saved payment methods and order tracking.'],
      ['6.5', 'Admin dashboard UI', 4, 'FE', ['6.2', '5.7'], 'Catalog management, order handling and sales reporting.'],
      ['6.6', 'Responsive and accessibility polish', 3, 'FE', ['6.4', '6.5'], 'Breakpoints, keyboard navigation and WCAG 2.2 AA fixes.'],
      ['6.7', 'Frontend feature complete', 0, 'FE', ['6.6'], 'All launch screens integrated with live APIs.'],
    ],
  },
  {
    name: 'AI Integration',
    tasks: [
      ['7.1', 'Data pipeline and behaviour dataset preparation', 5, 'ML', ['3.6'], 'Ingest catalog and clickstream data; build training and evaluation sets.'],
      ['7.2', 'Recommendation engine model', 6, 'ML', ['7.1'], 'Train and evaluate collaborative and content-based recommenders.'],
      ['7.3', 'AI-powered semantic search', 5, 'ML', ['7.2'], 'Embedding-based product search with typo tolerance and re-ranking.'],
      ['7.4', 'AI shopping assistant chatbot', 5, 'ML', ['7.3'], 'Conversational assistant grounded in catalog, policies and order data.'],
      ['7.5', 'Integrate AI services with backend and frontend', 4, 'BE', ['7.4', '5.8', '6.2'], 'Serve recommendations, search and assistant through production APIs and UI.'],
      ['7.6', 'Model evaluation and tuning', 2, 'ML', ['7.5'], 'Offline metrics, latency tuning and guardrail checks.'],
      ['7.7', 'AI features integrated', 0, 'ML', ['7.6'], 'AI features meet quality and latency targets in the integration environment.'],
    ],
  },
  {
    name: 'Testing and Quality Assurance',
    tasks: [
      ['8.1', 'Test strategy and test case design', 4, 'QA', ['4.6'], 'Coverage plan and test cases for every launch user story.'],
      ['8.2', 'Test automation framework', 4, 'QA', ['8.1'], 'End-to-end and API regression suites running in CI.'],
      ['8.3', 'Functional and integration testing', 5, 'QA', ['6.7', '5.8', '8.2'], 'Execute test cases across browsers and devices; log and triage defects.'],
      ['8.4', 'AI model validation and bias testing', 2, 'ML', ['7.7'], 'Validate recommendation relevance and assistant safety across customer segments.'],
      ['8.5', 'Performance and load testing', 3, 'OPS', ['7.7'], 'Peak-traffic load test and capacity tuning.'],
      ['8.6', 'Security and penetration testing', 3, 'AR', ['7.7'], 'External penetration test and PCI-DSS readiness check.'],
      ['8.7', 'User acceptance testing', 3, 'BA', ['8.3', '8.4'], 'Business users validate end-to-end journeys against acceptance criteria.'],
      ['8.8', 'Bug fixing and regression', 3, 'BE', ['8.5', '8.6', '8.7'], 'Resolve launch-blocking defects and rerun the regression suite.'],
      ['8.9', 'QA sign-off', 0, 'QA', ['8.8'], 'No open critical or high defects; QA approves the release candidate.'],
    ],
  },
  {
    name: 'Deployment',
    tasks: [
      ['9.1', 'Production infrastructure provisioning', 3, 'OPS', ['8.5'], 'Production environment, monitoring, alerting and backups.'],
      ['9.2', 'Data migration and seeding', 2, 'BE2', ['9.1'], 'Load catalog, customer accounts and reference data.'],
      ['9.3', 'Go-live readiness review', 1, 'PM', ['8.9', '9.2'], 'Checklist review with sponsor, operations and support.'],
      ['9.4', 'Production deployment', 1, 'OPS', ['9.3'], 'Release to production and switch traffic.'],
      ['9.5', 'Post-launch monitoring and hypercare', 2, 'OPS', ['9.4'], 'Watch error rates, conversion and AI quality; fix issues fast.'],
      ['9.6', 'Platform go-live', 0, 'PM', ['9.4'], 'Platform open to customers.'],
    ],
  },
  {
    name: 'Project Closure',
    tasks: [
      ['10.1', 'Documentation and knowledge transfer', 2, 'BA', ['9.6'], 'Runbooks, admin guides and handover to the support team.'],
      ['10.2', 'Lessons learned workshop', 1, 'PM', ['9.5'], 'Retrospective with the whole team and key stakeholders.'],
      ['10.3', 'Final report and stakeholder sign-off', 1, 'PM', ['10.1', '10.2'], 'Outcome against business case, budget and schedule.'],
      ['10.4', 'Project closed', 0, 'PM', ['10.3'], 'Sponsor formally closes the project.'],
    ],
  },
]

const DEMO_RISKS: [string, string, number, number, string, string, RiskStatus][] = [
  ['Recommendation model accuracy falls short of the target because historical behaviour data is sparse', 'Technical', 4, 4, 'Start with a content-based baseline, add synthetic sessions for cold-start cases and agree a minimum acceptable precision before launch.', 'ML', 'mitigating'],
  ['Payment gateway certification and PCI-DSS review take longer than planned', 'Compliance', 3, 5, 'Use the gateway’s hosted fields to reduce PCI scope and book the certification slot four weeks ahead.', 'BE2', 'open'],
  ['Authentication service delay blocks order management and payment integration', 'Schedule', 4, 4, 'Add a second developer to authentication this week and stub the token service so dependent work can start.', 'BE', 'open'],
  ['Scope creep from additional AI feature requests after requirements sign-off', 'Scope', 4, 3, 'Route every new request through change control and hold a post-launch backlog for AI enhancements.', 'PM', 'mitigating'],
  ['The ML engineer is a single point of failure for all AI features', 'Resource', 3, 5, 'Document pipelines as they are built and pair a backend developer on model serving.', 'PM', 'open'],
  ['Site performance degrades under peak load once AI services are enabled', 'Technical', 3, 4, 'Cache recommendations, set latency budgets per AI call and load test at twice the expected peak.', 'OPS', 'open'],
  ['Customer data is used for model training without a valid GDPR basis', 'Compliance', 2, 5, 'Complete a data-protection impact assessment and train only on consented, pseudonymised data.', 'AR', 'mitigating'],
  ['Shopping assistant returns inaccurate or off-brand answers', 'Quality', 3, 3, 'Ground answers in catalog and policy content, add guardrail tests and a human hand-off route.', 'ML', 'open'],
  ['Third-party shipping API changes or has outages near launch', 'Supplier', 2, 3, 'Wrap the integration behind an adapter and keep a flat-rate shipping fallback.', 'BE2', 'open'],
  ['Late defects from user acceptance testing compress the bug-fix window', 'Quality', 3, 4, 'Run early acceptance previews at the end of each development sprint.', 'QA', 'open'],
]

/**
 * Give tasks a believable status as of today. `lagDays` models a project running behind plan.
 * Work only starts once its predecessors are finished, so a late task visibly blocks what follows it.
 */
export function simulateProgress(
  tasks: Task[],
  today: string,
  lagDays = 0,
  overrides: Record<string, { status: Status; progress: number }> = {},
): Task[] {
  const g = buildGraph(tasks)
  const now = wIdx(today)
  const eff = now - lagDays
  const next = new Map<string, Task>()
  for (const id of g.topo) {
    const t = g.byId.get(id)!
    const s = wIdx(t.start)
    const e = s + Math.max(t.duration, 1) - 1
    const predsDone = g.preds.get(id)!.every((p) => next.get(p)!.status === 'done')
    let status: Status
    let progress = 0
    const o = overrides[t.name]
    if (o && s <= now) {
      status = o.status
      progress = o.progress
    } else if (!predsDone) {
      status = s - now <= 10 ? 'todo' : 'backlog'
    } else if (t.duration === 0) {
      status = s <= eff ? 'done' : s - now <= 10 ? 'todo' : 'backlog'
      progress = status === 'done' ? 100 : 0
    } else if (e < eff) {
      status = 'done'
      progress = 100
    } else if (s <= eff) {
      progress = Math.min(90, Math.max(10, Math.round((((eff - s + 0.5) / t.duration) * 100) / 5) * 5))
      status = progress >= 85 ? 'review' : 'in_progress'
    } else {
      status = s - now <= 10 ? 'todo' : 'backlog'
    }
    next.set(id, { ...t, status, progress })
  }
  return tasks.map((t) => next.get(t.id) ?? t)
}

function seedActivity(p: Project, today: string): Activity[] {
  const a = analyze(p, today)
  const dayTs = (iso: string, hour: number) => toDay(iso) * 86_400_000 + hour * 3_600_000
  const now = Date.now()
  const out: Activity[] = []
  for (const r of a.leaves) {
    if (r.status === 'done') {
      out.push({
        id: uid('a_'),
        ts: dayTs(r.end, 15 + (r.sIdx % 3)),
        kind: r.task.milestone ? 'milestone' : 'task',
        text: r.task.milestone ? `Milestone reached: ${r.task.name}` : `${r.code} ${r.task.name} completed`,
      })
    } else if (r.status === 'in_progress' || r.status === 'review') {
      out.push({ id: uid('a_'), ts: dayTs(r.start, 9 + (r.sIdx % 2)), kind: 'task', text: `${r.code} ${r.task.name} started` })
    }
  }
  p.risks.slice(0, 2).forEach((r, i) => {
    out.push({ id: uid('a_'), ts: now - (i * 4 + 2) * 86_400_000 - 3_600_000 * (i + 3), kind: 'risk', text: `Risk ${r.code} reviewed: ${r.description}` })
  })
  return out
    .filter((x) => x.ts <= now)
    .sort((x, y) => y.ts - x.ts)
    .slice(0, 14)
}

export function createDemoProject(today = todayISO()): Project {
  // Start five weeks before the current week, so "today" always falls in week 6 of 12.
  const start = addDays(mondayOf(today), -35)
  const resources: Resource[] = TEAM.map(([, name, role, allocation]) => ({ id: uid('r_'), name, role, allocation }))
  const ownerId = new Map(TEAM.map(([key], i) => [key, resources[i].id]))

  const idOf = new Map<string, string>()
  let tasks: Task[] = []
  for (const ph of DEMO_PHASES) {
    const phaseId = uid('t_')
    tasks.push(blankTask(phaseId, null, ph.name, start))
    for (const [ref, name, days, owner, , description] of ph.tasks) {
      const id = uid('t_')
      idOf.set(ref, id)
      tasks.push({
        ...blankTask(id, phaseId, name, start),
        description,
        duration: days,
        ownerId: ownerId.get(owner) ?? null,
        milestone: days === 0,
        priority: 'medium',
        dependencies: [],
      })
    }
  }
  // Resolve predecessor refs in a second pass, since a few point at later phases.
  for (const ph of DEMO_PHASES) {
    for (const [ref, , , , deps] of ph.tasks) {
      const t = tasks.find((x) => x.id === idOf.get(ref))!
      t.dependencies = deps.map((d) => idOf.get(d)!).filter(Boolean)
    }
  }
  tasks = autoSchedule(tasks, start)
  tasks = simulateProgress(tasks, today, 0, {
    'User authentication and account service': { status: 'in_progress', progress: 70 },
    'Product catalog and inventory service': { status: 'in_progress', progress: 80 },
    'Usability testing and design sign-off': { status: 'review', progress: 90 },
    'Recommendation engine model': { status: 'in_progress', progress: 15 },
  })

  const risks: Risk[] = DEMO_RISKS.map(([description, category, probability, impact, mitigation, owner, status], i) => ({
    id: uid('k_'),
    code: `R-${String(i + 1).padStart(3, '0')}`,
    description,
    category,
    probability,
    impact,
    ownerId: ownerId.get(owner) ?? null,
    mitigation,
    status,
  }))

  const now = Date.now()
  let project: Project = {
    id: 'p_demo_ecommerce',
    name: 'Development of an AI-Powered E-Commerce Platform',
    description:
      'Build and launch a modern online store with AI-driven product recommendations, semantic search and a conversational shopping assistant. The platform replaces the legacy storefront and must be live before the holiday trading period.',
    type: 'software',
    complexity: 'complex',
    start,
    targetEnd: addDays(start, 81), // Friday of week 12
    teamSize: TEAM.length,
    budget: 240_000,
    spent: 0,
    color: '#6250d6',
    source: 'sample',
    planNotes: [],
    createdAt: now - 36 * 86_400_000,
    updatedAt: now,
    charter: {
      objective:
        'Launch an AI-powered e-commerce platform within 12 weeks that lifts online conversion by 15% through personalised recommendations, semantic search and an AI shopping assistant.',
      justification:
        'The legacy storefront cannot support personalisation and loses an estimated 22% of sessions at search. Competitors with AI-assisted shopping report higher basket values; a modern platform protects market share and reduces support cost through self-service.',
      scope: [
        'Customer storefront: catalog, search, product pages, cart, checkout and accounts',
        'Payments, order management and transactional notifications',
        'AI features: product recommendations, semantic search and shopping assistant',
        'Admin dashboard for catalog, orders and sales reporting',
        'Cloud infrastructure, CI/CD, monitoring and production launch',
      ],
      outOfScope: ['Native mobile apps', 'Marketplace and third-party seller features', 'Warehouse management and ERP replacement', 'International tax and multi-currency beyond launch markets'],
      deliverables: [
        'Approved project charter and requirements baseline',
        'System architecture and approved UI design',
        'Production-ready backend services and web storefront',
        'Integrated AI services with evaluation report',
        'QA sign-off, security test report and go-live',
        'Operations runbooks and project closure report',
      ],
      stakeholders: ['Chief Digital Officer (sponsor)', 'Head of E-Commerce (product owner)', 'Merchandising and marketing', 'Customer service', 'IT security and compliance', 'Finance'],
      successCriteria: [
        'Platform live by the end of week 12 with no critical defects',
        'Checkout conversion improves by at least 15% within 60 days of launch',
        'Recommendation click-through rate above 8%',
        '95th-percentile page load under 2 seconds at peak traffic',
        'Total cost within the $240,000 budget',
      ],
      assumptions: [
        'The core team of 11 is dedicated for the full 12 weeks',
        'Historical order and clickstream data is available for model training',
        'Payment gateway sandbox access is provided by week 3',
        'Stakeholders approve deliverables within three working days',
      ],
      constraints: ['Fixed go-live before the holiday trading period', 'Budget ceiling of $240,000', 'PCI-DSS and GDPR compliance are mandatory', 'One ML engineer is available to the project'],
    },
    tasks,
    risks,
    resources,
    activity: [],
  }

  // Priorities follow the critical path, and spend runs slightly ahead of plan to make the report interesting.
  const a = analyze(project, today)
  project = {
    ...project,
    tasks: project.tasks.map((t) => {
      const r = a.byId.get(t.id)
      if (!r || r.isSummary) return t
      return { ...t, priority: r.critical ? (t.duration >= 5 || t.milestone ? 'critical' : 'high') : r.slack <= 4 ? 'medium' : 'low' }
    }),
    spent: Math.round(((project.budget ?? 0) * (a.planned / 100) * 1.05) / 500) * 500,
  }
  project.activity = seedActivity(project, today)
  return project
}

/* ───────────────────────────── Supporting portfolio projects ───────────────────────────── */

interface Sample {
  input: Omit<GeneratorInput, 'start' | 'targetEnd'>
  startWeeksAgo: number
  weeks: number
  lagDays: number
  color: string
  spendFactor: number
}

const SAMPLES: Sample[] = [
  {
    input: {
      name: 'Mobile Banking App Redesign',
      description: 'Redesign the retail banking app with biometric login, instant transfers and a simplified navigation model. Ship to both app stores with a staged rollout.',
      type: 'mobile',
      teamSize: 9,
      budget: 380_000,
      complexity: 'complex',
    },
    startWeeksAgo: 8,
    weeks: 18,
    lagDays: 0,
    color: '#2a78d6',
    spendFactor: 0.97,
  },
  {
    input: {
      name: 'Customer Churn Prediction Model',
      description: 'Predict which subscribers are likely to cancel in the next 60 days so the retention team can intervene. Deliver scores to the CRM every night.',
      type: 'ai_data',
      teamSize: 5,
      budget: 95_000,
      complexity: 'medium',
    },
    startWeeksAgo: 7,
    weeks: 11,
    lagDays: 7,
    color: '#eb6834',
    spendFactor: 1.12,
  },
  {
    input: {
      name: 'Spring Product Launch Campaign',
      description: 'Integrated campaign across paid social, email and partners to launch the spring collection and generate 4,000 qualified leads.',
      type: 'marketing',
      teamSize: 6,
      budget: 60_000,
      complexity: 'medium',
    },
    startWeeksAgo: 2,
    weeks: 9,
    lagDays: 1,
    color: '#1baf7a',
    spendFactor: 0.9,
  },
  {
    input: {
      name: 'Warehouse Management System Rollout',
      description: 'Replace spreadsheet-based stock control with a barcode-driven warehouse management system across three distribution centres.',
      type: 'software',
      teamSize: 7,
      budget: 210_000,
      complexity: 'medium',
    },
    startWeeksAgo: 20,
    weeks: 15,
    lagDays: 0,
    color: '#e87ba4',
    spendFactor: 0.98,
  },
]

function createSample(s: Sample, today: string): Project {
  const start = addDays(mondayOf(today), -7 * s.startWeeksAgo)
  const targetEnd = addDays(start, 7 * s.weeks - 3)
  let p = generateWithEngine({ ...s.input, start, targetEnd }, 'sample')
  p = { ...p, color: s.color, planNotes: [], createdAt: toDay(start) * 86_400_000, tasks: simulateProgress(p.tasks, today, s.lagDays) }
  const a = analyze(p, today)
  const finished = a.percent === 100
  p = {
    ...p,
    spent: Math.round(((p.budget ?? 0) * (finished ? 1 : a.planned / 100) * s.spendFactor) / 500) * 500,
    risks: p.risks.map((r, i) => ({ ...r, status: finished ? 'closed' : i % 3 === 0 ? 'mitigating' : 'open' })),
  }
  p.activity = seedActivity(p, today)
  return p
}

export function createSeedWorkspace(today = todayISO()): Workspace {
  const demo = createDemoProject(today)
  return {
    version: WORKSPACE_VERSION,
    projects: [demo, ...SAMPLES.map((s) => createSample(s, today))],
    currentProjectId: demo.id,
    settings: { ...DEFAULT_SETTINGS },
  }
}

/** Finish date of the demo plan, exposed for tests. */
export const demoEnd = (p: Project) => fromWIdx(analyze(p).eIdx)
