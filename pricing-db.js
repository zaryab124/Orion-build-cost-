/**
 * Orion Build Cost - Construction Pricing Data Layer (Phase 8)
 * Structured UK construction rates with source references, verification status, and regional adjustment factors.
 */

const { db } = require('./db.js');

const REGIONAL_FACTORS = {
  'England': 1.00,
  'Scotland': 1.03,
  'Wales': 0.98,
  'Northern Ireland': 0.97,
  'Greater London': 1.22,
  'South East England': 1.12
};

/**
 * Seed benchmark pricing data if table is empty
 */
function seedPricingData() {
  const count = db.prepare('SELECT COUNT(*) as count FROM pricing_records').get().count;
  if (count > 0) return;

  const sampleRates = [
    {
      trade: 'Groundworks & Earthworks',
      code: 'GW-001',
      desc: 'Topsoil strip and site clearance (up to 150mm depth) including local stockpile',
      unit: 'm²',
      rate: 28.00,
      labour: 12.00,
      materials: 4.00,
      plant: 12.00,
      region: 'UK-Nationwide',
      effective: '2026-01-01',
      source: 'BCIS / RICS Benchmark Averages Q1 2026',
      status: 'illustrative',
      vat: 'standard-20'
    },
    {
      trade: 'Groundworks & Earthworks',
      code: 'GW-002',
      desc: 'Trench excavation in standard ground, depth 1.0m to 1.5m, disposal off-site to licensed tip',
      unit: 'm³',
      rate: 72.00,
      labour: 24.00,
      materials: 6.00,
      plant: 42.00,
      region: 'UK-Nationwide',
      effective: '2026-01-01',
      source: 'BCIS / RICS Benchmark Averages Q1 2026',
      status: 'illustrative',
      vat: 'standard-20'
    },
    {
      trade: 'In-Situ Concrete',
      code: 'CON-001',
      desc: 'Ready-mixed concrete C20/25 in strip footings and foundation trenches',
      unit: 'm³',
      rate: 165.00,
      labour: 38.00,
      materials: 115.00,
      plant: 12.00,
      region: 'UK-Nationwide',
      effective: '2026-01-01',
      source: 'National Ready Mixed Concrete Index 2026',
      status: 'illustrative',
      vat: 'standard-20'
    },
    {
      trade: 'Structural Steelwork',
      code: 'STL-001',
      desc: 'Universal beams and columns (S355 grade), fabricated with end plates and primer paint',
      unit: 'tonne',
      rate: 2650.00,
      labour: 650.00,
      materials: 1800.00,
      plant: 200.00,
      region: 'UK-Nationwide',
      effective: '2026-01-01',
      source: 'BCIS Steelwork Index Q1 2026',
      status: 'illustrative',
      vat: 'standard-20'
    },
    {
      trade: 'Masonry & Blockwork',
      code: 'MAS-001',
      desc: 'Facing brickwork (allowance £650/k bricks) in 1:1:6 cement-lime mortar, half-brick thick',
      unit: 'm²',
      rate: 110.00,
      labour: 58.00,
      materials: 52.00,
      plant: 0.00,
      region: 'UK-Nationwide',
      effective: '2026-01-01',
      source: 'UK Brick Development Association Benchmark',
      status: 'illustrative',
      vat: 'standard-20'
    },
    {
      trade: 'Roofing & Cladding',
      code: 'ROOF-001',
      desc: 'Natural Spanish slate 500x250mm on 50x25mm treated battens and breathable membrane',
      unit: 'm²',
      rate: 98.00,
      labour: 48.00,
      materials: 50.00,
      plant: 0.00,
      region: 'UK-Nationwide',
      effective: '2026-01-01',
      source: 'NFRC Benchmark Price Guide 2026',
      status: 'illustrative',
      vat: 'standard-20'
    },
    {
      trade: 'Internal Finishes & Drylining',
      code: 'FIN-001',
      desc: '12.5mm plasterboard drylining fixed to timber or metal studding, finished with 2mm skim coat',
      unit: 'm²',
      rate: 38.00,
      labour: 26.00,
      materials: 12.00,
      plant: 0.00,
      region: 'UK-Nationwide',
      effective: '2026-01-01',
      source: 'Association of Interior Specialists Q1 2026',
      status: 'illustrative',
      vat: 'standard-20'
    },
    {
      trade: 'Mechanical & Plumbing',
      code: 'MEP-001',
      desc: 'Air source heat pump (ASHP) 8kW monobloc system including buffer vessel & controls',
      unit: 'item',
      rate: 6800.00,
      labour: 1800.00,
      materials: 5000.00,
      plant: 0.00,
      region: 'UK-Nationwide',
      effective: '2026-01-01',
      source: 'CIBSE Domestic Building Services Benchmarks',
      status: 'illustrative',
      vat: 'reduced-5'
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO pricing_records (
      trade_category, item_code, description, unit, unit_rate,
      labour_element, materials_element, plant_element, geographic_coverage,
      effective_date, source_reference, verification_status, vat_treatment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  sampleRates.forEach(r => {
    stmt.run(
      r.trade, r.code, r.desc, r.unit, r.rate,
      r.labour, r.materials, r.plant, r.region,
      r.effective, r.source, r.status, r.vat
    );
  });
}

// Seed on module load
seedPricingData();

function getAllPricingRecords(filters = {}) {
  let query = 'SELECT * FROM pricing_records WHERE 1=1';
  const params = [];

  if (filters.tradeCategory) {
    query += ' AND trade_category = ?';
    params.push(filters.tradeCategory);
  }

  if (filters.verificationStatus) {
    query += ' AND verification_status = ?';
    params.push(filters.verificationStatus);
  }

  if (filters.search) {
    query += ' AND (description LIKE ? OR item_code LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  query += ' ORDER BY trade_category, item_code ASC';

  const rows = db.prepare(query).all(...params);
  return rows.map(r => ({
    ...r,
    isExpired: r.expiry_date ? new Date(r.expiry_date) < new Date() : false
  }));
}

function getPricingRecordById(id) {
  return db.prepare('SELECT * FROM pricing_records WHERE id = ?').get(id);
}

function createPricingRecord(data) {
  const {
    tradeCategory, itemCode, description, unit, unitRate,
    labourElement, materialsElement, plantElement, geographicCoverage,
    effectiveDate, expiryDate, sourceReference, verificationStatus, vatTreatment
  } = data;

  if (!tradeCategory || !itemCode || !description || !unit || typeof unitRate !== 'number') {
    throw new Error('Missing required pricing fields (trade, code, description, unit, rate).');
  }

  const result = db.prepare(`
    INSERT INTO pricing_records (
      trade_category, item_code, description, unit, unit_rate,
      labour_element, materials_element, plant_element, geographic_coverage,
      effective_date, expiry_date, source_reference, verification_status, vat_treatment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tradeCategory.trim(), itemCode.trim().toUpperCase(), description.trim(), unit.trim(),
    unitRate, labourElement || 0, materialsElement || 0, plantElement || 0,
    geographicCoverage || 'UK-Nationwide', effectiveDate || new Date().toISOString().slice(0, 10),
    expiryDate || null, sourceReference || 'Manual Entry',
    verificationStatus || 'illustrative', vatTreatment || 'standard-20'
  );

  return getPricingRecordById(result.lastInsertRowid);
}

function updatePricingRecord(id, data) {
  const existing = getPricingRecordById(id);
  if (!existing) throw new Error('Pricing record not found.');

  db.prepare(`
    UPDATE pricing_records SET
      trade_category = COALESCE(?, trade_category),
      item_code = COALESCE(?, item_code),
      description = COALESCE(?, description),
      unit = COALESCE(?, unit),
      unit_rate = COALESCE(?, unit_rate),
      labour_element = COALESCE(?, labour_element),
      materials_element = COALESCE(?, materials_element),
      plant_element = COALESCE(?, plant_element),
      geographic_coverage = COALESCE(?, geographic_coverage),
      effective_date = COALESCE(?, effective_date),
      expiry_date = COALESCE(?, expiry_date),
      source_reference = COALESCE(?, source_reference),
      verification_status = COALESCE(?, verification_status),
      vat_treatment = COALESCE(?, vat_treatment),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.tradeCategory ?? null,
    data.itemCode ?? null,
    data.description ?? null,
    data.unit ?? null,
    data.unitRate ?? null,
    data.labourElement ?? null,
    data.materialsElement ?? null,
    data.plantElement ?? null,
    data.geographicCoverage ?? null,
    data.effectiveDate ?? null,
    data.expiryDate ?? null,
    data.sourceReference ?? null,
    data.verificationStatus ?? null,
    data.vatTreatment ?? null,
    id
  );

  return getPricingRecordById(id);
}

function deletePricingRecord(id) {
  db.prepare('DELETE FROM pricing_records WHERE id = ?').run(id);
  return { success: true };
}

module.exports = {
  REGIONAL_FACTORS,
  getAllPricingRecords,
  getPricingRecordById,
  createPricingRecord,
  updatePricingRecord,
  deletePricingRecord
};
