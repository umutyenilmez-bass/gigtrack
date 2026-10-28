const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('UI Structure - index.html should have complete AI Assistant UI and handlers', (t) => {
  const indexHtmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  // 1. Script tag
  assert.ok(
    html.includes('<script src="ai-assistant.js"></script>') ||
    html.includes('<script src="./ai-assistant.js"></script>'),
    'Must include ai-assistant.js script'
  );

  // 2. Header button
  assert.ok(html.includes('id="btnAiAssistant"'), 'Header must contain btnAiAssistant');

  // 3. Drawer elements
  assert.ok(html.includes('id="aiDrawerOverlay"'), 'Must contain aiDrawerOverlay');
  assert.ok(html.includes('id="aiDrawer"'), 'Must contain aiDrawer');
  assert.ok(html.includes('id="aiMessagesContainer"'), 'Must contain aiMessagesContainer');
  assert.ok(html.includes('id="aiPromptInput"'), 'Must contain aiPromptInput');
  assert.ok(html.includes('id="btnAiSend"'), 'Must contain btnAiSend');
  assert.ok(html.includes('id="aiQuickChips"'), 'Must contain aiQuickChips');
  assert.ok(html.includes('id="aiKeySetupArea"'), 'Must contain aiKeySetupArea');

  // 4. Client JS functions
  assert.ok(html.includes('function openAiDrawer'), 'Must define openAiDrawer');
  assert.ok(html.includes('function closeAiDrawer'), 'Must define closeAiDrawer');
  assert.ok(html.includes('function sendAiMessage'), 'Must define sendAiMessage');
  assert.ok(html.includes('function clearAiChat'), 'Must define clearAiChat');
  assert.ok(html.includes('function handleAiChipClick'), 'Must define handleAiChipClick');
});
