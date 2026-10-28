const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const drawingEngine = require('../drawing-engine.js');
const { db } = require('../db.js');

describe('Orion Drawing Workspace & Quantity Take-Off Engine Tests (Phase 9)', () => {
  let userId;
  let fileId;

  before(() => {
    // Create dummy user and file_metadata for tests
    const userRes = db.prepare(`
      INSERT INTO users (email, password_hash, role, full_name)
      VALUES (?, 'dummy', 'client', 'Drawing Tester')
    `).run(`drawing.tester.${Date.now()}@example.co.uk`);
    userId = userRes.lastInsertRowid;

    const fileRes = db.prepare(`
      INSERT INTO file_metadata (user_id, original_name, stored_name, file_path, file_size, mime_type)
      VALUES (?, 'GroundFloorExtension_RevA.pdf', 'stored.pdf', '/tmp/stored.pdf', 1024, 'application/pdf')
    `).run(userId);
    fileId = fileRes.lastInsertRowid;
  });

  test('saveAnnotation creates valid annotation with toolType and scaleRatio', () => {
    const ann = drawingEngine.saveAnnotation({
      fileId,
      userId,
      pageNumber: 1,
      toolType: 'linear',
      label: 'Rear Extension External Wall Length',
      measuredValue: 12.5,
      unit: 'm',
      scaleRatio: '1:100',
      provenance: 'manual',
      notes: 'Measured between Grid 1 and Grid 3'
    });

    assert.ok(ann.id > 0);
    assert.equal(ann.tool_type, 'linear');
    assert.equal(ann.measured_value, 12.5);
    assert.equal(ann.unit, 'm');
    assert.equal(ann.provenance, 'manual');
  });

  test('getAnnotationsForFile enforces user tenant boundaries', () => {
    const userAnnotations = drawingEngine.getAnnotationsForFile(fileId, userId, false);
    assert.ok(userAnnotations.length > 0);

    // Another user querying the same file should get empty
    const otherUserAnnotations = drawingEngine.getAnnotationsForFile(fileId, 999999, false);
    assert.equal(otherUserAnnotations.length, 0);
  });

  test('generateAssistedCandidates produces candidate items flagged with ai_suggested provenance', () => {
    const fileMeta = db.prepare('SELECT * FROM file_metadata WHERE id = ?').get(fileId);
    const candidates = drawingEngine.generateAssistedCandidates(fileMeta, '1:100');

    assert.ok(Array.isArray(candidates));
    assert.ok(candidates.length > 0);
    candidates.forEach(c => {
      assert.equal(c.provenance, 'ai_suggested');
      assert.ok(c.notes.includes('Requires QS') || c.notes.includes('detected'));
    });
  });

  test('updateAnnotationStatus updates provenance to verified_approved and exportApprovedAnnotationsToBOQ works', () => {
    // Add an area annotation
    const ann = drawingEngine.saveAnnotation({
      fileId,
      userId,
      pageNumber: 1,
      toolType: 'area',
      label: 'Kitchen Concrete Floor Slab',
      measuredValue: 48.0,
      unit: 'm²',
      scaleRatio: '1:100',
      provenance: 'ai_suggested'
    });

    // Approve the measurement
    const approved = drawingEngine.updateAnnotationStatus(ann.id, userId, 'verified_approved', 'QS signed off against 1:100 scale bar');
    assert.equal(approved.provenance, 'verified_approved');

    // Export to BOQ
    const boqItems = drawingEngine.exportApprovedAnnotationsToBOQ(fileId, userId);
    assert.ok(boqItems.length > 0);
    const item = boqItems.find(i => i.description.includes('Kitchen Concrete Floor Slab'));
    assert.ok(item);
    assert.equal(item.quantity, 48.0);
    assert.equal(item.unit, 'm²');
  });
});
