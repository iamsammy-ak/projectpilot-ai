import type { ProjectType } from '../types'

/**
 * Knowledge base for the built-in planning engine.
 *
 * Task tuple: [name, typical working days at medium complexity, role code, dependencies?, minimum level?]
 *  - dependencies: indexes of tasks in the same phase. Omitted = the previous task; [] = starts with the phase.
 *  - minimum level: 1 simple (default), 2 medium, 3 complex — lets complex projects get a deeper breakdown.
 * Each phase ends with a zero-duration milestone gate.
 */
export type TaskT = [name: string, days: number, role: string, deps?: number[], level?: number]

export interface PhaseT {
  name: string
  gate: string
  /** Phases that must finish first (indexes). Omitted = the previous phase. */
  after?: number[]
  tasks: TaskT[]
}

/** [description, category, probability 1–5, impact 1–5, mitigation, owner role code] */
export type RiskT = [string, string, number, number, string, string]

export interface Template {
  roles: Record<string, string>
  phases: PhaseT[]
  risks: RiskT[]
  justification: string
  stakeholders: string[]
  outOfScope: string[]
  success: string[]
}

export const TEMPLATES: Record<ProjectType, Template> = {
  software: {
    roles: {
      PM: 'Project Manager',
      BA: 'Business Analyst',
      AR: 'Solutions Architect',
      UX: 'UX/UI Designer',
      BE: 'Backend Developer',
      FE: 'Frontend Developer',
      QA: 'QA Engineer',
      DO: 'DevOps Engineer',
    },
    phases: [
      {
        name: 'Initiation & Planning',
        gate: 'Project charter approved',
        tasks: [
          ['Define goals, scope and success metrics', 2, 'PM'],
          ['Identify stakeholders and assemble the team', 1, 'PM', [0]],
          ['Prepare project plan and communication cadence', 2, 'PM', [0]],
          ['Run kickoff workshop', 1, 'PM', [1, 2]],
        ],
      },
      {
        name: 'Requirements',
        gate: 'Requirements signed off',
        tasks: [
          ['Stakeholder interviews and discovery workshops', 3, 'BA'],
          ['Write functional requirements and user stories', 4, 'BA'],
          ['Define non-functional and compliance requirements', 2, 'AR', [0], 2],
          ['Prioritise backlog and confirm release scope', 1, 'PM', [1, 2]],
        ],
      },
      {
        name: 'Architecture & Design',
        gate: 'Design approved',
        tasks: [
          ['Design system architecture', 3, 'AR'],
          ['Model data and define API contracts', 3, 'BE'],
          ['Architecture and security review', 1, 'AR', [1], 2],
          ['Wireframes and user flows', 3, 'UX', []],
          ['High-fidelity UI design and clickable prototype', 4, 'UX', [3]],
          ['Usability test the prototype', 2, 'UX', [4], 3],
        ],
      },
      {
        name: 'Development',
        gate: 'Feature complete',
        tasks: [
          ['Set up repositories, environments and CI/CD', 2, 'DO'],
          ['Build core backend services and database', 8, 'BE'],
          ['Build user-facing frontend', 8, 'FE', [0]],
          ['Implement authentication and access control', 3, 'BE', [1], 2],
          ['Integrate third-party services and APIs', 4, 'BE', [3]],
          ['Build admin and reporting features', 4, 'FE', [2], 2],
          ['Connect frontend to live APIs', 3, 'FE', [4, 5]],
          ['Performance optimisation and hardening', 3, 'BE', [6], 3],
        ],
      },
      {
        name: 'Testing & Quality Assurance',
        gate: 'QA sign-off',
        tasks: [
          ['Write test plan and test cases', 2, 'QA'],
          ['Functional and integration testing', 4, 'QA'],
          ['Performance and security testing', 3, 'DO', [0], 2],
          ['User acceptance testing', 3, 'BA', [1]],
          ['Fix defects and run regression', 3, 'BE', [2, 3]],
        ],
      },
      {
        name: 'Launch & Closure',
        gate: 'Project closed',
        tasks: [
          ['Prepare production environment and release plan', 2, 'DO'],
          ['Deploy to production', 1, 'DO'],
          ['Train users and hand over documentation', 2, 'BA', [0]],
          ['Post-launch monitoring and support', 3, 'DO', [1], 2],
          ['Lessons learned and closure report', 1, 'PM', [1, 2, 3]],
        ],
      },
    ],
    risks: [
      ['Requirements change after sign-off, causing rework and scope creep', 'Scope', 4, 4, 'Freeze scope at sign-off, route changes through a change-control board and keep a prioritised backlog for later releases.', 'PM'],
      ['Third-party API or integration behaves differently from its documentation', 'Technical', 3, 4, 'Build integration spikes early, mock external services in tests and agree fallback behaviour for outages.', 'BE'],
      ['Key developer becomes unavailable during the build', 'Resource', 2, 4, 'Pair on critical modules, keep architecture decisions documented and cross-train a second owner per service.', 'PM'],
      ['Defects found late in testing delay the release', 'Quality', 3, 4, 'Automate regression tests from the first sprint and run integration tests on every merge.', 'QA'],
      ['Security vulnerability or data-protection gap discovered before launch', 'Security', 2, 5, 'Threat-model the design, run dependency and penetration scans and review access control before go-live.', 'AR'],
      ['Production environment differs from test, causing deployment failures', 'Operational', 2, 3, 'Define infrastructure as code, rehearse the deployment and keep a tested rollback plan.', 'DO'],
    ],
    justification:
      'A purpose-built system removes manual work and gives the business a platform it controls, improving speed, data quality and customer experience.',
    stakeholders: ['Executive sponsor', 'Product owner', 'End users', 'IT operations', 'Information security', 'Delivery team'],
    outOfScope: ['Migration of legacy data beyond the agreed cut-over set', 'Native mobile applications', 'Ongoing feature development after the closure report'],
    success: ['All must-have user stories accepted in UAT', 'No open critical or high-severity defects at go-live', 'Core pages respond in under 2 seconds at expected load'],
  },

  mobile: {
    roles: {
      PM: 'Product Manager',
      UX: 'Product Designer',
      IOS: 'iOS Developer',
      AND: 'Android Developer',
      BE: 'Backend Developer',
      QA: 'QA Engineer',
      REL: 'Release Manager',
    },
    phases: [
      {
        name: 'Discovery & Strategy',
        gate: 'Product brief approved',
        tasks: [
          ['Define product goals and target users', 2, 'PM'],
          ['Competitor and app-store research', 2, 'PM', [0]],
          ['User interviews and journey mapping', 3, 'UX', [0], 2],
          ['Prioritise feature set for first release', 1, 'PM', [1, 2]],
        ],
      },
      {
        name: 'UX & UI Design',
        gate: 'Design approved',
        tasks: [
          ['Information architecture and user flows', 2, 'UX'],
          ['Low-fidelity wireframes', 3, 'UX'],
          ['Visual design and component library', 4, 'UX'],
          ['Interactive prototype and usability testing', 3, 'UX'],
          ['Accessibility review', 1, 'UX', [2], 3],
        ],
      },
      {
        name: 'Backend & API',
        gate: 'API ready for integration',
        after: [0],
        tasks: [
          ['Define API contracts and data model', 2, 'BE'],
          ['Build authentication and user profile services', 4, 'BE'],
          ['Build core feature APIs', 6, 'BE'],
          ['Push notifications and background jobs', 3, 'BE', [1], 2],
          ['API load testing and security review', 2, 'BE', [2, 3], 3],
        ],
      },
      {
        name: 'App Development',
        gate: 'Feature complete',
        after: [1],
        tasks: [
          ['Project setup, navigation and design-system components', 3, 'IOS'],
          ['Build iOS screens and local state', 7, 'IOS'],
          ['Build Android screens and local state', 7, 'AND', [0]],
          ['Integrate apps with backend APIs', 4, 'IOS', [1, 2]],
          ['Offline mode and data sync', 3, 'AND', [3], 2],
          ['Analytics, crash reporting and deep links', 2, 'AND', [3]],
        ],
      },
      {
        name: 'Testing & Beta',
        gate: 'Release candidate approved',
        after: [2, 3],
        tasks: [
          ['Device and OS compatibility testing', 3, 'QA'],
          ['Functional and regression testing', 4, 'QA', []],
          ['Closed beta with real users', 5, 'PM', [1]],
          ['Fix beta feedback and defects', 3, 'IOS', [0, 2]],
        ],
      },
      {
        name: 'Store Launch',
        gate: 'App live in stores',
        tasks: [
          ['Prepare store listings, screenshots and privacy details', 2, 'REL'],
          ['Submit for App Store and Play Store review', 3, 'REL'],
          ['Staged rollout and monitoring', 3, 'REL'],
          ['Launch retrospective and roadmap handover', 1, 'PM', [2]],
        ],
      },
    ],
    risks: [
      ['App Store or Play Store review rejects the submission', 'Compliance', 3, 4, 'Review platform guidelines during design, submit a beta build early and reserve a buffer for resubmission.', 'REL'],
      ['Device and OS fragmentation causes layout or performance defects', 'Technical', 4, 3, 'Agree a supported-device matrix, test on real devices each sprint and automate UI smoke tests.', 'QA'],
      ['Backend API is not ready when app screens need it', 'Schedule', 3, 4, 'Agree API contracts first, give app developers a mock server and track integration milestones weekly.', 'BE'],
      ['Beta users report usability problems that require redesign', 'Quality', 3, 3, 'Test the prototype with target users before development and time-box post-beta fixes.', 'UX'],
      ['Sensitive user data is exposed on the device or in transit', 'Security', 2, 5, 'Encrypt stored data, pin certificates, and run a mobile security assessment before launch.', 'BE'],
      ['Feature parity between iOS and Android drifts', 'Scope', 3, 3, 'Share one backlog and acceptance criteria for both platforms and demo them side by side.', 'PM'],
    ],
    justification:
      'Customers increasingly expect to complete key journeys on their phones. A well-designed app raises engagement, retention and satisfaction while lowering the cost to serve.',
    stakeholders: ['Product sponsor', 'Marketing', 'Customer support', 'Compliance and privacy', 'Beta testers', 'Mobile delivery team'],
    outOfScope: ['Tablet-specific layouts', 'Wearable companion apps', 'Paid user acquisition campaigns'],
    success: ['Crash-free sessions above 99.5%', 'Store rating of 4.3 or higher after the first 500 reviews', 'Approved by both stores on the first or second submission'],
  },

  ai_data: {
    roles: {
      PM: 'Project Manager',
      DS: 'Data Scientist',
      DE: 'Data Engineer',
      MLE: 'ML Engineer',
      DA: 'Data Analyst',
      SME: 'Domain Expert',
    },
    phases: [
      {
        name: 'Problem Framing',
        gate: 'Use case and metrics approved',
        tasks: [
          ['Define business problem and decision to support', 2, 'PM'],
          ['Agree success metrics and baseline', 2, 'DS'],
          ['Assess data availability, privacy and ethics', 2, 'SME', [0], 2],
          ['Confirm scope and delivery plan', 1, 'PM', [1, 2]],
        ],
      },
      {
        name: 'Data Collection & Preparation',
        gate: 'Training dataset ready',
        tasks: [
          ['Inventory data sources and secure access', 2, 'DE'],
          ['Build ingestion pipelines', 5, 'DE'],
          ['Exploratory data analysis', 4, 'DA', [0]],
          ['Clean, label and validate data', 5, 'DA', [1, 2]],
          ['Feature engineering and feature store', 4, 'DS', [3]],
        ],
      },
      {
        name: 'Model Development',
        gate: 'Candidate model selected',
        tasks: [
          ['Train baseline model', 3, 'DS'],
          ['Experiment with model architectures', 6, 'DS'],
          ['Hyperparameter tuning', 3, 'MLE', [1], 2],
          ['Error analysis with domain experts', 2, 'SME', [1]],
          ['Document experiments and model card', 2, 'DS', [2, 3], 2],
        ],
      },
      {
        name: 'Evaluation & Validation',
        gate: 'Model approved for deployment',
        tasks: [
          ['Evaluate on hold-out and recent data', 3, 'DS'],
          ['Bias, fairness and robustness testing', 3, 'DS', [], 2],
          ['Business validation of predictions', 2, 'SME', [0]],
          ['Explainability report for stakeholders', 2, 'DA', [0], 3],
        ],
      },
      {
        name: 'Deployment & MLOps',
        gate: 'Model live in production',
        tasks: [
          ['Package model and build inference service', 4, 'MLE'],
          ['Integrate predictions with business systems', 4, 'DE'],
          ['Set up monitoring, drift detection and alerts', 3, 'MLE', [0]],
          ['Shadow or A/B rollout', 4, 'MLE', [1, 2], 2],
        ],
      },
      {
        name: 'Adoption & Handover',
        gate: 'Project closed',
        tasks: [
          ['Train users and publish playbook', 2, 'DA'],
          ['Define retraining schedule and ownership', 1, 'MLE', []],
          ['Measure business impact against baseline', 3, 'DA', [0]],
          ['Closure report and next-phase recommendations', 1, 'PM', [1, 2]],
        ],
      },
    ],
    risks: [
      ['Data quality or volume is insufficient to reach the target accuracy', 'Data', 4, 5, 'Profile the data in week one, define a minimum viable dataset and agree a fallback rule-based approach.', 'DE'],
      ['Model performs well offline but degrades on live data', 'Technical', 3, 4, 'Validate on recent out-of-time data, deploy in shadow mode first and monitor drift from day one.', 'MLE'],
      ['Model produces biased or unexplainable outcomes', 'Ethics', 3, 5, 'Run fairness tests across key segments, document a model card and keep a human in the loop for high-impact decisions.', 'DS'],
      ['Access to source systems or personal data is delayed by governance', 'Compliance', 3, 4, 'Start data-access and privacy reviews at kickoff and work on synthetic or anonymised samples meanwhile.', 'PM'],
      ['Business users do not trust or adopt model outputs', 'Adoption', 3, 4, 'Involve domain experts in error analysis, provide explanations with each prediction and train users before launch.', 'SME'],
      ['Compute cost or training time exceeds the plan', 'Cost', 2, 3, 'Benchmark on a sample first, set budget alerts and prefer simpler models when the accuracy gain is marginal.', 'MLE'],
    ],
    justification:
      'Turning existing data into predictions lets the organisation act earlier and more consistently than manual analysis allows, with a measurable effect on revenue, cost or risk.',
    stakeholders: ['Business sponsor', 'Data owner', 'Domain experts', 'Legal and privacy', 'IT platform team', 'End users of the predictions'],
    outOfScope: ['Replacing source systems of record', 'Fully automated decisions without human review', 'Use cases beyond the approved problem statement'],
    success: ['Model beats the agreed baseline on the primary metric', 'Fairness checks pass for all monitored segments', 'Predictions used in the live business process within the project window'],
  },

  marketing: {
    roles: {
      MM: 'Marketing Manager',
      CS: 'Content Strategist',
      DES: 'Graphic Designer',
      PMK: 'Performance Marketer',
      SOC: 'Social Media Manager',
      AN: 'Marketing Analyst',
    },
    phases: [
      {
        name: 'Strategy & Research',
        gate: 'Campaign brief approved',
        tasks: [
          ['Define campaign objectives and KPIs', 1, 'MM'],
          ['Audience and competitor research', 3, 'AN'],
          ['Positioning and key messages', 2, 'CS'],
          ['Channel plan and budget allocation', 2, 'MM', [1]],
        ],
      },
      {
        name: 'Creative Development',
        gate: 'Creative approved',
        tasks: [
          ['Creative concept and campaign theme', 3, 'CS'],
          ['Write copy for ads, email and landing page', 4, 'CS'],
          ['Design visual assets and templates', 5, 'DES', [0]],
          ['Produce video and motion assets', 5, 'DES', [2], 2],
          ['Brand, legal and stakeholder review', 2, 'MM', [1, 2, 3]],
        ],
      },
      {
        name: 'Channel Setup',
        gate: 'Campaign ready to launch',
        tasks: [
          ['Build and test landing page', 4, 'PMK'],
          ['Set up tracking, UTM plan and dashboards', 2, 'AN', []],
          ['Configure ad accounts and audiences', 2, 'PMK', [1]],
          ['Schedule email and social content calendar', 3, 'SOC', []],
          ['Influencer and partner outreach', 4, 'SOC', [], 3],
        ],
      },
      {
        name: 'Launch & Optimisation',
        gate: 'Campaign complete',
        tasks: [
          ['Launch across paid, owned and social channels', 1, 'PMK'],
          ['Daily monitoring and budget pacing', 8, 'PMK'],
          ['Community management and engagement', 8, 'SOC', [0]],
          ['A/B test creatives and landing page', 5, 'AN', [0], 2],
          ['Mid-campaign optimisation review', 1, 'MM', [3]],
        ],
      },
      {
        name: 'Reporting & Wrap-up',
        gate: 'Results presented',
        tasks: [
          ['Consolidate performance data', 2, 'AN'],
          ['Analyse ROI and attribution', 2, 'AN'],
          ['Document learnings and reusable assets', 1, 'CS', [0]],
          ['Present results to stakeholders', 1, 'MM', [1, 2]],
        ],
      },
    ],
    risks: [
      ['Creative approvals take longer than planned and delay launch', 'Schedule', 4, 3, 'Agree one accountable approver, book review slots in advance and limit feedback to two rounds.', 'MM'],
      ['Campaign underperforms against lead or conversion targets', 'Performance', 3, 4, 'Set weekly performance thresholds, keep 15% of budget unallocated and reallocate to the best channels.', 'PMK'],
      ['Tracking or attribution is broken at launch', 'Data', 3, 4, 'Test every tag and conversion event in a staging run and verify dashboards before spending.', 'AN'],
      ['Media costs rise and exhaust the budget early', 'Cost', 3, 3, 'Set daily caps and pacing alerts and prepare lower-cost organic alternatives.', 'PMK'],
      ['Message is poorly received or causes negative sentiment', 'Reputation', 2, 4, 'Pre-test concepts with a sample audience and prepare a response protocol for social channels.', 'SOC'],
      ['Advertising claims breach regulation or platform policy', 'Compliance', 2, 4, 'Run legal review on all claims and check each platform policy before upload.', 'MM'],
    ],
    justification:
      'A coordinated campaign concentrates budget and message on the audiences most likely to convert, building pipeline and brand awareness more efficiently than ad-hoc activity.',
    stakeholders: ['Head of marketing', 'Sales leadership', 'Brand and legal', 'Agency partners', 'Target customers', 'Campaign team'],
    outOfScope: ['Product or pricing changes', 'Always-on marketing after the campaign window', 'Website redesign beyond the campaign landing page'],
    success: ['Lead or conversion target met within budget', 'Cost per acquisition at or below the agreed ceiling', 'Full-funnel reporting delivered within one week of campaign end'],
  },

  construction: {
    roles: {
      PM: 'Project Manager',
      AR: 'Architect',
      SE: 'Structural Engineer',
      SM: 'Site Manager',
      QS: 'Quantity Surveyor',
      MEP: 'MEP Engineer',
      HSE: 'Health & Safety Officer',
    },
    phases: [
      {
        name: 'Feasibility & Planning',
        gate: 'Project brief approved',
        tasks: [
          ['Confirm client requirements and project brief', 2, 'PM'],
          ['Site survey and geotechnical investigation', 5, 'SE'],
          ['Feasibility study and cost estimate', 4, 'QS', [0]],
          ['Establish programme and risk plan', 2, 'PM', [1, 2]],
        ],
      },
      {
        name: 'Design & Permits',
        gate: 'Permits granted',
        tasks: [
          ['Concept and schematic design', 6, 'AR'],
          ['Structural design and calculations', 6, 'SE'],
          ['MEP services design', 5, 'MEP', [0]],
          ['Detailed drawings and specifications', 6, 'AR', [1, 2]],
          ['Submit and obtain building permits', 10, 'PM', [3]],
        ],
      },
      {
        name: 'Procurement',
        gate: 'Contracts awarded',
        after: [0],
        tasks: [
          ['Prepare bill of quantities and tender documents', 5, 'QS'],
          ['Tender, evaluate bids and negotiate', 8, 'QS'],
          ['Order long-lead materials and equipment', 5, 'QS', [0], 2],
          ['Award contracts and mobilise contractors', 3, 'PM', [1]],
        ],
      },
      {
        name: 'Site Works & Structure',
        gate: 'Structure complete',
        after: [1, 2],
        tasks: [
          ['Site setup, hoarding and safety induction', 3, 'HSE'],
          ['Earthworks and foundations', 12, 'SM'],
          ['Structural frame and floors', 18, 'SM'],
          ['Roof and building envelope', 10, 'SM'],
          ['Structural inspections', 2, 'SE', [2], 2],
        ],
      },
      {
        name: 'Services & Finishes',
        gate: 'Practical completion',
        tasks: [
          ['First-fix mechanical, electrical and plumbing', 12, 'MEP'],
          ['Internal walls, plaster and flooring', 12, 'SM', []],
          ['Second-fix MEP and fittings', 8, 'MEP', [0, 1]],
          ['Painting, joinery and finishes', 8, 'SM', [1]],
          ['External works and landscaping', 6, 'SM', [], 2],
        ],
      },
      {
        name: 'Commissioning & Handover',
        gate: 'Handover complete',
        tasks: [
          ['Test and commission building systems', 4, 'MEP'],
          ['Snagging inspection and defect rectification', 5, 'SM', []],
          ['Final inspections and occupancy certificate', 3, 'PM', [0, 1]],
          ['Handover manuals, warranties and final account', 2, 'QS', [2]],
        ],
      },
    ],
    risks: [
      ['Permit or planning approval is delayed', 'Regulatory', 4, 4, 'Engage the authority before submission, submit complete documentation and sequence early works that do not need the permit.', 'PM'],
      ['Unforeseen ground conditions increase foundation cost and time', 'Technical', 3, 5, 'Commission a thorough geotechnical survey and hold a ground-risk contingency in the budget.', 'SE'],
      ['Material prices rise or long-lead items arrive late', 'Supply chain', 4, 4, 'Order long-lead items at contract award, fix prices where possible and pre-qualify alternative suppliers.', 'QS'],
      ['Adverse weather stops work on site', 'Environmental', 3, 3, 'Schedule weather-sensitive work in the best season and include weather float in the programme.', 'SM'],
      ['Serious health and safety incident on site', 'Safety', 2, 5, 'Enforce inductions, daily briefings and permit-to-work, and audit subcontractor safety weekly.', 'HSE'],
      ['Design changes during construction cause rework and claims', 'Scope', 3, 4, 'Freeze the design before tender and price every change through a formal variation process.', 'AR'],
    ],
    justification:
      'The facility provides capacity the organisation needs to operate and grow. Delivering it on time and on budget protects the investment case and avoids the cost of temporary alternatives.',
    stakeholders: ['Client / owner', 'Local planning authority', 'Design consultants', 'Main contractor and subcontractors', 'Neighbours and community', 'Future occupants'],
    outOfScope: ['Loose furniture and tenant fit-out', 'Off-site infrastructure upgrades', 'Operation and maintenance after the defects period'],
    success: ['Handover on or before the target date', 'Final account within the approved budget and contingency', 'Zero lost-time safety incidents'],
  },

  research: {
    roles: {
      PI: 'Principal Investigator',
      RA: 'Research Assistant',
      AN: 'Data Analyst',
      SUP: 'Academic Supervisor',
      ED: 'Technical Editor',
    },
    phases: [
      {
        name: 'Proposal & Planning',
        gate: 'Proposal approved',
        tasks: [
          ['Define research question and objectives', 3, 'PI'],
          ['Preliminary literature scan', 4, 'RA'],
          ['Write research proposal', 4, 'PI'],
          ['Ethics application and approval', 6, 'PI', [2], 2],
          ['Supervisor review of proposal', 2, 'SUP', [2]],
        ],
      },
      {
        name: 'Literature Review',
        gate: 'Literature review complete',
        tasks: [
          ['Systematic search and source selection', 5, 'RA'],
          ['Critical review and synthesis', 6, 'PI'],
          ['Identify research gap and refine hypotheses', 2, 'PI'],
        ],
      },
      {
        name: 'Methodology & Instruments',
        gate: 'Methodology approved',
        tasks: [
          ['Design methodology and sampling plan', 3, 'PI'],
          ['Build instruments, surveys or experimental setup', 5, 'RA'],
          ['Pilot study and instrument refinement', 4, 'RA', [1], 2],
          ['Supervisor review of methodology', 1, 'SUP', [0]],
        ],
      },
      {
        name: 'Data Collection',
        gate: 'Data collection complete',
        tasks: [
          ['Recruit participants or prepare datasets', 5, 'RA'],
          ['Run experiments, surveys or fieldwork', 12, 'RA'],
          ['Validate and organise collected data', 3, 'AN'],
        ],
      },
      {
        name: 'Analysis',
        gate: 'Findings validated',
        tasks: [
          ['Clean and code the data', 4, 'AN'],
          ['Statistical or thematic analysis', 6, 'AN'],
          ['Interpret results against hypotheses', 3, 'PI'],
          ['Robustness and sensitivity checks', 3, 'AN', [1], 3],
        ],
      },
      {
        name: 'Writing & Dissemination',
        gate: 'Final report submitted',
        tasks: [
          ['Draft report or thesis chapters', 10, 'PI'],
          ['Figures, tables and references', 3, 'RA', []],
          ['Supervisor review and revisions', 5, 'SUP', [0, 1]],
          ['Proofread and format', 2, 'ED'],
          ['Prepare presentation or defence', 3, 'PI', [2]],
        ],
      },
    ],
    risks: [
      ['Ethics approval takes longer than planned', 'Compliance', 3, 4, 'Submit the ethics application in the first weeks and prepare instruments in parallel.', 'PI'],
      ['Too few participants or poor response rate', 'Data', 4, 4, 'Recruit through several channels, over-sample by 20% and agree a minimum viable sample with the supervisor.', 'RA'],
      ['Results do not support the hypotheses', 'Research', 3, 3, 'Frame research questions so null results are still publishable and pre-register the analysis plan.', 'PI'],
      ['Scope expands beyond what the timeline allows', 'Scope', 4, 3, 'Fix the research questions at proposal approval and park new ideas as future work.', 'PI'],
      ['Data is lost or corrupted', 'Technical', 2, 5, 'Keep versioned backups in two locations and document the data-management plan.', 'AN'],
      ['Supervisor feedback arrives late and compresses writing time', 'Schedule', 3, 3, 'Book review meetings at each gate and share drafts chapter by chapter.', 'SUP'],
    ],
    justification:
      'The study addresses a clearly identified gap in current knowledge. Its findings will inform practice and provide a foundation for further work in the field.',
    stakeholders: ['Academic supervisor', 'Ethics committee', 'Funding body or department', 'Study participants', 'Research community', 'Research team'],
    outOfScope: ['Commercialisation of findings', 'Longitudinal follow-up beyond the study window', 'Topics outside the approved research questions'],
    success: ['All research questions answered with evidence', 'Report submitted on or before the deadline', 'Methodology and data pass supervisor and ethics review'],
  },

  event: {
    roles: {
      EM: 'Event Manager',
      LOG: 'Logistics Coordinator',
      MKT: 'Marketing Lead',
      PRG: 'Programme Manager',
      SP: 'Sponsorship Manager',
      FIN: 'Finance Coordinator',
    },
    phases: [
      {
        name: 'Concept & Budget',
        gate: 'Event concept approved',
        tasks: [
          ['Define event goals, audience and format', 2, 'EM'],
          ['Build budget and revenue model', 3, 'FIN'],
          ['Shortlist dates and venues', 3, 'LOG', [0]],
          ['Confirm concept with stakeholders', 1, 'EM', [1, 2]],
        ],
      },
      {
        name: 'Venue & Suppliers',
        gate: 'Venue and suppliers contracted',
        tasks: [
          ['Site visits and venue contract', 4, 'LOG'],
          ['Catering, AV and staging suppliers', 5, 'LOG'],
          ['Insurance, permits and safety plan', 3, 'EM', [0], 2],
          ['Accommodation and transport blocks', 3, 'LOG', [0], 2],
        ],
      },
      {
        name: 'Programme & Speakers',
        gate: 'Programme published',
        after: [0],
        tasks: [
          ['Design agenda and session formats', 3, 'PRG'],
          ['Invite and confirm speakers', 8, 'PRG'],
          ['Sponsorship packages and outreach', 8, 'SP', [0]],
          ['Brief speakers and collect content', 4, 'PRG', [1]],
        ],
      },
      {
        name: 'Marketing & Registration',
        gate: 'Registration target reached',
        after: [1, 2],
        tasks: [
          ['Event branding and website', 5, 'MKT'],
          ['Open registration and ticketing', 2, 'MKT'],
          ['Email, social and partner promotion', 12, 'MKT'],
          ['Attendee communications and app setup', 4, 'MKT', [1], 2],
        ],
      },
      {
        name: 'Event Delivery',
        gate: 'Event delivered',
        tasks: [
          ['Final run-of-show and staff briefing', 2, 'EM'],
          ['Print, signage and materials', 3, 'LOG', []],
          ['Venue build and technical rehearsal', 2, 'LOG', [0, 1]],
          ['Run the event', 2, 'EM', [2]],
        ],
      },
      {
        name: 'Wrap-up',
        gate: 'Event closed',
        tasks: [
          ['Attendee and sponsor feedback survey', 3, 'MKT'],
          ['Reconcile budget and pay suppliers', 3, 'FIN', []],
          ['Post-event report and learnings', 2, 'EM', [0, 1]],
        ],
      },
    ],
    risks: [
      ['Registrations fall short of the attendance target', 'Commercial', 3, 4, 'Track registrations weekly against a curve, launch early-bird pricing and activate partners if behind.', 'MKT'],
      ['Keynote speaker cancels at short notice', 'Programme', 3, 4, 'Confirm speakers in writing, keep a reserve list and record a backup session.', 'PRG'],
      ['Venue or key supplier fails to deliver', 'Supplier', 2, 5, 'Contract with clear service levels, hold a backup supplier list and inspect the venue a week before.', 'LOG'],
      ['Costs exceed budget as requirements grow', 'Cost', 3, 3, 'Approve every change against the budget, hold a 10% contingency and review spend weekly.', 'FIN'],
      ['AV or connectivity failure during sessions', 'Technical', 3, 4, 'Run a full technical rehearsal and keep spare equipment and an on-site technician.', 'LOG'],
      ['Health, safety or security incident', 'Safety', 2, 5, 'Complete a risk assessment with the venue, brief staff on emergency procedures and arrange first aid cover.', 'EM'],
    ],
    justification:
      'The event brings the target audience together in one place, creating relationships, visibility and revenue that are hard to achieve through other channels.',
    stakeholders: ['Executive host', 'Sponsors and exhibitors', 'Speakers', 'Attendees', 'Venue and suppliers', 'Event team'],
    outOfScope: ['Year-round community programme', 'Travel booking for individual attendees', 'Production of long-form post-event content'],
    success: ['Attendance at or above target', 'Attendee satisfaction of 4.2 / 5 or higher', 'Event delivered within the approved budget'],
  },

  general: {
    roles: {
      PM: 'Project Manager',
      BA: 'Business Analyst',
      SME: 'Subject Matter Expert',
      CL: 'Change Lead',
      OPS: 'Operations Lead',
      FIN: 'Finance Analyst',
    },
    phases: [
      {
        name: 'Initiation',
        gate: 'Project charter approved',
        tasks: [
          ['Define objectives, scope and success criteria', 2, 'PM'],
          ['Stakeholder analysis and governance setup', 2, 'PM'],
          ['Business case and budget approval', 3, 'FIN', [0]],
          ['Kickoff meeting', 1, 'PM', [1, 2]],
        ],
      },
      {
        name: 'Analysis',
        gate: 'Requirements signed off',
        tasks: [
          ['Map current processes and pain points', 4, 'BA'],
          ['Gather and prioritise requirements', 4, 'BA'],
          ['Benchmark options and best practice', 3, 'SME', [0], 2],
          ['Requirements review workshop', 1, 'PM', [1, 2]],
        ],
      },
      {
        name: 'Solution Design',
        gate: 'Solution design approved',
        tasks: [
          ['Design future-state process and solution', 5, 'SME'],
          ['Assess impact on people, systems and policy', 3, 'CL', []],
          ['Detailed implementation plan', 2, 'PM', [0, 1]],
          ['Vendor or tool selection', 4, 'OPS', [0], 3],
        ],
      },
      {
        name: 'Implementation',
        gate: 'Solution ready for rollout',
        tasks: [
          ['Build or configure the solution', 10, 'OPS'],
          ['Prepare procedures and training materials', 4, 'CL', []],
          ['Pilot with a small group', 5, 'OPS', [0, 1]],
          ['Refine based on pilot feedback', 3, 'SME'],
        ],
      },
      {
        name: 'Rollout & Change',
        gate: 'Rollout complete',
        tasks: [
          ['Communicate changes to all affected teams', 2, 'CL'],
          ['Train end users', 4, 'CL'],
          ['Go live across the organisation', 2, 'OPS', [1]],
          ['Hypercare support', 5, 'OPS', [2], 2],
        ],
      },
      {
        name: 'Closure',
        gate: 'Project closed',
        tasks: [
          ['Measure benefits against the business case', 3, 'FIN'],
          ['Hand over to business-as-usual owners', 2, 'OPS', []],
          ['Lessons learned and closure report', 1, 'PM', [0, 1]],
        ],
      },
    ],
    risks: [
      ['Stakeholders disagree on priorities, slowing decisions', 'Stakeholder', 3, 4, 'Agree a decision-making forum at kickoff and escalate unresolved items within five working days.', 'PM'],
      ['Scope grows without matching time or budget', 'Scope', 4, 4, 'Baseline the scope at sign-off and assess every change for schedule and cost impact before approval.', 'PM'],
      ['Staff resist the new way of working', 'Change', 3, 4, 'Involve team representatives in design, communicate the benefits early and support managers through rollout.', 'CL'],
      ['Key people are pulled onto business-as-usual work', 'Resource', 4, 3, 'Agree time commitments with line managers in writing and review availability every two weeks.', 'PM'],
      ['Expected benefits are not realised after rollout', 'Benefit', 3, 4, 'Define measurable benefits with an owner for each and track them for three months after go-live.', 'FIN'],
      ['Supplier or tool does not meet requirements', 'Supplier', 2, 4, 'Validate the shortlisted option in a pilot against must-have requirements before committing.', 'OPS'],
    ],
    justification:
      'The initiative addresses a recognised gap in how the organisation operates. Closing it improves efficiency, reduces risk and frees people for higher-value work.',
    stakeholders: ['Executive sponsor', 'Department heads', 'Affected staff', 'Finance', 'IT and operations', 'Project team'],
    outOfScope: ['Organisational restructuring', 'Changes to unrelated processes or systems', 'Benefits tracking beyond the first quarter after closure'],
    success: ['Solution adopted by all target teams', 'Benefits in the business case on track at closure', 'Delivered within the approved time and budget tolerances'],
  },
}
