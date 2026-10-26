const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  round2,
  formatGBP,
  getDefaultLineItems,
  calculateEstimate,
  BENCHMARKS
} = require('../estimating-engine.js');

describe('Orion Estimating Engine Tests', () => {

  test('round2 correctly rounds floating point values', () => {
    assert.equal(round2(10.004), 10.00);
    assert.equal(round2(10.005), 10.01);
    assert.equal(round2(10.009), 10.01);
    assert.equal(round2(0), 0);
    assert.equal(round2(-5.555), -5.55);
    assert.equal(round2('invalid'), 0);
  });

  test('formatGBP formats currency with proper comma grouping and symbol', () => {
    assert.equal(formatGBP(1250.5), '£1,250.50');
    assert.equal(formatGBP(1000000), '£1,000,000.00');
    assert.equal(formatGBP(0), '£0.00');
    assert.equal(formatGBP(450.75, false), '£451');
  });

  test('getDefaultLineItems generates valid items based on floor area and finish category', () => {
    const itemsStandard = getDefaultLineItems({ floorArea: 100, finishCategory: 'standard' });
    assert.ok(Array.isArray(itemsStandard));
    assert.ok(itemsStandard.length >= 10);

    const itemsLuxury = getDefaultLineItems({ floorArea: 100, finishCategory: 'luxury' });
    // Luxury items should have higher unit rates due to multiplier
    const stdRate = itemsStandard.find(i => i.id === 'gw-1').unitRate;
    const luxRate = itemsLuxury.find(i => i.id === 'gw-1').unitRate;
    assert.ok(luxRate > stdRate, 'Luxury rate should exceed standard rate');
  });

  test('calculateEstimate handles standard calculation correctly with 20% VAT and 7.5% contingency', () => {
    const testItems = [
      { id: '1', category: 'Groundworks', quantity: 10, unitRate: 100 }, // 1000
      { id: '2', category: 'Structural Work', quantity: 5, unitRate: 200 }, // 1000
      { id: '3', category: 'Additional Project Costs', quantity: 1, unitRate: 500 } // 500
    ];

    const result = calculateEstimate({
      projectType: 'extension',
      floorArea: 50,
      contingencyRate: 0.10, // 10%
      vatTreatment: 'standard-20', // 20%
      lineItems: testItems
    });

    // Subtotal = 1000 + 1000 + 500 = 2500
    assert.equal(result.financials.subtotal, 2500.00);

    // Contingency = 10% of 2500 = 250
    assert.equal(result.financials.contingencyAmount, 250.00);

    // Net Total = 2500 + 250 = 2750
    assert.equal(result.financials.netTotal, 2750.00);

    // VAT = 20% of 2750 = 550
    assert.equal(result.financials.vatAmount, 550.00);

    // Grand Total = 2750 + 550 = 3300
    assert.equal(result.financials.grandTotal, 3300.00);

    // Additional costs correctly identified
    assert.equal(result.financials.additionalCostsTotal, 500.00);

    // Cost per m² = 3300 / 50 = 66
    assert.equal(result.financials.costPerM2, 66.00);
  });

  test('calculateEstimate handles zero-rated VAT (0%) for qualifying new residential builds', () => {
    const testItems = [
      { id: '1', category: 'Structural Work', quantity: 20, unitRate: 500 } // 10,000
    ];

    const result = calculateEstimate({
      projectType: 'new-build',
      floorArea: 100,
      contingencyRate: 0.05, // 5%
      vatTreatment: 'zero-0',
      lineItems: testItems
    });

    assert.equal(result.financials.subtotal, 10000.00);
    assert.equal(result.financials.contingencyAmount, 500.00);
    assert.equal(result.financials.netTotal, 10500.00);
    assert.equal(result.financials.vatAmount, 0.00);
    assert.equal(result.financials.grandTotal, 10500.00);
  });

  test('calculateEstimate handles reduced rate VAT (5%)', () => {
    const testItems = [
      { id: '1', category: 'Finishes', quantity: 10, unitRate: 1000 } // 10,000
    ];

    const result = calculateEstimate({
      projectType: 'renovation',
      floorArea: 80,
      contingencyRate: 0.10, // 1000
      vatTreatment: 'reduced-5', // 5%
      lineItems: testItems
    });

    assert.equal(result.financials.subtotal, 10000.00);
    assert.equal(result.financials.contingencyAmount, 1000.00);
    assert.equal(result.financials.netTotal, 11000.00);
    // 5% of 11,000 = 550
    assert.equal(result.financials.vatAmount, 550.00);
    assert.equal(result.financials.grandTotal, 11550.00);
  });

  test('calculateEstimate handles empty or zero line items without NaN or errors', () => {
    const result = calculateEstimate({
      floorArea: 0,
      lineItems: []
    });

    assert.equal(result.financials.subtotal, 0.00);
    assert.equal(result.financials.contingencyAmount, 0.00);
    assert.equal(result.financials.netTotal, 0.00);
    assert.equal(result.financials.vatAmount, 0.00);
    assert.equal(result.financials.grandTotal, 0.00);
    assert.equal(result.financials.costPerM2, 0.00);
  });

  test('calculateEstimate handles items with zero or negative quantities safely', () => {
    const testItems = [
      { id: '1', quantity: 0, unitRate: 100 },
      { id: '2', quantity: -5, unitRate: 50 }, // negative treated as 0
      { id: '3', quantity: 10, unitRate: 20 }  // 200
    ];

    const result = calculateEstimate({
      lineItems: testItems,
      contingencyRate: 0,
      vatTreatment: 'zero-0'
    });

    assert.equal(result.financials.subtotal, 200.00);
    assert.equal(result.financials.grandTotal, 200.00);
  });

  test('calculateEstimate correctly aggregates category totals', () => {
    const testItems = [
      { category: 'Groundworks', quantity: 2, unitRate: 150 }, // 300
      { category: 'Groundworks', quantity: 1, unitRate: 200 }, // 200
      { category: 'Structural Work', quantity: 4, unitRate: 100 }, // 400
      { category: 'Finishes', quantity: 5, unitRate: 50 } // 250
    ];

    const result = calculateEstimate({ lineItems: testItems });

    assert.equal(result.categoryTotals['Groundworks'], 500.00);
    assert.equal(result.categoryTotals['Structural Work'], 400.00);
    assert.equal(result.categoryTotals['Finishes'], 250.00);
    assert.equal(result.financials.subtotal, 1150.00);
  });

  test('calculateEstimate includes illustrative disclaimer and metadata', () => {
    const result = calculateEstimate({
      projectType: 'loft-conversion',
      ukCountry: 'scotland',
      floorArea: 45
    });

    assert.ok(result.metadata.disclaimer.includes('Illustrative cost estimate'));
    assert.equal(result.metadata.isIllustrative, true);
    assert.equal(result.metadata.projectTypeLabel, 'Loft Conversion (Dormer/Velux)');
    assert.equal(result.metadata.ukCountryLabel, 'Scotland');
  });
});
