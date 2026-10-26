const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { calculateEstimate } = require('../estimating-engine.js');
const { generateBOQ_CSV, generateBOQ_Excel } = require('../boq-export.js');

describe('Orion BOQ Export Module Tests', () => {

  const sampleEstimate = calculateEstimate({
    projectType: 'extension',
    floorArea: 75,
    contingencyRate: 0.08,
    vatTreatment: 'standard-20',
    lineItems: [
      { id: '1', category: 'Groundworks', itemNo: '1.1', description: 'Excavate trench foundations', unit: 'm³', quantity: 25, unitRate: 85 }, // 2125
      { id: '2', category: 'Structural Work', itemNo: '2.1', description: 'Structural steel universal beams', unit: 'tonne', quantity: 1.2, unitRate: 2800 }, // 3360
      { id: '3', category: 'Finishes', itemNo: '3.1', description: 'Internal plasterboard & skim', unit: 'm²', quantity: 180, unitRate: 36 } // 6480
    ]
  });

  test('generateBOQ_CSV produces well-formed CSV with identical totals', () => {
    const csv = generateBOQ_CSV(sampleEstimate);
    assert.ok(typeof csv === 'string');
    assert.ok(csv.includes('ORION BUILD COST - BILL OF QUANTITIES'));
    assert.ok(csv.includes('Excavate trench foundations'));
    assert.ok(csv.includes('Structural steel universal beams'));

    // Check financial reconciliation in CSV:
    // Subtotal = 2125 + 3360 + 6480 = 11965
    assert.ok(csv.includes('11965.00'));
    // Contingency = 8% of 11965 = 957.20
    assert.ok(csv.includes('957.20'));
    // Net = 11965 + 957.20 = 12922.20
    assert.ok(csv.includes('12922.20'));
    // VAT = 20% of 12922.20 = 2584.44
    assert.ok(csv.includes('2584.44'));
    // Grand total = 12922.20 + 2584.44 = 15506.64
    assert.ok(csv.includes('15506.64'));
  });

  test('generateBOQ_Excel produces valid xlsx workbook with matching totals and 3 worksheets', async () => {
    const buffer = await generateBOQ_Excel(sampleEstimate);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 5000, 'Excel buffer should contain formatted workbook data');

    // Parse the buffer back with ExcelJS to verify structure
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    assert.equal(workbook.worksheets.length, 3, 'Workbook should contain 3 sheets');
    const sheetNames = workbook.worksheets.map(s => s.name);
    assert.ok(sheetNames.includes('Summary & Financials'));
    assert.ok(sheetNames.includes('Bill of Quantities (BOQ)'));
    assert.ok(sheetNames.includes('Trade Breakdown'));

    // Verify totals in Summary sheet
    const summarySheet = workbook.getWorksheet('Summary & Financials');
    let grandTotalCellVal = null;
    summarySheet.eachRow(row => {
      if (row.getCell(1).value === 'GRAND TOTAL (Inc. VAT):') {
        grandTotalCellVal = row.getCell(2).value;
      }
    });

    assert.equal(grandTotalCellVal, sampleEstimate.financials.grandTotal);
  });

  test('generateBOQ_CSV throws clear error on invalid input', () => {
    assert.throws(() => {
      generateBOQ_CSV(null);
    }, /Invalid estimate object/);
  });
});
