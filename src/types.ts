/** Domain model shared by every view. Dates are ISO `YYYY-MM-DD` strings; durations are working days. */

export type ISODate = string
export type Status = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type Complexity = 'simple' | 'medium' | 'complex'
export type ProjectType =
  | 'software'
  | 'mobile'
  | 'ai_data'
  | 'marketing'
  | 'construction'
  | 'research'
  | 'event'
  | 'general'
export type RiskStatus = 'open' | 'mitigating' | 'closed'
/** Where a plan came from. Shown in the UI so a locally generated plan is never passed off as an API result. */
export type PlanSource = 'sample' | 'engine' | 'claude' | 'manual'

export interface Task {
  id: string
  /** null for a phase (top-level item). */
  parentId: string | null
  name: string
  description: string
  ownerId: string | null
  /** First working day. Ignored for summary tasks, whose dates roll up from their children. */
  start: ISODate
  /** Working days. 0 is a milestone gate. */
  duration: number
  progress: number
  status: Status
  priority: Priority
  /** Predecessor task ids (finish-to-start). */
  dependencies: string[]
  milestone: boolean
}

export interface Risk {
  id: string
  code: string
  description: string
  category: string
  probability: number
  impact: number
  ownerId: string | null
  mitigation: string
  status: RiskStatus
}

export interface Resource {
  id: string
  name: string
  role: string
  /** Share of this person's week available to the project, 0–100. */
  allocation: number
}

export interface Charter {
  objective: string
  justification: string
  scope: string[]
  outOfScope: string[]
  deliverables: string[]
  stakeholders: string[]
  successCriteria: string[]
  assumptions: string[]
  constraints: string[]
}

export type ActivityKind = 'task' | 'risk' | 'plan' | 'milestone' | 'project'

export interface Activity {
  id: string
  ts: number
  kind: ActivityKind
  text: string
}

export interface Project {
  id: string
  name: string
  description: string
  type: ProjectType
  complexity: Complexity
  start: ISODate
  targetEnd: ISODate
  teamSize: number
  budget: number | null
  spent: number
  color: string
  source: PlanSource
  /** Notes the generator attached about feasibility, e.g. a target date that cannot be met. */
  planNotes: string[]
  createdAt: number
  updatedAt: number
  charter: Charter
  tasks: Task[]
  risks: Risk[]
  resources: Resource[]
  activity: Activity[]
}

export interface Settings {
  userName: string
  userEmail: string
  userRole: string
  workspace: string
  aiProvider: 'engine' | 'claude'
  apiKey: string
  model: string
  notificationsSeenAt: number
}

export interface Workspace {
  version: number
  projects: Project[]
  currentProjectId: string | null
  settings: Settings
}

export interface GeneratorInput {
  name: string
  description: string
  type: ProjectType
  start: ISODate
  targetEnd: ISODate
  teamSize: number
  budget: number | null
  complexity: Complexity
}

export const STATUSES: Status[] = ['backlog', 'todo', 'in_progress', 'review', 'done']
export const STATUS_LABEL: Record<Status, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Completed',
}
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}
export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  software: 'Software / Web Application',
  mobile: 'Mobile App',
  ai_data: 'AI / Data Science',
  marketing: 'Marketing Campaign',
  construction: 'Construction / Engineering',
  research: 'Research / Academic',
  event: 'Event',
  general: 'General Business Project',
}
export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  simple: 'Simple',
  medium: 'Medium',
  complex: 'Complex',
}
export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  open: 'Open',
  mitigating: 'Mitigating',
  closed: 'Closed',
}
