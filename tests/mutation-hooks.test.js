const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Mutation Hooks - index.html should load ai-logger.js and hook into mutation functions', (t) => {
  const indexHtmlPath = path.join(__dirname, '..', 'index.html');
  const content = fs.readFileSync(indexHtmlPath, 'utf8');

  // Verify script tag is included
  assert.ok(
    content.includes('<script src="ai-logger.js"></script>') ||
    content.includes('<script src="./ai-logger.js"></script>'),
    'index.html must include ai-logger.js script tag'
  );

  // Verify saveGig hooks
  assert.ok(
    content.includes("ActionLogger.log('ADD_GIG'") || content.includes('ActionLogger.log("ADD_GIG"'),
    'saveGig must call ActionLogger.log for ADD_GIG'
  );
  assert.ok(
    content.includes("ActionLogger.log('EDIT_GIG'") || content.includes('ActionLogger.log("EDIT_GIG"'),
    'saveGig must call ActionLogger.log for EDIT_GIG with diff'
  );

  // Verify confirmDelete hook
  assert.ok(
    content.includes("ActionLogger.log('DELETE_GIG'") || content.includes('ActionLogger.log("DELETE_GIG"'),
    'confirmDelete must call ActionLogger.log for DELETE_GIG'
  );

  // Verify togglePaidStatus hook
  assert.ok(
    content.includes("ActionLogger.log('TOGGLE_PAID'") || content.includes('ActionLogger.log("TOGGLE_PAID"'),
    'togglePaidStatus must call ActionLogger.log for TOGGLE_PAID'
  );

  // Verify day note hooks
  assert.ok(
    content.includes("ActionLogger.log('SAVE_NOTE'") || content.includes('ActionLogger.log("SAVE_NOTE"'),
    'saveDayNote must call ActionLogger.log for SAVE_NOTE'
  );
  assert.ok(
    content.includes("ActionLogger.log('DELETE_NOTE'") || content.includes('ActionLogger.log("DELETE_NOTE"'),
    'deleteDayNote must call ActionLogger.log for DELETE_NOTE'
  );
});
