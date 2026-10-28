/**
 * Orion Build Cost - Sequential Test Suite Runner
 * Runs each test suite in an isolated Node process to prevent SQLite file lock contention.
 */

const { execSync } = require('child_process');

const testSuites = [
  'tests/estimating-engine.test.js',
  'tests/boq-export.test.js',
  'tests/pricing-db.test.js',
  'tests/drawing-takeoff.test.js',
  'tests/database-auth.test.js',
  'tests/server-api.test.js'
];

console.log('====================================================');
console.log('ORION BUILD COST — SYSTEM VERIFICATION TEST RUNNER');
console.log('====================================================');

let passedCount = 0;
let failedCount = 0;

for (const suite of testSuites) {
  process.stdout.write(`\n▶ Executing: ${suite}... `);
  try {
    const startTime = Date.now();
    execSync(`node --test ${suite}`, { stdio: 'pipe' });
    const elapsed = Date.now() - startTime;
    console.log(`PASSED (${elapsed}ms)`);
    passedCount++;
  } catch (err) {
    console.log('FAILED');
    console.error(err.stdout ? err.stdout.toString() : err.message);
    failedCount++;
  }
}

console.log('\n====================================================');
console.log(`Summary: ${passedCount} suites passed, ${failedCount} suites failed.`);
console.log('====================================================');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('All 6 test suites passed with 100% success rate.');
  process.exit(0);
}
