/**
 * ⏱️🦀 Clawck — PDF Report Generation
 * Generates timesheet PDF reports using pdfkit.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import { TimesheetSummary, ReportStyle } from '../core/types';

export interface PDFReportOptions {
  title?: string;
  clientName?: string;
  dateRange: string;
  outputPath: string;
  style?: ReportStyle;
}

export function generateTimesheetPDF(
  summary: TimesheetSummary,
  options: PDFReportOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(options.outputPath);

    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    const pageWidth = doc.page.width - 100; // margins
    const style: ReportStyle = options.style || 'full';
    const showSummary = style !== 'table';
    const showBreakdowns = style === 'full' || style === 'visual' || style === 'calendar' || style === 'text';
    const showEntryDetails = style === 'full' || style === 'table' || style === 'visual' || style === 'calendar' || style === 'text';

    // ─── Header ──────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold')
      .text(options.title || 'Clawck Timesheet Report', { align: 'center' });
    doc.moveDown(0.3);

    if (options.clientName) {
      doc.fontSize(14).font('Helvetica')
        .text(`Client: ${options.clientName}`, { align: 'center' });
    }

    doc.fontSize(11).font('Helvetica')
      .text(`Period: ${options.dateRange}`, { align: 'center' });
    doc.moveDown(1);

    drawHorizontalLine(doc, pageWidth);
    doc.moveDown(0.5);

    // ─── Summary Stats ──────────────────────────────────
    if (showSummary) {
    doc.fontSize(14).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');

    const totalRuntimeMin = summary.entries.reduce((s, e) => s + e.duration_minutes, 0);
    const stats = [
      ['Total Runtime', `${(totalRuntimeMin / 60).toFixed(2)} hrs`],
      ['Merged Runtime', `${summary.total_agent_merged_runtime_hours.toFixed(2)} hrs${summary.total_agent_merged_runtime_hours > 0 && summary.total_agent_merged_runtime_hours < summary.total_agent_hours ? ` (${(summary.total_agent_hours / summary.total_agent_merged_runtime_hours).toFixed(1)}x parallelization)` : ''}`],
      ['Human Equiv Hours', `${summary.total_human_equiv_hours.toFixed(2)} hrs`],
      ['Agent Cost', `$${summary.total_cost_usd.toFixed(2)}`],
      ['Est. Savings', `$${summary.total_savings_usd.toFixed(0)}`],
      ['Time Saved', `${summary.total_time_saved_hours.toFixed(1)} hrs`],
      ['Total Entries', String(summary.total_entries)],
      ['Total Tokens', `${summary.total_tokens.toLocaleString()} (${summary.total_tokens_in.toLocaleString()} in / ${summary.total_tokens_out.toLocaleString()} out)`],
    ];

    for (const [label, value] of stats) {
      doc.text(`${label}: ${value}`);
    }
    doc.moveDown(1);
    }

    // ─── By Project ─────────────────────────────────────
    if (showBreakdowns && summary.by_project.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('By Project');
      doc.moveDown(0.3);

      const projHeaders = ['Project', 'Client', 'Agent Hrs', 'Human Equiv', 'Cost'];
      const projWidths = [pageWidth * 0.25, pageWidth * 0.2, pageWidth * 0.18, pageWidth * 0.2, pageWidth * 0.17];
      drawTableHeader(doc, projHeaders, projWidths);

      for (const p of summary.by_project) {
        drawTableRow(doc, [
          p.project, p.client,
          p.agent_hours.toFixed(2), p.human_equiv_hours.toFixed(2),
          `$${p.cost_usd.toFixed(2)}`,
        ], projWidths);
      }
      doc.moveDown(1);
    }

    // ─── By Agent ───────────────────────────────────────
    if (showBreakdowns && summary.by_agent.length > 0) {
      checkPageBreak(doc);
      doc.fontSize(14).font('Helvetica-Bold').text('By Agent');
      doc.moveDown(0.3);

      const agentHeaders = ['Agent', 'Model', 'Hours', 'Success Rate'];
      const agentWidths = [pageWidth * 0.3, pageWidth * 0.3, pageWidth * 0.2, pageWidth * 0.2];
      drawTableHeader(doc, agentHeaders, agentWidths);

      for (const a of summary.by_agent) {
        drawTableRow(doc, [
          a.agent, a.model,
          a.agent_hours.toFixed(2), `${a.success_rate}%`,
        ], agentWidths);
      }
      doc.moveDown(1);
    }

    // ─── By Category ────────────────────────────────────
    if (showBreakdowns && summary.by_category.length > 0) {
      checkPageBreak(doc);
      doc.fontSize(14).font('Helvetica-Bold').text('By Category');
      doc.moveDown(0.3);

      const catHeaders = ['Category', 'Agent Hrs', 'Human Equiv', 'Cost', 'Savings'];
      const catWidths = [pageWidth * 0.25, pageWidth * 0.18, pageWidth * 0.2, pageWidth * 0.17, pageWidth * 0.2];
      drawTableHeader(doc, catHeaders, catWidths);

      for (const c of summary.by_category) {
        drawTableRow(doc, [
          c.category, c.agent_hours.toFixed(2),
          c.human_equiv_hours.toFixed(2),
          `$${c.cost_usd.toFixed(2)}`, `$${c.savings_usd.toFixed(0)}`,
        ], catWidths);
      }
      doc.moveDown(1);
    }

    // ─── Entry Details ─────────────────────────────────────
    if (showEntryDetails && summary.entries.length > 0) {
      checkPageBreak(doc);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text('Entry Details');
      doc.moveDown(0.3);

      const detailHeaders = ['Date', 'Agent', 'Project', 'Task', 'Duration', 'Status', 'Approved'];
      const detailWidths = [pageWidth * 0.13, pageWidth * 0.15, pageWidth * 0.14, pageWidth * 0.28, pageWidth * 0.1, pageWidth * 0.1, pageWidth * 0.1];
      drawTableHeader(doc, detailHeaders, detailWidths);

      const maxRows = Math.min(summary.entries.length, 100);
      for (let i = 0; i < maxRows; i++) {
        checkPageBreak(doc);
        const e = summary.entries[i];
        const taskTrunc = e.task.length > 25 ? e.task.slice(0, 22) + '...' : e.task;
        const durStr = e.duration_minutes < 60
          ? `${Math.round(e.duration_minutes)}m`
          : `${Math.floor(e.duration_minutes / 60)}h ${Math.round(e.duration_minutes % 60)}m`;
        drawTableRow(doc, [
          e.date, e.agent, e.project, taskTrunc, durStr, e.status, e.approved ? 'Yes' : '-',
        ], detailWidths);
      }
      if (summary.entries.length > 100) {
        doc.moveDown(0.3);
        doc.fontSize(8).font('Helvetica').fillColor('#888888')
          .text(`Showing 100 of ${summary.entries.length} entries. Use HTML report for full data.`);
      }
      doc.moveDown(1);
    }

    // ─── Footer ─────────────────────────────────────────
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#888888')
      .text(`Generated by Clawck on ${new Date().toISOString()}`, { align: 'center' });

    doc.end();
  });
}

function drawHorizontalLine(doc: PDFKit.PDFDocument, width: number): void {
  const x = doc.x;
  const y = doc.y;
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor('#cccccc').stroke();
}

function drawTableHeader(doc: PDFKit.PDFDocument, headers: string[], widths: number[]): void {
  const startX = doc.x;
  const y = doc.y;

  doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x, y, { width: widths[i], continued: false });
    x += widths[i];
  }
  doc.moveDown(0.2);

  const lineY = doc.y;
  doc.moveTo(startX, lineY).lineTo(startX + widths.reduce((a, b) => a + b, 0), lineY)
    .strokeColor('#999999').stroke();
  doc.moveDown(0.2);
}

function drawTableRow(doc: PDFKit.PDFDocument, cells: string[], widths: number[]): void {
  const startX = doc.x;
  const y = doc.y;

  doc.fontSize(9).font('Helvetica').fillColor('#000000');
  let x = startX;
  for (let i = 0; i < cells.length; i++) {
    doc.text(cells[i], x, y, { width: widths[i], continued: false });
    x += widths[i];
  }
  doc.moveDown(0.1);
}

function checkPageBreak(doc: PDFKit.PDFDocument): void {
  if (doc.y > doc.page.height - 150) {
    doc.addPage();
  }
}

// ─── Invoice PDF Generation ─────────────────────────────────

export interface InvoicePDFOptions {
  clientName: string;
  dateRange: string;
  outputPath: string;
  rate?: number;  // Hourly rate in USD
  logo?: string;  // Path to logo image
  footer?: string;
  invoiceNumber?: string;
  terms?: string;
}

export function generateInvoicePDF(
  summary: TimesheetSummary,
  options: InvoicePDFOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(options.outputPath);

    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    const pageWidth = doc.page.width - 100; // margins
    const hasRate = options.rate !== undefined && options.rate > 0;

    // Generate invoice number from date + client if not provided
    const invoiceNumber = options.invoiceNumber ||
      `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${options.clientName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)}`;

    // ─── Logo (if provided) ──────────────────────────────
    if (options.logo && fs.existsSync(options.logo)) {
      try {
        doc.image(options.logo, 50, 50, { width: 100 });
        doc.moveDown(4);
      } catch {
        // Skip logo if it fails to load
      }
    }

    // ─── Header ──────────────────────────────────────────
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#000000')
      .text('INVOICE', { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Invoice #: ${invoiceNumber}`, { align: 'right' });
    doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, { align: 'right' });
    doc.moveDown(1);

    // ─── Client Info ──────────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
      .text('Bill To:');
    doc.fontSize(12).font('Helvetica')
      .text(options.clientName);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666666')
      .text(`Period: ${options.dateRange}`);
    doc.moveDown(1.5);

    drawHorizontalLine(doc, pageWidth);
    doc.moveDown(1);

    // ─── Line Items Table ──────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text('Services');
    doc.moveDown(0.5);

    if (hasRate) {
      // With rate: Date, Description, Duration, Rate, Amount
      const headers = ['Date', 'Description', 'Duration', 'Rate', 'Amount'];
      const widths = [pageWidth * 0.15, pageWidth * 0.35, pageWidth * 0.15, pageWidth * 0.15, pageWidth * 0.2];
      drawTableHeader(doc, headers, widths);

      for (const entry of summary.entries) {
        checkPageBreak(doc);
        const durationHours = entry.duration_minutes / 60;
        const amount = durationHours * options.rate!;
        const taskTrunc = entry.task.length > 35 ? entry.task.slice(0, 32) + '...' : entry.task;
        const durStr = durationHours < 1
          ? `${Math.round(entry.duration_minutes)}m`
          : `${durationHours.toFixed(2)}h`;
        drawTableRow(doc, [
          entry.date,
          taskTrunc,
          durStr,
          `$${options.rate!.toFixed(2)}/hr`,
          `$${amount.toFixed(2)}`,
        ], widths);
      }
    } else {
      // Without rate: Date, Description, Duration (hours only)
      const headers = ['Date', 'Description', 'Duration'];
      const widths = [pageWidth * 0.2, pageWidth * 0.55, pageWidth * 0.25];
      drawTableHeader(doc, headers, widths);

      for (const entry of summary.entries) {
        checkPageBreak(doc);
        const durationHours = entry.duration_minutes / 60;
        const taskTrunc = entry.task.length > 55 ? entry.task.slice(0, 52) + '...' : entry.task;
        const durStr = durationHours < 1
          ? `${Math.round(entry.duration_minutes)} min`
          : `${durationHours.toFixed(2)} hrs`;
        drawTableRow(doc, [
          entry.date,
          taskTrunc,
          durStr,
        ], widths);
      }
    }
    doc.moveDown(1);

    // ─── Subtotals by Project ────────────────────────────────
    if (summary.by_project.length > 1) {
      checkPageBreak(doc);
      drawHorizontalLine(doc, pageWidth);
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('Subtotals by Project');
      doc.moveDown(0.3);

      for (const proj of summary.by_project) {
        const projHours = proj.agent_hours;
        if (hasRate) {
          const projAmount = projHours * options.rate!;
          doc.fontSize(10).font('Helvetica')
            .text(`${proj.project}: ${projHours.toFixed(2)} hrs × $${options.rate!.toFixed(2)} = $${projAmount.toFixed(2)}`);
        } else {
          doc.fontSize(10).font('Helvetica')
            .text(`${proj.project}: ${projHours.toFixed(2)} hrs`);
        }
      }
      doc.moveDown(1);
    }

    // ─── Grand Total ──────────────────────────────────────
    checkPageBreak(doc);
    drawHorizontalLine(doc, pageWidth);
    doc.moveDown(0.5);

    const totalHours = summary.total_agent_hours;

    if (hasRate) {
      const grandTotal = totalHours * options.rate!;
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
        .text(`Total Hours: ${totalHours.toFixed(2)} hrs`, { align: 'right' });
      doc.fontSize(18).font('Helvetica-Bold')
        .text(`TOTAL: $${grandTotal.toFixed(2)}`, { align: 'right' });
    } else {
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000')
        .text(`Total Hours: ${totalHours.toFixed(2)} hrs`, { align: 'right' });
    }
    doc.moveDown(1.5);

    // ─── Terms ─────────────────────────────────────────────
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Terms: ${options.terms || 'Due on receipt'}`, { align: 'left' });
    doc.moveDown(2);

    // ─── Footer ─────────────────────────────────────────────
    const footer = options.footer || 'Generated by Clawck';
    doc.fontSize(8).font('Helvetica').fillColor('#888888')
      .text(footer, { align: 'center' });
    doc.text(`Invoice generated on ${new Date().toISOString()}`, { align: 'center' });

    doc.end();
  });
}
