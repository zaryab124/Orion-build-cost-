const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const pricingDb = require('../pricing-db.js');

describe('Orion Construction Pricing Data Layer Tests (Phase 8)', () => {

  test('getAllPricingRecords returns pre-seeded benchmark records', () => {
    const records = pricingDb.getAllPricingRecords();
    assert.ok(Array.isArray(records));
    assert.ok(records.length >= 6);

    const gwRecord = records.find(r => r.item_code === 'GW-001') || records[0];
    assert.ok(gwRecord.trade_category);
    assert.ok(gwRecord.item_code);
    assert.ok(gwRecord.unit_rate > 0);
    assert.equal(gwRecord.verification_status, 'illustrative'); // Flagged as illustrative until verified
  });

  test('createPricingRecord creates a new rate with source and verification status', () => {
    const newRecord = pricingDb.createPricingRecord({
      tradeCategory: 'Demolition & Site Prep',
      itemCode: 'DEM-001',
      description: 'Careful hand demolition of internal masonry loadbearing walls with temporary props',
      unit: 'm²',
      unitRate: 64.50,
      labourElement: 52.00,
      plantElement: 12.50,
      geographicCoverage: 'England',
      sourceReference: 'Demolition Contractors Association Guide 2026',
      verificationStatus: 'verified',
      vatTreatment: 'standard-20'
    });

    assert.ok(newRecord.id > 0);
    assert.equal(newRecord.item_code, 'DEM-001');
    assert.equal(newRecord.unit_rate, 64.50);
    assert.equal(newRecord.verification_status, 'verified');
  });

  test('updatePricingRecord updates existing rate and verification status', () => {
    const records = pricingDb.getAllPricingRecords({ search: 'DEM-001' });
    assert.ok(records.length > 0);
    const targetId = records[0].id;

    const updated = pricingDb.updatePricingRecord(targetId, {
      unitRate: 70.00,
      verificationStatus: 'verified'
    });

    assert.equal(updated.unit_rate, 70.00);
    assert.equal(updated.verification_status, 'verified');
  });

  test('REGIONAL_FACTORS provides documented multipliers for UK jurisdictions', () => {
    assert.equal(pricingDb.REGIONAL_FACTORS['England'], 1.00);
    assert.equal(pricingDb.REGIONAL_FACTORS['Scotland'], 1.03);
    assert.equal(pricingDb.REGIONAL_FACTORS['Wales'], 0.98);
    assert.equal(pricingDb.REGIONAL_FACTORS['Northern Ireland'], 0.97);
    assert.equal(pricingDb.REGIONAL_FACTORS['Greater London'], 1.22);
  });
});
