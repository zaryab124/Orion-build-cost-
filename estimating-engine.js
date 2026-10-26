/**
 * Orion Build Cost - Estimating Engine
 * Reusable UK Construction Cost Estimating & BOQ Calculation Logic
 * Supports Node.js (CommonJS) and browser environments.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OrionEstimator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Benchmark illustrative baseline rates (£ per m² or unit)
  // Clearly labelled as illustrative benchmarks until verified project quotes are integrated.
  const BENCHMARKS = {
    projectTypes: {
      'new-build': { label: 'Residential New Build', baseRatePerM2: 1850 },
      'extension': { label: 'Extension (Single/Multi-Storey)', baseRatePerM2: 2050 },
      'renovation': { label: 'Whole-House Renovation', baseRatePerM2: 1450 },
      'loft-conversion': { label: 'Loft Conversion (Dormer/Velux)', baseRatePerM2: 1750 },
      'refurbishment': { label: 'Refurbishment & Modernisation', baseRatePerM2: 1200 },
      'commercial': { label: 'Commercial Fit-Out & Build', baseRatePerM2: 1950 },
      'other': { label: 'Custom Project', baseRatePerM2: 1600 }
    },
    ukCountries: {
      'england': { label: 'England', indexMultiplier: 1.0 },
      'scotland': { label: 'Scotland', indexMultiplier: 1.03 },
      'wales': { label: 'Wales', indexMultiplier: 0.98 },
      'northern-ireland': { label: 'Northern Ireland', indexMultiplier: 0.97 }
    },
    finishCategories: {
      'standard': { label: 'Standard Contractor Spec', multiplier: 1.0 },
      'premium': { label: 'Premium Developer Spec', multiplier: 1.25 },
      'luxury': { label: 'Architectural Luxury Spec', multiplier: 1.55 }
    },
    vatTreatments: {
      'standard-20': { label: 'Standard UK VAT (20%)', rate: 0.20, note: 'Applies to most extensions, renovations and commercial work.' },
      'reduced-5': { label: 'Reduced Rate VAT (5%)', rate: 0.05, note: 'Applies to residential conversions of empty properties (2+ years) & qualifying energy installations.' },
      'zero-0': { label: 'Zero-Rated VAT (0%)', rate: 0.00, note: 'Applies to qualifying new residential dwellings (HMRC Notice 708).' },
      'exempt-reverse': { label: 'Reverse Charge / Excluded', rate: 0.00, note: 'Applies to B2B CIS contractor supplies or VAT-exempt entities.' }
    }
  };

  /**
   * Helper: Round number safely to 2 decimal places to avoid floating point inaccuracies
   */
  function round2(num) {
    if (typeof num !== 'number' || isNaN(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  /**
   * Format number as GBP currency
   */
  function formatGBP(num, includePence = true) {
    const val = round2(num);
    const parts = val.toLocaleString('en-GB', {
      minimumFractionDigits: includePence ? 2 : 0,
      maximumFractionDigits: includePence ? 2 : 0
    });
    return '£' + parts;
  }

  /**
   * Default template line items organized by standard trade work sections
   */
  function getDefaultLineItems(params = {}) {
    const floorArea = Math.max(1, parseFloat(params.floorArea) || 100);
    const spec = params.finishCategory || 'premium';
    const specMult = BENCHMARKS.finishCategories[spec] ? BENCHMARKS.finishCategories[spec].multiplier : 1.25;

    return [
      // 1. Groundworks
      {
        id: 'gw-1',
        category: 'Groundworks',
        itemNo: '1.1',
        description: 'Site clearance, topsoil strip & disposal of excavation spoil',
        unit: 'm²',
        quantity: round2(floorArea * 1.15),
        unitRate: round2(28.00 * specMult)
      },
      {
        id: 'gw-2',
        category: 'Groundworks',
        itemNo: '1.2',
        description: 'Excavation of trench foundations (min. 1.0m depth)',
        unit: 'm³',
        quantity: round2(floorArea * 0.35),
        unitRate: round2(72.00 * specMult)
      },
      {
        id: 'gw-3',
        category: 'Groundworks',
        itemNo: '1.3',
        description: 'Ready-mix concrete C20/25 poured to trench foundations',
        unit: 'm³',
        quantity: round2(floorArea * 0.28),
        unitRate: round2(165.00 * specMult)
      },

      // 2. Structural Work
      {
        id: 'str-1',
        category: 'Structural Work',
        itemNo: '2.1',
        description: 'Structural steel universal beams & columns including fabrication',
        unit: 'tonne',
        quantity: round2(Math.max(0.5, floorArea * 0.015)),
        unitRate: round2(2650.00 * specMult)
      },
      {
        id: 'str-2',
        category: 'Structural Work',
        itemNo: '2.2',
        description: 'Suspended timber or beam-and-block intermediate floor structure',
        unit: 'm²',
        quantity: round2(floorArea * 0.5),
        unitRate: round2(85.00 * specMult)
      },

      // 3. Walls & Roofing
      {
        id: 'wall-1',
        category: 'Walls and Roofing',
        itemNo: '3.1',
        description: 'External cavity walling: facing brick outer leaf, cavity insulation, block inner leaf',
        unit: 'm²',
        quantity: round2(floorArea * 1.4),
        unitRate: round2(175.00 * specMult)
      },
      {
        id: 'wall-2',
        category: 'Walls and Roofing',
        itemNo: '3.2',
        description: 'Pitched/flat roof structure including trusses/cut rafters, membrane & slate/tile covering',
        unit: 'm²',
        quantity: round2(floorArea * 0.85),
        unitRate: round2(145.00 * specMult)
      },

      // 4. Windows & Doors
      {
        id: 'wd-1',
        category: 'Windows and Doors',
        itemNo: '4.1',
        description: 'High-performance double/triple glazed aluminium or timber composite windows',
        unit: 'nr',
        quantity: Math.max(2, Math.round(floorArea * 0.08)),
        unitRate: round2(750.00 * specMult)
      },
      {
        id: 'wd-2',
        category: 'Windows and Doors',
        itemNo: '4.2',
        description: 'Aluminium bi-fold / sliding patio door set (3-panel, multi-point locking)',
        unit: 'nr',
        quantity: 1,
        unitRate: round2(3200.00 * specMult)
      },

      // 5. Plumbing & Heating
      {
        id: 'plumb-1',
        category: 'Plumbing and Heating',
        itemNo: '5.1',
        description: 'High-efficiency boiler or air-source heat pump (ASHP) system & cylinder',
        unit: 'item',
        quantity: 1,
        unitRate: round2(5800.00 * specMult)
      },
      {
        id: 'plumb-2',
        category: 'Plumbing and Heating',
        itemNo: '5.2',
        description: 'Underfloor heating manifolds or panel radiator circuits with zone thermostats',
        unit: 'm²',
        quantity: round2(floorArea),
        unitRate: round2(55.00 * specMult)
      },

      // 6. Electrical Work
      {
        id: 'elec-1',
        category: 'Electrical Work',
        itemNo: '6.1',
        description: 'Dual RCD consumer unit, earthing & bonding to UK 18th Edition BS 7671 standards',
        unit: 'item',
        quantity: 1,
        unitRate: round2(1250.00 * specMult)
      },
      {
        id: 'elec-2',
        category: 'Electrical Work',
        itemNo: '6.2',
        description: 'Power and lighting points, recessed LED downlights, smoke alarms & commissioning',
        unit: 'point',
        quantity: Math.max(12, Math.round(floorArea * 0.6)),
        unitRate: round2(95.00 * specMult)
      },

      // 7. Finishes
      {
        id: 'fin-1',
        category: 'Finishes',
        itemNo: '7.1',
        description: 'Drylining, insulation boarding, jointing & plaster skim coat to walls and ceilings',
        unit: 'm²',
        quantity: round2(floorArea * 3.2),
        unitRate: round2(38.00 * specMult)
      },
      {
        id: 'fin-2',
        category: 'Finishes',
        itemNo: '7.2',
        description: 'Interior woodwork: solid-core doors, architraves, skirting & ironmongery',
        unit: 'nr',
        quantity: Math.max(4, Math.round(floorArea * 0.06)),
        unitRate: round2(260.00 * specMult)
      },
      {
        id: 'fin-3',
        category: 'Finishes',
        itemNo: '7.3',
        description: 'Surface preparation, mist coat and two coats emulsion decoration throughout',
        unit: 'm²',
        quantity: round2(floorArea * 3.2),
        unitRate: round2(24.00 * specMult)
      },

      // 8. Labour
      {
        id: 'lab-1',
        category: 'Labour',
        itemNo: '8.1',
        description: 'Site management, project supervision & quality assurance coordination',
        unit: 'week',
        quantity: Math.max(4, Math.round(floorArea * 0.12)),
        unitRate: round2(950.00 * specMult)
      },

      // 9. Materials
      {
        id: 'mat-1',
        category: 'Materials',
        itemNo: '9.1',
        description: 'Bulk material haulage, craneage, telehandler hire & site delivery handling',
        unit: 'item',
        quantity: 1,
        unitRate: round2(2200.00 * specMult)
      },

      // 10. Additional Project Costs
      {
        id: 'add-1',
        category: 'Additional Project Costs',
        itemNo: '10.1',
        description: 'Independent perimeter scaffolding, edge protection, hop-ups & safety inspections',
        unit: 'item',
        quantity: 1,
        unitRate: round2(3400.00 * specMult)
      },
      {
        id: 'add-2',
        category: 'Additional Project Costs',
        itemNo: '10.2',
        description: 'Site waste management: licensed 8-yard skip hire & registered waste transfer',
        unit: 'skip',
        quantity: Math.max(2, Math.round(floorArea * 0.05)),
        unitRate: round2(340.00 * specMult)
      },
      {
        id: 'add-3',
        category: 'Additional Project Costs',
        itemNo: '10.3',
        description: 'Temporary site welfare facilities, portaloo hire & water/power connections',
        unit: 'item',
        quantity: 1,
        unitRate: round2(1100.00 * specMult)
      }
    ];
  }

  /**
   * Main Estimating Calculation Function
   * Strictly computes line totals, category subtotals, contingency, VAT, and grand total.
   * Avoids duplicate counting and handles decimals/rounding carefully.
   */
  function calculateEstimate(config = {}) {
    const projectType = config.projectType || 'new-build';
    const ukCountry = config.ukCountry || 'england';
    const floorArea = Math.max(0, parseFloat(config.floorArea) || 0);
    const storeys = Math.max(1, parseInt(config.storeys, 10) || 1);
    const finishCategory = config.finishCategory || 'premium';

    // Contingency: percentage of subtotal (e.g. 0.05 for 5%, 0.10 for 10%)
    let contingencyRate = 0.075; // default 7.5%
    if (typeof config.contingencyRate === 'number' && config.contingencyRate >= 0) {
      contingencyRate = config.contingencyRate;
    }

    // VAT Treatment
    const vatTreatmentKey = config.vatTreatment || 'standard-20';
    const vatDefinition = BENCHMARKS.vatTreatments[vatTreatmentKey] || BENCHMARKS.vatTreatments['standard-20'];
    const vatRate = vatDefinition.rate;

    // Line items (either provided or generated)
    let lineItems = Array.isArray(config.lineItems) ? config.lineItems : getDefaultLineItems({ floorArea, finishCategory });

    const calculatedItems = [];
    const categoryTotals = {};
    let subtotal = 0;
    let additionalCostsTotal = 0;

    lineItems.forEach((item, index) => {
      const qty = Math.max(0, parseFloat(item.quantity) || 0);
      const rate = Math.max(0, parseFloat(item.unitRate) || 0);
      const lineTotal = round2(qty * rate);

      const calculatedItem = {
        id: item.id || `item-${index + 1}`,
        category: item.category || 'General Works',
        itemNo: item.itemNo || `${index + 1}`,
        description: item.description || 'Unspecified Work Item',
        unit: item.unit || 'item',
        quantity: qty,
        unitRate: rate,
        total: lineTotal
      };

      calculatedItems.push(calculatedItem);

      // Accumulate category subtotal
      if (!categoryTotals[calculatedItem.category]) {
        categoryTotals[calculatedItem.category] = 0;
      }
      categoryTotals[calculatedItem.category] = round2(categoryTotals[calculatedItem.category] + lineTotal);

      // Distinguish additional project costs
      if (calculatedItem.category === 'Additional Project Costs') {
        additionalCostsTotal = round2(additionalCostsTotal + lineTotal);
      }

      // Overall subtotal
      subtotal = round2(subtotal + lineTotal);
    });

    // Contingency: calculated on subtotal
    const contingencyAmount = round2(subtotal * contingencyRate);

    // Net Construction Total (Subtotal + Contingency)
    const netTotal = round2(subtotal + contingencyAmount);

    // VAT Calculation
    const vatAmount = round2(netTotal * vatRate);

    // Grand Total (Net Total + VAT)
    const grandTotal = round2(netTotal + vatAmount);

    // Benchmark comparison (indicative rate per m²)
    const costPerM2 = floorArea > 0 ? round2(grandTotal / floorArea) : 0;
    const netCostPerM2 = floorArea > 0 ? round2(netTotal / floorArea) : 0;

    return {
      metadata: {
        projectType,
        projectTypeLabel: (BENCHMARKS.projectTypes[projectType] && BENCHMARKS.projectTypes[projectType].label) || projectType,
        ukCountry,
        ukCountryLabel: (BENCHMARKS.ukCountries[ukCountry] && BENCHMARKS.ukCountries[ukCountry].label) || ukCountry,
        floorArea,
        storeys,
        finishCategory,
        finishCategoryLabel: (BENCHMARKS.finishCategories[finishCategory] && BENCHMARKS.finishCategories[finishCategory].label) || finishCategory,
        postcode: config.postcode || '',
        locationDetails: config.locationDetails || '',
        calculatedAt: new Date().toISOString(),
        isIllustrative: true,
        disclaimer: 'Illustrative cost estimate based on entered scope and standard benchmark rates. Actual costs depend on site ground conditions, detailed structural engineering, access constraints, and market tender returns.'
      },
      items: calculatedItems,
      categoryTotals,
      financials: {
        subtotal,
        additionalCostsTotal,
        contingencyRate,
        contingencyPercentage: round2(contingencyRate * 100),
        contingencyAmount,
        netTotal,
        vatTreatmentKey,
        vatTreatmentLabel: vatDefinition.label,
        vatRate,
        vatPercentage: round2(vatRate * 100),
        vatAmount,
        vatNote: vatDefinition.note,
        grandTotal,
        costPerM2,
        netCostPerM2
      }
    };
  }

  return {
    BENCHMARKS,
    round2,
    formatGBP,
    getDefaultLineItems,
    calculateEstimate
  };
}));
