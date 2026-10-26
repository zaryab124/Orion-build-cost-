/**
 * Orion Build Cost - BOQ Export Module
 * Generates verified CSV and Excel (.xlsx) deliverables using exceljs
 * Reuses the central estimating engine calculation results.
 */

const ExcelJS = require('exceljs');
const { round2, formatGBP } = require('./estimating-engine.js');

/**
 * Generate RFC 4180 compliant CSV string from estimate output
 */
function generateBOQ_CSV(estimate) {
  if (!estimate || !Array.isArray(estimate.items)) {
    throw new Error('Invalid estimate object provided to generateBOQ_CSV');
  }

  const rows = [];

  // Header metadata block
  rows.push(['"ORION BUILD COST - BILL OF QUANTITIES"']);
  rows.push([`"Project Type"`, `"${estimate.metadata.projectTypeLabel || ''}"`]);
  rows.push([`"Location"`, `"${estimate.metadata.ukCountryLabel || ''}"`]);
  rows.push([`"Gross Internal Area"`, `"${estimate.metadata.floorArea || 0} m²"`]);
  rows.push([`"Specification Tier"`, `"${estimate.metadata.finishCategoryLabel || ''}"`]);
  rows.push([`"Document Reference"`, `"OBC-BOQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}"`]);
  rows.push([`"Date Prepared"`, `"${new Date().toLocaleDateString('en-GB')}"`]);
  rows.push([`"Status"`, `"Illustrative Sample — Not a Client Project"`]);
  rows.push([]);

  // Table Column Headers
  rows.push([
    '"Work Section / Category"',
    '"Item No"',
    '"Description"',
    '"Unit"',
    '"Quantity"',
    '"Unit Rate (£)"',
    '"Total Amount (£)"'
  ]);

  // Line items
  estimate.items.forEach(item => {
    const desc = (item.description || '').replace(/"/g, '""');
    rows.push([
      `"${item.category || ''}"`,
      `"${item.itemNo || ''}"`,
      `"${desc}"`,
      `"${item.unit || ''}"`,
      round2(item.quantity),
      round2(item.unitRate).toFixed(2),
      round2(item.total).toFixed(2)
    ]);
  });

  // Summary Financials
  rows.push([]);
  rows.push(['"SUMMARY OF COSTS"']);
  rows.push(['"Subtotal (Works & Plant)"', '""', '""', '""', '""', '""', round2(estimate.financials.subtotal).toFixed(2)]);
  rows.push([`"Contingency Allowance (${estimate.financials.contingencyPercentage}%)"`, '""', '""', '""', '""', '""', round2(estimate.financials.contingencyAmount).toFixed(2)]);
  rows.push(['"Net Construction Total"', '""', '""', '""', '""', '""', round2(estimate.financials.netTotal).toFixed(2)]);
  rows.push([`"VAT (${estimate.financials.vatPercentage}% - ${estimate.financials.vatTreatmentLabel})"`, '""', '""', '""', '""', '""', round2(estimate.financials.vatAmount).toFixed(2)]);
  rows.push(['"GRAND TOTAL (Inc. VAT)"', '""', '""', '""', '""', '""', round2(estimate.financials.grandTotal).toFixed(2)]);
  rows.push([]);
  rows.push([`"Disclaimer: ${estimate.metadata.disclaimer.replace(/"/g, '""')}"`]);

  return rows.map(r => r.join(',')).join('\r\n');
}

/**
 * Generate Excel (.xlsx) Buffer from estimate output
 */
async function generateBOQ_Excel(estimate) {
  if (!estimate || !Array.isArray(estimate.items)) {
    throw new Error('Invalid estimate object provided to generateBOQ_Excel');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Orion Build Cost Ltd';
  workbook.lastModifiedBy = 'Orion Estimating Engine';
  workbook.created = new Date();
  workbook.modified = new Date();

  // -------------------------------------------------------------
  // Sheet 1: Project Summary & Financials
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('Summary & Financials', {
    pageSetup: { paperSize: 9, orientation: 'portrait' } // A4
  });

  summarySheet.columns = [
    { header: '', key: 'metric', width: 34 },
    { header: '', key: 'value', width: 45 }
  ];

  // Brand Header
  summarySheet.addRow(['ORION BUILD COST — QUANTITY SURVEYING & ESTIMATION', '']);
  summarySheet.addRow(['Official Project Cost Summary & Schedule', '']);
  summarySheet.addRow(['Status: Illustrative Sample — Not a Client Project', '']);
  summarySheet.addRow([]);

  // Project Info
  summarySheet.addRow(['Project Type:', estimate.metadata.projectTypeLabel || 'Standard Construction']);
  summarySheet.addRow(['UK Country / Jurisdiction:', estimate.metadata.ukCountryLabel || 'England']);
  summarySheet.addRow(['Gross Internal Area (GIA):', `${estimate.metadata.floorArea} m²`]);
  summarySheet.addRow(['Storeys:', estimate.metadata.storeys]);
  summarySheet.addRow(['Specification Standard:', estimate.metadata.finishCategoryLabel || 'Developer Spec']);
  summarySheet.addRow(['Preparation Date:', new Date().toLocaleDateString('en-GB')]);
  summarySheet.addRow(['Document Reference:', `OBC-BOQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`]);
  summarySheet.addRow([]);

  // Financial Breakdown
  summarySheet.addRow(['FINANCIAL SUMMARY', 'AMOUNT (GBP)']);
  const subtotalRow = summarySheet.addRow(['Works Subtotal:', round2(estimate.financials.subtotal)]);
  const contingencyRow = summarySheet.addRow([`Contingency Allowance (${estimate.financials.contingencyPercentage}%):`, round2(estimate.financials.contingencyAmount)]);
  const netRow = summarySheet.addRow(['Net Construction Total:', round2(estimate.financials.netTotal)]);
  const vatRow = summarySheet.addRow([`VAT (${estimate.financials.vatPercentage}% - ${estimate.financials.vatTreatmentLabel}):`, round2(estimate.financials.vatAmount)]);
  const grandTotalRow = summarySheet.addRow(['GRAND TOTAL (Inc. VAT):', round2(estimate.financials.grandTotal)]);

  // Format currency cells
  [subtotalRow, contingencyRow, netRow, vatRow, grandTotalRow].forEach(row => {
    row.getCell(2).numFmt = '£#,##0.00';
    row.getCell(2).alignment = { horizontal: 'right' };
  });

  // Highlight Grand Total Row
  grandTotalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  grandTotalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0B2545' } // Navy
  };

  summarySheet.addRow([]);
  summarySheet.addRow(['Unit Rate Benchmarking', '']);
  const rateRow = summarySheet.addRow(['Net Cost / m² (Ex. VAT):', round2(estimate.financials.netCostPerM2)]);
  const grossRateRow = summarySheet.addRow(['Gross Cost / m² (Inc. VAT):', round2(estimate.financials.costPerM2)]);
  rateRow.getCell(2).numFmt = '£#,##0.00';
  grossRateRow.getCell(2).numFmt = '£#,##0.00';

  summarySheet.addRow([]);
  summarySheet.addRow(['Statutory Disclaimer:', estimate.metadata.disclaimer]);

  // Style Header block
  summarySheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF0B2545' } };
  summarySheet.getRow(10).font = { bold: true, color: { argb: 'FF134074' } };

  // -------------------------------------------------------------
  // Sheet 2: Itemised Bill of Quantities
  // -------------------------------------------------------------
  const boqSheet = workbook.addWorksheet('Bill of Quantities (BOQ)', {
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  boqSheet.columns = [
    { header: 'Work Section', key: 'category', width: 24 },
    { header: 'Item No', key: 'itemNo', width: 10 },
    { header: 'Description of Works', key: 'description', width: 55 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Qty', key: 'quantity', width: 12 },
    { header: 'Unit Rate (£)', key: 'unitRate', width: 16 },
    { header: 'Total (£)', key: 'total', width: 18 }
  ];

  // Header row styling
  const headerRow = boqSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0B2545' } // Navy
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Populate line items
  estimate.items.forEach(item => {
    const row = boqSheet.addRow({
      category: item.category,
      itemNo: item.itemNo,
      description: item.description,
      unit: item.unit,
      quantity: round2(item.quantity),
      unitRate: round2(item.unitRate),
      total: round2(item.total)
    });

    row.getCell('quantity').numFmt = '#,##0.00';
    row.getCell('unitRate').numFmt = '£#,##0.00';
    row.getCell('total').numFmt = '£#,##0.00';
    row.getCell('unit').alignment = { horizontal: 'center' };
    row.getCell('itemNo').alignment = { horizontal: 'center' };
  });

  // Footer totals row in BOQ sheet
  boqSheet.addRow([]);
  const boqSubRow = boqSheet.addRow(['', '', 'SUBTOTAL (WORKS & PLANT):', '', '', '', round2(estimate.financials.subtotal)]);
  const boqContRow = boqSheet.addRow(['', '', `CONTINGENCY (${estimate.financials.contingencyPercentage}%):`, '', '', '', round2(estimate.financials.contingencyAmount)]);
  const boqVatRow = boqSheet.addRow(['', '', `VAT (${estimate.financials.vatPercentage}%):`, '', '', '', round2(estimate.financials.vatAmount)]);
  const boqTotalRow = boqSheet.addRow(['', '', 'FINAL GRAND TOTAL (INC. VAT):', '', '', '', round2(estimate.financials.grandTotal)]);

  [boqSubRow, boqContRow, boqVatRow, boqTotalRow].forEach(r => {
    r.font = { bold: true };
    r.getCell(7).numFmt = '£#,##0.00';
  });
  boqTotalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3E5AB' } // Soft gold
  };

  // -------------------------------------------------------------
  // Sheet 3: Category Breakdown
  // -------------------------------------------------------------
  const catSheet = workbook.addWorksheet('Trade Breakdown', {
    pageSetup: { paperSize: 9, orientation: 'portrait' }
  });

  catSheet.columns = [
    { header: 'Work Section / Trade Package', key: 'trade', width: 35 },
    { header: 'Subtotal Amount (£)', key: 'amount', width: 22 },
    { header: '% of Works Subtotal', key: 'pct', width: 22 }
  ];

  catSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  catSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF134074' }
  };

  Object.entries(estimate.categoryTotals).forEach(([cat, amount]) => {
    const pct = estimate.financials.subtotal > 0 ? (amount / estimate.financials.subtotal) : 0;
    const r = catSheet.addRow({
      trade: cat,
      amount: round2(amount),
      pct: round2(pct * 100) / 100
    });
    r.getCell('amount').numFmt = '£#,##0.00';
    r.getCell('pct').numFmt = '0.0%';
  });

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateBOQ_CSV,
  generateBOQ_Excel
};
