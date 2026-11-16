# ProjectPilot AI

An AI-assisted project planning and management platform. Describe a project and get a charter, work breakdown structure, schedule, risk register and resource plan — then manage it through a WBS builder, Gantt timeline, Kanban board, risk analysis and executive reports that all read the same data.

Built with React 19, TypeScript, Vite, Tailwind CSS 4, Zustand and Recharts. It runs entirely in the browser; there is no backend.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds to `dist/` |
| `npm run preview` | Serves the production build |
| `npm test` | Runs the scheduling and generator tests |
| `npm run typecheck` | Type-checks without building |

The first launch loads a sample portfolio, including the 12-week demo project *Development of an AI-Powered E-Commerce Platform* (10 phases, 54 tasks, 10 milestones, 11 people, 10 risks). Sample dates are generated relative to the day you first open the app, so the demo is always mid-flight. **Settings → Data → Reset demo data** restores it.

## Features

- **Dashboard** — portfolio KPIs, progress against plan, tasks by status, upcoming deadlines, recent activity, a health table and AI Project Insights (projects at risk, critical deadlines, resource warnings, suggested improvements).
- **AI Project Generator** — a form for name, description, type, dates, team size, budget and complexity that produces an editable charter, WBS, schedule, risk register and resource plan.
- **WBS Builder** — tree-table with WBS numbering, expand and collapse, inline editing, owners, durations, priorities, dependencies, milestones, subtasks and reordering.
- **Gantt Timeline** — day, week and month views; drag a bar to move a task or its right edge to change the duration; dependency arrows, milestones, today and target markers, and critical-path highlighting.
- **Task Board** — Kanban columns (Backlog, To Do, In Progress, Review, Completed) with drag and drop, filters and blocked-task indicators.
- **Risk Analysis** — register, 5×5 probability–impact matrix (score = probability × impact), and an analyst that derives recommendations from tasks, deadlines and dependencies.
- **Reports** — executive status report with S-curve, earned-value budget figures, milestones, risks and recommended actions; PDF and CSV export.
- **Project assistant** — floating chat that answers questions about the open project from its live data.

Every view reads one analysis of the current project (`src/lib/schedule.ts`), so a change made anywhere — a duration in the WBS, a bar dragged in the Gantt, a card moved on the board — shows up everywhere at once.

## How the AI works

There are two engines, selectable under **Settings → AI engine**. The interface always states which one produced a result.

**Built-in planning engine (default).** Deterministic and offline. Plans are assembled from a library of project-type templates (`src/ai/templates.ts`), sized to the chosen complexity, scheduled through the dependency network and fitted to the target date, with roles merged or split to match the team size. If the target date cannot be met, the plan says so rather than pretending. Insights, risk recommendations and assistant answers are rules over the project's tasks, dates, dependencies, owners and risks.

**Claude API (optional).** With your own Anthropic API key, Claude drafts the charter, WBS and risks, and answers assistant questions. Dates and dependencies are still scheduled locally. The key is stored only in the browser's local storage and requests go directly from the browser to `api.anthropic.com`. If a request fails, the app shows the reason and falls back to the built-in engine; a failed call is never presented as a result.

## Scheduling rules

- Durations are working days, Monday to Friday. Public holidays are not modelled.
- Dependencies are finish-to-start. A task starts the working day after its predecessors finish; a 0-day milestone lands on the day they finish.
- Editing a date, duration or dependency pushes later tasks wherever a dependency would be violated. **Auto-schedule** additionally pulls unstarted tasks back to their earliest dates.
- The critical path is every task with zero slack against the project finish.
- Health (0–100) combines schedule performance, overdue tasks, open high-severity risks and the forecast against the target date.

## Project structure

```
src/
  types.ts              Domain model
  store.ts              Zustand store: all mutations, activity log, persistence
  router.ts             Hash-based routing
  lib/
    dates.ts            Working-day calendar arithmetic
    schedule.ts         WBS tree, dependency graph, cascade, critical path, health
    risk.ts             Risk scoring and severity bands
    report.ts, pdf.ts   Report data, CSV and PDF export
  ai/
    templates.ts        Project-type knowledge base
    generator.ts        Outline -> scheduled project (shared by both engines)
    insights.ts         Portfolio insights, workload, risk analyst
    assistant.ts        Rule-based assistant
    claude.ts           Optional Claude API integration
  data/
    repository.ts       Persistence interface + localStorage implementation
    seed.ts             Demo project and sample portfolio
  components/           Layout, UI kit, WBS table, Gantt chart, task drawer, assistant
  pages/                One file per screen
```

### Replacing localStorage with a database

All persistence goes through the `WorkspaceRepository` interface in `src/data/repository.ts` (`load`, `save`, `clear`, all async). To move to a backend, implement that interface against your API and export it as `repository`; the store and views do not change.

## Notes

- Data lives in the browser's local storage. Use **Settings → Data** to export or import a workspace as JSON.
- Board drag and drop uses native HTML drag events, which touch browsers do not fire. On a tablet, change a task's status from its detail panel instead.
- The subscription indicator is illustrative; no billing is connected.
