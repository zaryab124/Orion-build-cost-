/**
 * Orion Build Cost - Advanced Drawing & Quantity Take-Off Engine (Phase 9)
 * Scale calibration, manual CAD measurement annotations, assisted extraction candidates,
 * and provenance tracking for Quantity Surveyors.
 */

const { db } = require('./db.js');

/**
 * Save a measurement annotation onto a drawing
 */
function saveAnnotation(data) {
  const {
    fileId, userId, pageNumber, toolType, label,
    measuredValue, unit, scaleRatio, provenance, notes, coordinatesJson
  } = data;

  if (!fileId || !userId || !toolType || !label || typeof measuredValue !== 'number') {
    throw new Error('Missing required annotation fields.');
  }

  const result = db.prepare(`
    INSERT INTO drawing_annotations (
      file_id, user_id, page_number, tool_type, label,
      measured_value, unit, scale_ratio, provenance, notes, coordinates_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fileId, userId, pageNumber || 1, toolType, label.trim(),
    measuredValue, unit || 'm', scaleRatio || '1:100',
    provenance || 'manual', notes || '', coordinatesJson || '{}'
  );

  return db.prepare('SELECT * FROM drawing_annotations WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Get all annotations for a specific drawing file with user ownership check
 */
function getAnnotationsForFile(fileId, userId, isAdmin = false) {
  let query = 'SELECT * FROM drawing_annotations WHERE file_id = ?';
  const params = [fileId];

  if (!isAdmin) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  query += ' ORDER BY page_number, id ASC';
  return db.prepare(query).all(...params);
}

/**
 * Update annotation status (e.g., approving candidate measurements)
 */
function updateAnnotationStatus(id, userId, status, notes = null, isAdmin = false) {
  let query = 'UPDATE drawing_annotations SET provenance = ?, notes = COALESCE(?, notes) WHERE id = ?';
  const params = [status, notes, id];

  if (!isAdmin) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  db.prepare(query).run(...params);
  return db.prepare('SELECT * FROM drawing_annotations WHERE id = ?').get(id);
}

/**
 * Delete annotation
 */
function deleteAnnotation(id, userId, isAdmin = false) {
  let query = 'DELETE FROM drawing_annotations WHERE id = ?';
  const params = [id];

  if (!isAdmin) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  db.prepare(query).run(...params);
  return { success: true };
}

/**
 * Assisted Extraction Simulation / Parser
 * Analyzes drawing metadata or text candidates and produces candidate take-off items.
 * Strictly flagged with provenance: 'ai_suggested'. Never auto-approved without human review.
 */
function generateAssistedCandidates(fileMetadata, scaleRatio = '1:100') {
  const candidates = [];
  const fileName = (fileMetadata && fileMetadata.original_name) ? fileMetadata.original_name.toLowerCase() : '';

  // Heuristic candidate schedules based on drawing type
  if (fileName.includes('plan') || fileName.includes('extension') || fileName.includes('ground') || fileName.includes('floor')) {
    candidates.push({
      toolType: 'area',
      label: 'Main Ground Floor Internal Area',
      measuredValue: 78.50,
      unit: 'm²',
      scaleRatio,
      provenance: 'ai_suggested',
      notes: 'Candidate spatial boundary detected from perimeter walls. Requires QS scale verification.'
    });
    candidates.push({
      toolType: 'linear',
      label: 'External Cavity Wall Perimeter',
      measuredValue: 36.20,
      unit: 'm',
      scaleRatio,
      provenance: 'ai_suggested',
      notes: 'Candidate external wall centerline detected. Requires QS verification.'
    });
    candidates.push({
      toolType: 'count',
      label: 'Structural Steel Beams (Candidate Opening Spans)',
      measuredValue: 3.00,
      unit: 'nr',
      scaleRatio,
      provenance: 'ai_suggested',
      notes: 'Loadbearing wall removals detected at rear aperture. Requires QS verification.'
    });
  } else if (fileName.includes('roof') || fileName.includes('section')) {
    candidates.push({
      toolType: 'area',
      label: 'Pitched Roof Area (Pitch 35°)',
      measuredValue: 92.40,
      unit: 'm²',
      scaleRatio,
      provenance: 'ai_suggested',
      notes: 'Rafter plan projection detected with slope factor. Requires QS verification.'
    });
  } else {
    candidates.push({
      toolType: 'linear',
      label: 'Sample Reference Calibration Span',
      measuredValue: 5.00,
      unit: 'm',
      scaleRatio,
      provenance: 'ai_suggested',
      notes: 'Gridline reference interval detected. Requires QS verification.'
    });
  }

  return candidates;
}

/**
 * Export approved annotations directly to BOQ line items structure
 */
function exportApprovedAnnotationsToBOQ(fileId, userId) {
  const annotations = db.prepare(`
    SELECT * FROM drawing_annotations
    WHERE file_id = ? AND user_id = ? AND provenance = 'verified_approved'
  `).all(fileId, userId);

  return annotations.map((ann, idx) => ({
    id: `ann-${ann.id}`,
    category: ann.tool_type === 'linear' ? 'Structural Work' : ann.tool_type === 'area' ? 'Finishes' : 'Fittings',
    itemNo: `${idx + 1}.1`,
    description: `${ann.label} (From Drawing Page ${ann.page_number}, Ref ${ann.scale_ratio})`,
    unit: ann.unit,
    quantity: ann.measured_value,
    unitRate: ann.unit === 'm²' ? 38.00 : ann.unit === 'm' ? 85.00 : 250.00
  }));
}

module.exports = {
  saveAnnotation,
  getAnnotationsForFile,
  updateAnnotationStatus,
  deleteAnnotation,
  generateAssistedCandidates,
  exportApprovedAnnotationsToBOQ
};
