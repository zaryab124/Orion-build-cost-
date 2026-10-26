/**
 * Orion Build Cost - Estimating Engine Frontend Controller (Phase 4)
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = window.OrionEstimator;
  if (!engine) {
    console.error('Estimating engine not found.');
    return;
  }

  // Inputs
  const projTypeSelect = document.getElementById('engProjType');
  const ukCountrySelect = document.getElementById('engUkCountry');
  const postcodeSub = document.getElementById('engPostcode');
  const storeysSelect = document.getElementById('engStoreys');
  const floorAreaSlider = document.getElementById('engFloorAreaSlider');
  const floorAreaInput = document.getElementById('engFloorAreaInput');
  const floorAreaDisplay = document.getElementById('floorAreaDisplay');
  const contingencySelect = document.getElementById('engContingency');
  const vatSelect = document.getElementById('engVatTreatment');
  const vatNoteDisplay = document.getElementById('vatNoteDisplay');

  // Summary Displays
  const sumSubtotal = document.getElementById('sumSubtotal');
  const sumContingency = document.getElementById('sumContingency');
  const sumContingencyRate = document.getElementById('sumContingencyRate');
  const sumVat = document.getElementById('sumVat');
  const sumVatRate = document.getElementById('sumVatRate');
  const sumGrandTotal = document.getElementById('sumGrandTotal');
  const sumRateM2 = document.getElementById('sumRateM2');

  // Table Elements
  const tbody = document.getElementById('itemsTableBody');
  const tfootSubtotal = document.getElementById('tfootSubtotal');
  const tfootContLabel = document.getElementById('tfootContLabel');
  const tfootContingency = document.getElementById('tfootContingency');
  const tfootNetTotal = document.getElementById('tfootNetTotal');
  const tfootVatLabel = document.getElementById('tfootVatLabel');
  const tfootVat = document.getElementById('tfootVat');
  const tfootGrandTotal = document.getElementById('tfootGrandTotal');

  // Buttons
  const btnAdd = document.getElementById('btnAddLineItem');
  const btnReset = document.getElementById('btnResetItems');
  const btnPrint = document.getElementById('btnPrintEstimate');

  // Internal state
  let currentItems = [];

  function getSelectedSpec() {
    const checked = document.querySelector('input[name="engSpec"]:checked');
    return checked ? checked.value : 'premium';
  }

  function initDefaultItems() {
    const area = parseFloat(floorAreaSlider.value) || 85;
    const spec = getSelectedSpec();
    currentItems = engine.getDefaultLineItems({ floorArea: area, finishCategory: spec });
  }

  function renderTable() {
    tbody.innerHTML = '';

    currentItems.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <input type="text" class="table-input-inline" style="width:100%;" value="${item.category}" data-field="category" data-index="${index}">
        </td>
        <td style="text-align:center;">
          <input type="text" class="table-input-inline" style="width:50px;text-align:center;" value="${item.itemNo}" data-field="itemNo" data-index="${index}">
        </td>
        <td>
          <input type="text" class="table-input-inline" style="width:100%;" value="${item.description}" data-field="description" data-index="${index}">
        </td>
        <td style="text-align:center;">
          <input type="text" class="table-input-inline" style="width:50px;text-align:center;" value="${item.unit}" data-field="unit" data-index="${index}">
        </td>
        <td>
          <input type="number" step="any" min="0" class="table-input-inline" style="width:90px;" value="${item.quantity}" data-field="quantity" data-index="${index}">
        </td>
        <td>
          <input type="number" step="any" min="0" class="table-input-inline" style="width:100px;" value="${item.unitRate}" data-field="unitRate" data-index="${index}">
        </td>
        <td style="font-weight:600;color:#fff;" id="rowTotal-${index}">
          ${engine.formatGBP(item.quantity * item.unitRate)}
        </td>
        <td class="no-print" style="text-align:center;">
          <button class="btn-remove-row" data-index="${index}" title="Remove Item">&times;</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach row input listeners
    tbody.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        const field = e.target.getAttribute('data-field');
        const val = e.target.value;

        if (field === 'quantity' || field === 'unitRate') {
          currentItems[idx][field] = parseFloat(val) || 0;
          const lineTotal = engine.round2(currentItems[idx].quantity * currentItems[idx].unitRate);
          const rowTotalEl = document.getElementById(`rowTotal-${idx}`);
          if (rowTotalEl) rowTotalEl.textContent = engine.formatGBP(lineTotal);
        } else {
          currentItems[idx][field] = val;
        }

        recalculate();
      });
    });

    // Attach remove listeners
    tbody.querySelectorAll('.btn-remove-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        currentItems.splice(idx, 1);
        renderTable();
        recalculate();
      });
    });
  }

  function recalculate() {
    const area = parseFloat(floorAreaSlider.value) || 85;
    const contingencyRate = parseFloat(contingencySelect.value);
    const vatKey = vatSelect.value;

    const estimate = engine.calculateEstimate({
      projectType: projTypeSelect.value,
      ukCountry: ukCountrySelect.value,
      floorArea: area,
      storeys: parseInt(storeysSelect.value, 10),
      finishCategory: getSelectedSpec(),
      postcode: postcodeSub.value.trim(),
      contingencyRate,
      vatTreatment: vatKey,
      lineItems: currentItems
    });

    // Update displays
    sumSubtotal.textContent = engine.formatGBP(estimate.financials.subtotal);
    sumContingency.textContent = engine.formatGBP(estimate.financials.contingencyAmount);
    sumContingencyRate.textContent = `${estimate.financials.contingencyPercentage}% calculation base`;
    sumVat.textContent = engine.formatGBP(estimate.financials.vatAmount);
    sumVatRate.textContent = `${estimate.financials.vatPercentage}% (${estimate.financials.vatTreatmentLabel})`;
    sumGrandTotal.textContent = engine.formatGBP(estimate.financials.grandTotal);
    sumRateM2.textContent = `${engine.formatGBP(estimate.financials.costPerM2, false)} / m² (GIA)`;

    // Update table footers
    tfootSubtotal.textContent = engine.formatGBP(estimate.financials.subtotal);
    tfootContLabel.textContent = `Contingency Allowance (${estimate.financials.contingencyPercentage}%):`;
    tfootContingency.textContent = engine.formatGBP(estimate.financials.contingencyAmount);
    tfootNetTotal.textContent = engine.formatGBP(estimate.financials.netTotal);
    tfootVatLabel.textContent = `VAT (${estimate.financials.vatPercentage}% - ${estimate.financials.vatTreatmentLabel}):`;
    tfootVat.textContent = engine.formatGBP(estimate.financials.vatAmount);
    tfootGrandTotal.textContent = engine.formatGBP(estimate.financials.grandTotal);

    // Save state to localStorage for BOQ Builder
    try {
      localStorage.setItem('orion_current_estimate', JSON.stringify(estimate));
    } catch (e) {
      // localStorage disabled or full
    }
  }

  // Event Listeners for Controls
  floorAreaSlider.addEventListener('input', (e) => {
    floorAreaInput.value = e.target.value;
    floorAreaDisplay.textContent = `${e.target.value} m²`;
    initDefaultItems();
    renderTable();
    recalculate();
  });

  floorAreaInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value) || 50;
    if (val < 10) val = 10;
    if (val > 5000) val = 5000;
    floorAreaSlider.value = val;
    floorAreaDisplay.textContent = `${val} m²`;
    initDefaultItems();
    renderTable();
    recalculate();
  });

  document.querySelectorAll('input[name="engSpec"]').forEach(radio => {
    radio.addEventListener('change', () => {
      initDefaultItems();
      renderTable();
      recalculate();
    });
  });

  projTypeSelect.addEventListener('change', recalculate);
  ukCountrySelect.addEventListener('change', recalculate);
  storeysSelect.addEventListener('change', recalculate);
  contingencySelect.addEventListener('change', recalculate);

  vatSelect.addEventListener('change', () => {
    const vatKey = vatSelect.value;
    const vatDef = engine.BENCHMARKS.vatTreatments[vatKey];
    if (vatDef && vatNoteDisplay) {
      vatNoteDisplay.textContent = vatDef.note;
    }
    recalculate();
  });

  // Add Custom Work Item
  btnAdd.addEventListener('click', () => {
    const newItem = {
      id: `custom-${Date.now()}`,
      category: 'General Works',
      itemNo: `${currentItems.length + 1}.0`,
      description: 'Custom specification work item',
      unit: 'item',
      quantity: 1,
      unitRate: 500
    };
    currentItems.push(newItem);
    renderTable();
    recalculate();
  });

  // Reset to Defaults
  btnReset.addEventListener('click', () => {
    if (confirm('Reset all line items back to benchmark defaults for this floor area?')) {
      initDefaultItems();
      renderTable();
      recalculate();
    }
  });

  // Print A4
  btnPrint.addEventListener('click', () => {
    window.print();
  });

  // Initial load
  initDefaultItems();
  renderTable();
  recalculate();
});
