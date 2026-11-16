import type { Project } from '../types'
import { RISK_STATUS_LABEL, STATUS_LABEL } from '../types'
import { fmtLong, fmtShort, relativeDay } from './dates'
import { fmtMoney, slug } from './format'
import { buildReport } from './report'

/**
 * The PDF uses jsPDF's built-in Helvetica, which only covers Latin-1. Typographic characters
 * are swapped for plain equivalents so nothing renders as a blank or a wrong glyph.
 */
function ascii(text: string): string {
  return text
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, 'x')
    .replace(/→/g, '->')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '?')
}

const BRAND: [number, number, number] = [98, 56, 245]
const INK: [number, number, number] = [19, 26, 46]
const MUTED: [number, number, number] = [99, 109, 136]
const LINE: [number, number, number] = [227, 230, 239]

/** Build the executive status report as a real, text-based A4 PDF and download it. */
export async function exportReportPdf(project: Project): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const r = buildReport(project)
  const a = r.a

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 42
  const W = pageW - M * 2
  let y = M

  const ensure = (space: number) => {
    if (y + space > pageH - 56) {
      doc.addPage()
      y = M
    }
  }
  const paragraph = (text: string, size = 10, color = INK, gap = 6, indent = 0) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines: string[] = doc.splitTextToSize(ascii(text), W - indent)
    const lh = size * 1.4
    for (const ln of lines) {
      ensure(lh)
      doc.text(ln, M + indent, y + size * 0.8)
      y += lh
    }
    y += gap
  }
  const heading = (text: string) => {
    ensure(64)
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(...INK)
    doc.text(ascii(text), M, y + 10)
    y += 20
  }
  const table = (head: string[], body: (string | number)[][], columnStyles: Record<number, { cellWidth?: number | 'auto' | 'wrap'; halign?: 'left' | 'right' | 'center' }> = {}) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 56 },
      head: [head.map(ascii)],
      body: body.map((row) => row.map((c) => ascii(String(c)))),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4.5, textColor: INK, lineColor: LINE, lineWidth: 0.5, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', lineColor: BRAND },
      alternateRowStyles: { fillColor: [247, 248, 252] },
      columnStyles,
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // Title block
  doc.setFillColor(...BRAND)
  doc.rect(M, y, 28, 4, 'F')
  y += 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...INK)
  for (const ln of doc.splitTextToSize(ascii(project.name), W) as string[]) {
    doc.text(ln, M, y + 14)
    y += 23
  }
  y += 2
  paragraph(`Status report, ${fmtLong(r.today)}. Overall health: ${a.health.label} (${a.health.score}/100).`, 10, MUTED, 10)

  heading('Project summary')
  paragraph(r.summary)
  if (project.description) paragraph(project.description, 9.5, MUTED)

  heading('Key figures')
  const variance = a.varianceDays > 0 ? `${a.varianceDays} working days behind plan` : a.varianceDays < 0 ? `${-a.varianceDays} working days ahead of plan` : 'On plan'
  const slip = a.slipDays > 0 ? `${a.slipDays} working days after target` : a.slipDays < 0 ? `${-a.slipDays} working days before target` : 'on target'
  table(
    ['Measure', 'Value', 'Detail'],
    [
      ['Completion', `${a.percent}%`, `${a.planned}% planned by today; ${a.counts.done} of ${a.leaves.length} tasks completed`],
      ['Schedule performance index', a.spi.toFixed(2), a.spi >= 1 ? 'On or ahead of plan (1.00 = exactly on plan)' : 'Behind plan (1.00 = exactly on plan)'],
      ['Schedule variance', variance, `${a.overdue.length} overdue ${a.overdue.length === 1 ? 'task' : 'tasks'}`],
      ['Planned finish', fmtLong(a.end), `Target ${fmtLong(project.targetEnd)}`],
      ['Forecast finish', fmtLong(a.forecastEnd), slip],
      ['Budget', project.budget != null ? `${fmtMoney(project.spent)} of ${fmtMoney(project.budget)}` : 'Not set', project.budget != null ? `${Math.round((project.spent / project.budget) * 100)}% of budget spent` : 'No budget has been set for this project'],
      ['Open risks', String(r.openRisks), `${project.risks.filter((x) => x.status !== 'closed' && x.probability * x.impact >= 10).length} rated high or critical`],
    ],
    { 0: { cellWidth: 150 }, 1: { cellWidth: 150 } },
  )

  heading('Schedule performance by phase')
  table(
    ['WBS', 'Phase', 'Start', 'End', 'Days', 'Progress', 'Status'],
    r.phases.map((ph) => [ph.code, ph.task.name, fmtShort(ph.start), fmtShort(ph.end), ph.duration, `${ph.progress}%`, ph.overdue ? `${STATUS_LABEL[ph.status]} (overdue)` : STATUS_LABEL[ph.status]]),
    { 0: { cellWidth: 36 }, 4: { halign: 'right', cellWidth: 36 }, 5: { halign: 'right', cellWidth: 54 } },
  )

  heading('Budget overview')
  if (r.budget) {
    const b = r.budget
    table(
      ['Measure', 'Amount', 'Meaning'],
      [
        ['Budget at completion (BAC)', fmtMoney(b.bac), 'Approved total budget'],
        ['Planned value (PV)', fmtMoney(b.pv), `Budget for the ${a.planned}% of work scheduled by today`],
        ['Earned value (EV)', fmtMoney(b.ev), `Budget for the ${a.percent}% of work actually completed`],
        ['Actual cost (AC)', fmtMoney(b.ac), 'Spent to date'],
        ['Cost performance index (CPI)', b.cpi == null ? 'n/a' : b.cpi.toFixed(2), b.cpi == null ? 'Nothing spent yet' : b.cpi >= 1 ? 'On or under budget for the work done' : 'Over budget for the work done'],
        ['Estimate at completion (EAC)', fmtMoney(b.eac), 'Expected total cost if cost efficiency stays the same'],
        ['Variance at completion', `${b.variance < 0 ? '-' : ''}${fmtMoney(Math.abs(b.variance))}`, b.variance < 0 ? 'Forecast overrun' : 'Forecast to finish within budget'],
      ],
      { 0: { cellWidth: 170 }, 1: { cellWidth: 100, halign: 'right' } },
    )
  } else {
    paragraph('No budget has been set for this project, so cost performance cannot be reported. Add a budget under Settings to enable this section.', 10, MUTED)
  }

  heading('Major milestones')
  if (r.milestones.length) {
    table(
      ['WBS', 'Milestone', 'Date', 'Status', 'Timing'],
      r.milestones.map((m) => [m.code, m.task.name, fmtLong(m.end), m.status === 'done' ? 'Reached' : m.overdue ? 'Overdue' : 'Upcoming', m.status === 'done' ? '' : relativeDay(m.end, r.today)]),
      { 0: { cellWidth: 36 }, 2: { cellWidth: 86 }, 3: { cellWidth: 64 }, 4: { cellWidth: 84 } },
    )
  } else paragraph('No milestones are defined for this project.', 10, MUTED)

  heading('Project risks')
  if (r.risks.length) {
    table(
      ['ID', 'Risk', 'Score', 'Severity', 'Owner', 'Status', 'Mitigation'],
      r.risks.map((x) => [x.risk.code, x.risk.description, `${x.score} (${x.risk.probability} x ${x.risk.impact})`, x.severity, x.owner, RISK_STATUS_LABEL[x.risk.status], x.risk.mitigation || 'None recorded']),
      { 0: { cellWidth: 34 }, 2: { cellWidth: 50 }, 3: { cellWidth: 46 }, 4: { cellWidth: 66 }, 5: { cellWidth: 52 } },
    )
    paragraph(`Showing the ${r.risks.length} highest-scoring of ${r.openRisks} open risks. Risk score = probability x impact, each rated 1 to 5.`, 8.5, MUTED)
  } else paragraph('There are no open risks in the register.', 10, MUTED)

  heading('Recommended actions')
  if (r.actions.length) {
    r.actions.forEach((act, i) => {
      ensure(40)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...INK)
      const titleLines: string[] = doc.splitTextToSize(ascii(`${i + 1}. ${act.title}`), W)
      for (const ln of titleLines) {
        ensure(14)
        doc.text(ln, M, y + 8)
        y += 14
      }
      paragraph(act.detail, 9.5, MUTED, 8, 13)
    })
  } else paragraph('No actions are outstanding.', 10, MUTED)

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.5)
    doc.line(M, pageH - 38, pageW - M, pageH - 38)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(ascii(`ProjectPilot AI status report - ${project.name}`).slice(0, 96), M, pageH - 24)
    doc.text(`Page ${i} of ${pages}`, pageW - M, pageH - 24, { align: 'right' })
  }

  doc.save(`${slug(project.name)}-status-report.pdf`)
}
