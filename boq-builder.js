/**
 * Orion Build Cost - BOQ Builder Frontend Controller (Phase 5)
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = window.OrionEstimator;
  if (!engine) {
    console.error('Estimating engine not found.');
    return;
  }

  let activeEstimate = null;

  // Elements
  const btnLoadSample = document.getElementById('btnLoadSample');
  const btnLoadFromEstimator = document.getElementById('btnLoadFromEstimator');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnPrintA4 = document.getElementById('btnPrintA4');

  const repDocRef = document.getElementById('repDocRef');
  const repDate = document.getElementById('repDate');
  const repProjType = document.getElementById('repProjType');
  const repLocation = document.getElementById('repLocation');
  const repArea = document.getElementById('repArea');

  const boqBody = document.getElementById('boqReportBody');
  const repSubtotal = document.getElementById('repSubtotal');
  const repContLabel = document.getElementById('repContLabel');
  const repContingency = document.getElementById('repContingency');
  const repNetTotal = document.getElementById('repNetTotal');
  const repVatLabel = document.getElementById('repVatLabel');
  const repVat = document.getElementById('repVat');
  const repGrandTotal = document.getElementById('repGrandTotal');

  function loadSampleData() {
    activeEstimate = engine.calculateEstimate({
      projectType: 'extension',
      ukCountry: 'england',
      floorArea: 85,
      storeys: 1,
      finishCategory: 'premium',
      contingencyRate: 0.075,
      vatTreatment: 'standard-20'
    });
    renderReport();
  }

  function loadFromStorage() {
    try {
      const saved = localStorage.getItem('orion_current_estimate');
      if (saved) {
        activeEstimate = JSON.parse(saved);
        renderReport();
        return true;
      }
    } catch (e) {
      console.warn('Could not read from localStorage:', e);
    }
    return false;
  }

  function renderReport() {
    if (!activeEstimate) return;

    repDocRef.textContent = `OBC-BOQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)} (Rev 0)`;
    repDate.textContent = `Date: ${new Date().toLocaleDateString('en-GB')}`;
    repProjType.textContent = activeEstimate.metadata.projectTypeLabel || 'Standard Construction';
    repLocation.textContent = `${activeEstimate.metadata.ukCountryLabel || 'England'} (UK Jurisdiction)`;
    repArea.textContent = `${activeEstimate.metadata.floorArea} m² (${activeEstimate.metadata.storeys || 1} Storey)`;

    boqBody.innerHTML = '';

    // Group items by category to render section headers & subtotals
    let currentCategory = '';
    activeEstimate.items.forEach((item, idx) => {
      if (item.category !== currentCategory) {
        currentCategory = item.category;
        const catRow = document.createElement('tr');
        catRow.style.background = '#F1F5F9';
        catRow.innerHTML = `
          <td colspan="7" style="font-weight:700;color:#0B2545;padding:8px 12px;font-size:0.875rem;text-transform:uppercase;letter-spacing:0.04em;">
            Work Section ${item.itemNo.split('.')[0]}: ${currentCategory}
          </td>
        `;
        boqBody.appendChild(catRow);
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:#64748B;font-size:0.8125rem;">${item.category}</td>
        <td style="text-align:center;font-weight:600;font-size:0.8125rem;">${item.itemNo}</td>
        <td style="font-size:0.875rem;">${item.description}</td>
        <td style="text-align:center;font-size:0.8125rem;">${item.unit}</td>
        <td style="text-align:right;font-size:0.8125rem;">${engine.round2(item.quantity).toFixed(2)}</td>
        <td style="text-align:right;font-size:0.8125rem;">${engine.formatGBP(item.unitRate)}</td>
        <td style="text-align:right;font-weight:600;font-size:0.875rem;color:#0B2545;">${engine.formatGBP(item.total)}</td>
      `;
      boqBody.appendChild(tr);
    });

    // Footers
    repSubtotal.textContent = engine.formatGBP(activeEstimate.financials.subtotal);
    repContLabel.textContent = `Contingency Allowance (${activeEstimate.financials.contingencyPercentage}%):`;
    repContingency.textContent = engine.formatGBP(activeEstimate.financials.contingencyAmount);
    repNetTotal.textContent = engine.formatGBP(activeEstimate.financials.netTotal);
    repVatLabel.textContent = `VAT (${activeEstimate.financials.vatPercentage}% - ${activeEstimate.financials.vatTreatmentLabel}):`;
    repVat.textContent = engine.formatGBP(activeEstimate.financials.vatAmount);
    repGrandTotal.textContent = engine.formatGBP(activeEstimate.financials.grandTotal);
  }

  // Button Listeners
  btnLoadSample.addEventListener('click', loadSampleData);

  btnLoadFromEstimator.addEventListener('click', () => {
    const success = loadFromStorage();
    if (!success) {
      alert('No previous estimate found in your browser. Loading standard illustrative sample instead.');
      loadSampleData();
    }
  });

  btnPrintA4.addEventListener('click', () => {
    window.print();
  });

  // Export Excel (.xlsx) via backend
  btnExportExcel.addEventListener('click', async () => {
    if (!activeEstimate) loadSampleData();

    btnExportExcel.disabled = true;
    const oldText = btnExportExcel.innerHTML;
    btnExportExcel.innerHTML = '<span>Generating Spreadsheet...</span>';

    try {
      const response = await fetch('/api/export/xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeEstimate)
      });

      if (!response.ok) {
        throw new Error('Server returned ' + response.status);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Orion-Build-Cost-BOQ-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel download failed:', err);
      alert('Could not generate Excel export: ' + err.message);
    } finally {
      btnExportExcel.disabled = false;
      btnExportExcel.innerHTML = oldText;
    }
  });

  // Export CSV via backend
  btnExportCSV.addEventListener('click', async () => {
    if (!activeEstimate) loadSampleData();

    btnExportCSV.disabled = true;
    const oldText = btnExportCSV.innerHTML;
    btnExportCSV.innerHTML = '<span>Exporting CSV...</span>';

    try {
      const response = await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeEstimate)
      });

      if (!response.ok) {
        throw new Error('Server returned ' + response.status);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Orion-Build-Cost-BOQ-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed:', err);
      alert('Could not generate CSV export: ' + err.message);
    } finally {
      btnExportCSV.disabled = false;
      btnExportCSV.innerHTML = oldText;
    }
  });

  // Initialize: attempt load from storage, fallback to sample
  if (!loadFromStorage()) {
    loadSampleData();
  }
});
