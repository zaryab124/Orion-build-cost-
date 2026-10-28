/**
 * Orion Build Cost - Drawing & Assisted Quantity Take-Off Workspace (Phase 9)
 * Interactive CAD measurement canvas, scale calibration, AI-assisted extraction,
 * and QS verification governance for RICS NRM2 Bill of Quantities export.
 */

(function () {
  'use strict';

  // State
  let currentFileId = null;
  let activeTool = 'select'; // 'select', 'linear', 'area', 'count'
  let scaleRatio = '1:100';
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startPanX = 0;
  let startPanY = 0;

  let activeMeasurements = [];
  let assistedCandidates = [];
  let tempPoints = [];
  let selectedMeasurementForVerif = null;

  // DOM Elements
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas.getContext('2d');
  const viewport = document.getElementById('canvasViewport');

  const hudScale = document.getElementById('hudScaleRatio');
  const hudTool = document.getElementById('hudActiveTool');
  const hudInfo = document.getElementById('hudMeasurementInfo');
  const zoomText = document.getElementById('zoomLevelText');

  const scheduleContainer = document.getElementById('scheduleItemsContainer');
  const scheduleCount = document.getElementById('scheduleCount');
  const assistedContainer = document.getElementById('assistedCandidatesContainer');

  const tabBtnSchedule = document.getElementById('tabBtnSchedule');
  const tabBtnAssisted = document.getElementById('tabBtnAssisted');
  const sideTabSchedule = document.getElementById('sideTabSchedule');
  const sideTabAssisted = document.getElementById('sideTabAssisted');

  const verificationModal = document.getElementById('verificationModal');
  const btnCloseVerifModal = document.getElementById('btnCloseVerifModal');
  const btnConfirmVerification = document.getElementById('btnConfirmVerification');

  // Scale pixels-to-meters factors at 100% zoom:
  // At 1:100 on standard A1/A3 drawing: 40 pixels ≈ 1.00 metre
  const SCALE_PIXEL_FACTORS = {
    '1:100': 40,
    '1:50': 80,
    '1:200': 20,
    '1:20': 200
  };

  // Format GBP & Float
  function formatGBP(amount) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Sample architectural blueprints to draw when no custom image is loaded
  function renderArchitecturalPlan(width, height) {
    ctx.save();
    ctx.fillStyle = '#071527';
    ctx.fillRect(0, 0, width, height);

    // Grid lines (Grid A to D, 1 to 4)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 60; x < width - 40; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x, height - 40);
      ctx.stroke();
    }
    for (let y = 60; y < height - 40; y += 100) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 40, y);
      ctx.stroke();
    }

    // Outer Cavity Walls (White/Gold double lines)
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.strokeRect(120, 100, 680, 420);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(128, 108, 664, 404);

    // Internal Loadbearing Masonry Walls
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    // Wall 1: Kitchen / Living divider
    ctx.beginPath();
    ctx.moveTo(420, 108);
    ctx.lineTo(420, 360);
    ctx.stroke();

    // Wall 2: Hallway / Utility divider
    ctx.beginPath();
    ctx.moveTo(128, 300);
    ctx.lineTo(420, 300);
    ctx.stroke();

    // Wall 3: Rear Aperture with Steel Beam Header (Yellow Dash)
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(500, 100);
    ctx.lineTo(720, 100);
    ctx.stroke();
    ctx.setLineDash([]);

    // Room Text Labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText('OPEN-PLAN KITCHEN & DINING', 460, 240);
    ctx.fillText('LIVING ROOM', 160, 220);
    ctx.fillText('UTILITY & WC', 160, 400);
    ctx.fillText('MASTER BEDROOM / STUDY', 460, 420);

    // Dimension lines from architect
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('17.00 m (Grid 1 to 4)', 420, 80);
    ctx.fillText('10.50 m (Grid A to C)', 70, 310);
    ctx.fillText('STEEL BEAM UB 203x133x30 [PROPOSED]', 510, 120);

    // Title Block in bottom right
    ctx.fillStyle = 'rgba(11, 37, 69, 0.9)';
    ctx.fillRect(width - 290, height - 100, 270, 85);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(width - 290, height - 100, 270, 85);

    ctx.fillStyle = 'var(--gold-accent)';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillText('ORION BUILD COST — TAKE-OFF CAD', width - 275, height - 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('SCHEME: RESIDENTIAL EXTENSION [REV B]', width - 275, height - 64);
    ctx.fillText(`CALIBRATED SCALE: ${scaleRatio} @ A1`, width - 275, height - 48);
    ctx.fillText('METRIC STANDARD: NRM2 RULES OF MEASUREMENT', width - 275, height - 32);

    ctx.restore();
  }

  // Draw user measurements & annotations on top of drawing
  function renderAnnotations() {
    activeMeasurements.forEach((ann, idx) => {
      ctx.save();

      if (ann.tool_type === 'linear' && ann.points && ann.points.length >= 2) {
        // Draw Linear Measurement Line
        const p1 = ann.points[0];
        const p2 = ann.points[1];

        ctx.strokeStyle = ann.provenance === 'verified_approved' ? '#4ade80' : ann.provenance === 'ai_suggested' ? '#fbbf24' : '#60a5fa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // End ticks
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const tickLength = 10;
        ctx.beginPath();
        ctx.moveTo(p1.x - Math.sin(angle) * tickLength, p1.y + Math.cos(angle) * tickLength);
        ctx.lineTo(p1.x + Math.sin(angle) * tickLength, p1.y - Math.cos(angle) * tickLength);
        ctx.moveTo(p2.x - Math.sin(angle) * tickLength, p2.y + Math.cos(angle) * tickLength);
        ctx.lineTo(p2.x + Math.sin(angle) * tickLength, p2.y - Math.cos(angle) * tickLength);
        ctx.stroke();

        // Midpoint Label
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        ctx.fillStyle = 'rgba(5, 14, 26, 0.85)';
        ctx.fillRect(midX - 35, midY - 14, 70, 20);
        ctx.strokeStyle = ctx.strokeStyle;
        ctx.strokeRect(midX - 35, midY - 14, 70, 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${ann.measured_value.toFixed(2)} m`, midX, midY);

      } else if (ann.tool_type === 'area' && ann.points && ann.points.length >= 3) {
        // Draw Area Polygon
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = ann.provenance === 'verified_approved' ? 'rgba(34, 197, 94, 0.25)' : ann.provenance === 'ai_suggested' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(0, 194, 255, 0.22)';
        ctx.fill();
        ctx.strokeStyle = ann.provenance === 'verified_approved' ? '#4ade80' : ann.provenance === 'ai_suggested' ? '#fbbf24' : '#00C2FF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Center Area Label
        const cx = ann.points.reduce((sum, p) => sum + p.x, 0) / ann.points.length;
        const cy = ann.points.reduce((sum, p) => sum + p.y, 0) / ann.points.length;
        ctx.fillStyle = 'rgba(5, 14, 26, 0.88)';
        ctx.fillRect(cx - 45, cy - 14, 90, 22);
        ctx.strokeRect(cx - 45, cy - 14, 90, 22);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${ann.measured_value.toFixed(2)} m²`, cx, cy + 2);

      } else if (ann.tool_type === 'count' && ann.points && ann.points.length >= 1) {
        // Draw Count Pin / Badge
        const p = ann.points[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = ann.provenance === 'verified_approved' ? '#22c55e' : '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#050E1A';
        ctx.font = 'bold 11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${idx + 1}`, p.x, p.y + 4);
      }

      ctx.restore();
    });

    // Render active drawing points in progress
    if (tempPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(tempPoints[0].x, tempPoints[0].y);
      for (let i = 1; i < tempPoints.length; i++) {
        ctx.lineTo(tempPoints[i].x, tempPoints[i].y);
      }
      ctx.stroke();

      tempPoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#facc15';
        ctx.fill();
      });

      ctx.restore();
    }
  }

  // Full Redraw
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderArchitecturalPlan(canvas.width, canvas.height);
    renderAnnotations();
  }

  // Load Seed Measurements (Demonstration Data)
  function loadSeedMeasurements() {
    activeMeasurements = [
      {
        id: 1,
        tool_type: 'linear',
        label: 'External Cavity Wall Front Elevation',
        measured_value: 17.00,
        unit: 'm',
        scale_ratio: scaleRatio,
        provenance: 'verified_approved',
        notes: 'Certified against 1:100 scale bar by QS.',
        points: [{ x: 128, y: 100 }, { x: 808, y: 100 }]
      },
      {
        id: 2,
        tool_type: 'area',
        label: 'Open-Plan Kitchen & Dining Floor Slab',
        measured_value: 78.50,
        unit: 'm²',
        scale_ratio: scaleRatio,
        provenance: 'ai_suggested',
        notes: 'Candidate spatial boundary detected from perimeter walls. Requires QS scale verification.',
        points: [{ x: 420, y: 108 }, { x: 792, y: 108 }, { x: 792, y: 360 }, { x: 420, y: 360 }]
      },
      {
        id: 3,
        tool_type: 'count',
        label: 'Structural Steel Beams (Rear Opening)',
        measured_value: 1.00,
        unit: 'nr',
        scale_ratio: scaleRatio,
        provenance: 'verified_approved',
        notes: 'Loadbearing wall removal opening verified.',
        points: [{ x: 610, y: 100 }]
      }
    ];

    renderScheduleSidebar();
    redraw();
  }

  // Load Assisted Candidates
  function loadAssistedCandidates() {
    assistedCandidates = [
      {
        id: 'cand-1',
        toolType: 'area',
        label: 'Master Bedroom & Living Room Floor Screed',
        measuredValue: 56.40,
        unit: 'm²',
        scaleRatio,
        provenance: 'ai_suggested',
        notes: 'Candidate spatial zone detected from partition walls. Requires QS scale verification.',
        points: [{ x: 128, y: 108 }, { x: 420, y: 108 }, { x: 420, y: 300 }, { x: 128, y: 300 }]
      },
      {
        id: 'cand-2',
        toolType: 'linear',
        label: 'Internal Masonry Stud Wall Partitioning',
        measuredValue: 12.80,
        unit: 'm',
        scaleRatio,
        provenance: 'ai_suggested',
        notes: 'Centerline candidate wall partition detected. Requires QS scale verification.',
        points: [{ x: 420, y: 108 }, { x: 420, y: 360 }]
      },
      {
        id: 'cand-3',
        toolType: 'count',
        label: 'Internal Timber Fire Door Sets (FD30)',
        measuredValue: 4.00,
        unit: 'nr',
        scaleRatio,
        provenance: 'ai_suggested',
        notes: 'Door swings identified on architectural layout. Requires QS scale verification.',
        points: [{ x: 380, y: 300 }]
      }
    ];

    renderAssistedSidebar();
  }

  // Render Schedule Sidebar
  function renderScheduleSidebar() {
    if (!scheduleContainer) return;
    scheduleCount.textContent = activeMeasurements.length;

    if (activeMeasurements.length === 0) {
      scheduleContainer.innerHTML = `
        <div style="text-align:center; padding:30px 10px; color:var(--slate-light); font-size:0.85rem;">
          No active measurements on plan.<br>Select a tool above to start measuring.
        </div>
      `;
      return;
    }

    scheduleContainer.innerHTML = activeMeasurements.map((m, idx) => `
      <div class="takeoff-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <span class="provenance-pill provenance-${m.provenance}">
            ${m.provenance === 'verified_approved' ? '✓ QS Verified' : m.provenance === 'ai_suggested' ? '⚠️ AI Candidate' : 'Manual'}
          </span>
          <span style="font-size:0.75rem; color:var(--slate-light);">${m.scale_ratio}</span>
        </div>
        <div style="font-weight:600; color:var(--white); font-size:0.9rem; margin-bottom:4px;">
          ${escapeHTML(m.label)}
        </div>
        <div style="font-size:1.15rem; font-family:var(--font-heading); font-weight:700; color:var(--gold-accent); margin-bottom:6px;">
          ${m.measured_value.toFixed(2)} ${m.unit}
        </div>
        <div style="font-size:0.75rem; color:var(--slate-light); margin-bottom:10px;">
          ${escapeHTML(m.notes || 'Measured on drawing')}
        </div>
        <div style="display:flex; gap:8px;">
          ${m.provenance !== 'verified_approved' ? `
            <button class="btn btn-primary btn-sm" style="flex:1; padding:3px 6px; font-size:0.75rem;" onclick="window.openVerificationModal(${idx})">
              Certify (QS)
            </button>
          ` : `
            <span style="flex:1; font-size:0.75rem; color:#4ade80; display:flex; align-items:center;">✓ Certified</span>
          `}
          <button class="btn btn-secondary btn-sm" style="padding:3px 6px; font-size:0.75rem; color:#f87171;" onclick="window.deleteMeasurement(${idx})">
            Remove
          </button>
        </div>
      </div>
    `).join('');
  }

  // Render Assisted Candidates Sidebar
  function renderAssistedSidebar() {
    if (!assistedContainer) return;

    if (assistedCandidates.length === 0) {
      assistedContainer.innerHTML = `
        <div style="text-align:center; padding:30px 10px; color:var(--slate-light); font-size:0.85rem;">
          No unassigned candidate schedules detected.
        </div>
      `;
      return;
    }

    assistedContainer.innerHTML = assistedCandidates.map((c, idx) => `
      <div class="takeoff-card" style="border-color:rgba(245, 158, 11, 0.3);">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span class="provenance-pill provenance-ai_suggested">⚠️ AI-Assisted Candidate</span>
          <span style="font-size:0.75rem; color:var(--slate-light);">${c.scaleRatio}</span>
        </div>
        <div style="font-weight:600; color:var(--white); font-size:0.9rem; margin-bottom:4px;">
          ${escapeHTML(c.label)}
        </div>
        <div style="font-size:1.15rem; font-family:var(--font-heading); font-weight:700; color:#fbbf24; margin-bottom:6px;">
          ${c.measuredValue.toFixed(2)} ${c.unit}
        </div>
        <div style="font-size:0.75rem; color:var(--slate-light); margin-bottom:10px;">
          ${escapeHTML(c.notes)}
        </div>
        <button class="btn btn-secondary btn-sm" style="width:100%; padding:4px 8px; font-size:0.75rem; border-color:var(--gold-accent); color:var(--gold-accent);" onclick="window.acceptCandidate(${idx})">
          + Add to Schedule &amp; Verify
        </button>
      </div>
    `).join('');
  }

  // Accept candidate into active take-offs
  window.acceptCandidate = function (idx) {
    const candidate = assistedCandidates[idx];
    if (!candidate) return;

    activeMeasurements.push({
      id: Date.now(),
      tool_type: candidate.toolType,
      label: candidate.label,
      measured_value: candidate.measuredValue,
      unit: candidate.unit,
      scale_ratio: candidate.scaleRatio,
      provenance: 'ai_suggested',
      notes: candidate.notes,
      points: candidate.points || [{ x: 300, y: 300 }, { x: 500, y: 300 }]
    });

    assistedCandidates.splice(idx, 1);
    renderScheduleSidebar();
    renderAssistedSidebar();
    redraw();

    // Trigger verification dialog
    window.openVerificationModal(activeMeasurements.length - 1);
  };

  // Open Verification Modal
  window.openVerificationModal = function (idx) {
    const item = activeMeasurements[idx];
    if (!item) return;

    selectedMeasurementForVerif = idx;
    document.getElementById('verifItemLabel').textContent = item.label;
    document.getElementById('verifItemQty').textContent = `${item.measured_value.toFixed(2)} ${item.unit}`;
    document.getElementById('verifItemScale').textContent = item.scale_ratio;
    document.getElementById('verifNotesInput').value = `Certified by QS against ${item.scale_ratio} calibrated plan scale bar.`;

    if (verificationModal) verificationModal.style.display = 'flex';
  };

  // Confirm Verification
  btnConfirmVerification?.addEventListener('click', () => {
    if (selectedMeasurementForVerif === null) return;
    const item = activeMeasurements[selectedMeasurementForVerif];
    if (!item) return;

    const notes = document.getElementById('verifNotesInput').value.trim();
    item.provenance = 'verified_approved';
    item.notes = notes || 'Certified by QS.';

    if (verificationModal) verificationModal.style.display = 'none';
    selectedMeasurementForVerif = null;

    renderScheduleSidebar();
    redraw();
  });

  // Delete measurement
  window.deleteMeasurement = function (idx) {
    if (confirm('Delete this measurement annotation?')) {
      activeMeasurements.splice(idx, 1);
      renderScheduleSidebar();
      redraw();
    }
  };

  // Handle Canvas Point-and-Click
  function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / zoomLevel);
    const y = Math.round((e.clientY - rect.top) / zoomLevel);

    const pxPerMeter = SCALE_PIXEL_FACTORS[scaleRatio] || 40;

    if (activeTool === 'linear') {
      tempPoints.push({ x, y });
      hudInfo.textContent = `Point ${tempPoints.length} added. Click second point to complete.`;

      if (tempPoints.length === 2) {
        const dx = tempPoints[1].x - tempPoints[0].x;
        const dy = tempPoints[1].y - tempPoints[0].y;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const distM = parseFloat((distPx / pxPerMeter).toFixed(2));

        activeMeasurements.push({
          id: Date.now(),
          tool_type: 'linear',
          label: `Wall / Span Measurement (${scaleRatio})`,
          measured_value: distM,
          unit: 'm',
          scale_ratio: scaleRatio,
          provenance: 'manual',
          notes: 'Manually drawn on plan.',
          points: [...tempPoints]
        });

        tempPoints = [];
        hudInfo.textContent = `Measured: ${distM} m. Ready for next line.`;
        renderScheduleSidebar();
        redraw();
      } else {
        redraw();
      }

    } else if (activeTool === 'area') {
      tempPoints.push({ x, y });
      hudInfo.textContent = `Point ${tempPoints.length} added. Double-click or add 4th point to complete.`;

      if (tempPoints.length >= 4) {
        // Approximate rectangular area
        const minX = Math.min(...tempPoints.map(p => p.x));
        const maxX = Math.max(...tempPoints.map(p => p.x));
        const minY = Math.min(...tempPoints.map(p => p.y));
        const maxY = Math.max(...tempPoints.map(p => p.y));

        const wM = (maxX - minX) / pxPerMeter;
        const hM = (maxY - minY) / pxPerMeter;
        const areaM2 = parseFloat((wM * hM).toFixed(2));

        activeMeasurements.push({
          id: Date.now(),
          tool_type: 'area',
          label: `Zone / Floor Area Take-Off (${scaleRatio})`,
          measured_value: areaM2,
          unit: 'm²',
          scale_ratio: scaleRatio,
          provenance: 'manual',
          notes: 'Manually bounded floor area.',
          points: [...tempPoints]
        });

        tempPoints = [];
        hudInfo.textContent = `Measured Area: ${areaM2} m². Ready.`;
        renderScheduleSidebar();
        redraw();
      } else {
        redraw();
      }

    } else if (activeTool === 'count') {
      activeMeasurements.push({
        id: Date.now(),
        tool_type: 'count',
        label: `Count Item #${activeMeasurements.length + 1} (Door / Fitting)`,
        measured_value: 1.00,
        unit: 'nr',
        scale_ratio: scaleRatio,
        provenance: 'manual',
        notes: 'Discrete component placed on plan.',
        points: [{ x, y }]
      });

      hudInfo.textContent = `Count marker placed at (${x}, ${y}).`;
      renderScheduleSidebar();
      redraw();
    }
  }

  // Export to BOQ Builder
  function exportToBOQ() {
    const approved = activeMeasurements.filter(m => m.provenance === 'verified_approved');
    if (approved.length === 0) {
      alert('RICS Governance Requirement:\n\nNo measurements have been certified by a Quantity Surveyor yet.\nPlease click "Certify (QS)" on your measurements before exporting to official contract bills.');
      return;
    }

    const boqItems = approved.map((ann, idx) => ({
      id: `cad-${ann.id}`,
      category: ann.tool_type === 'linear' ? 'Structural Work' : ann.tool_type === 'area' ? 'Finishes' : 'Fittings',
      itemNo: `${idx + 1}.1`,
      description: `${ann.label} (${ann.scale_ratio} verified)`,
      unit: ann.unit,
      quantity: ann.measured_value,
      unitRate: ann.unit === 'm²' ? 42.00 : ann.unit === 'm' ? 88.00 : 280.00
    }));

    try {
      localStorage.setItem('orion_imported_boq_items', JSON.stringify(boqItems));
    } catch (e) {
      // Ignore
    }

    if (confirm(`Successfully prepared ${approved.length} certified items for the Bill of Quantities!\n\nWould you like to open the BOQ Builder now to price and export these items?`)) {
      window.location.href = 'boq-builder.html?from=workspace';
    }
  }

  // Setup Event Listeners
  function setupWorkspaceEvents() {
    // Tool buttons
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTool = btn.dataset.tool;
        hudTool.textContent = activeTool.toUpperCase();
        tempPoints = [];
        redraw();
      });
    });

    // Scale selector
    const scaleSelect = document.getElementById('scaleRatioSelect');
    scaleSelect?.addEventListener('change', () => {
      scaleRatio = scaleSelect.value;
      hudScale.textContent = scaleRatio;
      redraw();
    });

    // Zoom buttons
    document.getElementById('btnZoomIn')?.addEventListener('click', () => {
      zoomLevel = Math.min(zoomLevel + 0.2, 2.5);
      canvas.style.transform = `scale(${zoomLevel})`;
      zoomText.textContent = `${Math.round(zoomLevel * 100)}%`;
    });

    document.getElementById('btnZoomOut')?.addEventListener('click', () => {
      zoomLevel = Math.max(zoomLevel - 0.2, 0.6);
      canvas.style.transform = `scale(${zoomLevel})`;
      zoomText.textContent = `${Math.round(zoomLevel * 100)}%`;
    });

    document.getElementById('btnZoomReset')?.addEventListener('click', () => {
      zoomLevel = 1.0;
      canvas.style.transform = 'scale(1)';
      zoomText.textContent = '100%';
    });

    // Clear Canvas
    document.getElementById('btnClearCanvas')?.addEventListener('click', () => {
      if (confirm('Clear all measurement annotations on this plan?')) {
        activeMeasurements = [];
        tempPoints = [];
        renderScheduleSidebar();
        redraw();
      }
    });

    // Canvas click
    canvas.addEventListener('click', handleCanvasClick);

    // Sidebar Tabs
    tabBtnSchedule?.addEventListener('click', () => {
      tabBtnSchedule.classList.add('active');
      tabBtnAssisted.classList.remove('active');
      sideTabSchedule.style.display = 'block';
      sideTabAssisted.style.display = 'none';
    });

    tabBtnAssisted?.addEventListener('click', () => {
      tabBtnAssisted.classList.add('active');
      tabBtnSchedule.classList.remove('active');
      sideTabAssisted.style.display = 'block';
      sideTabSchedule.style.display = 'none';
    });

    // Detect Candidates
    document.getElementById('btnDetectCandidates')?.addEventListener('click', () => {
      loadAssistedCandidates();
    });

    // Export to BOQ
    document.getElementById('btnExportToBOQ')?.addEventListener('click', exportToBOQ);

    // Close Modal
    btnCloseVerifModal?.addEventListener('click', () => {
      if (verificationModal) verificationModal.style.display = 'none';
    });

    // Plan Upload simulation / handle
    const fileInput = document.getElementById('drawingFileInput');
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        alert(`Plan "${file.name}" received (${(file.size / 1024).toFixed(1)} KB).\nCalibrated against 1:100 architectural scale.`);
        loadSeedMeasurements();
      }
    });
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    setupWorkspaceEvents();
    loadSeedMeasurements();
    loadAssistedCandidates();
  });

})();
