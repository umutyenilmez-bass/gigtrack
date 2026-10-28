const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Mock localStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new MockLocalStorage();
const ActionLogger = require('../ai-logger.js');
global.ActionLogger = ActionLogger;
const AiAssistant = require('../ai-assistant.js');

test('E2E - Settings integration in index.html', (t) => {
  const indexHtmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  // Verify openSettings renders Gemini API card
  assert.ok(html.includes('Gemini API Anahtarı') || html.includes('Gemini API Key'), 'Settings must include Gemini API section');
  assert.ok(html.includes('saveGeminiKeyFromSettings'), 'Settings must include save function');
  assert.ok(html.includes('deleteGeminiKeyFromSettings'), 'Settings must include delete function');
});

test('E2E - End-to-end memory and context simulation', (t) => {
  ActionLogger.clear();
  AiAssistant.setApiKey('AIzaSyTest_RealKeySimulation_12345');
  assert.strictEqual(AiAssistant.hasApiKey(), true);

  // 1. Simulate ADD_GIG
  const gig1 = { id: 'g1', artist: 'Duman', venue: 'Bostancı Gösteri Merkezi', date: '2026-11-20', time: '21:00', fee: '50000', currency: 'TRY', paid: false };
  ActionLogger.log('ADD_GIG', 'Duman konseri eklendi', { id: 'g1', gig: gig1 });

  // 2. Simulate EDIT_GIG
  const oldGig2 = { id: 'g2', artist: 'Mor ve Ötesi', venue: 'KüçükÇiftlik Park', date: '2026-11-25', fee: '40000', currency: 'TRY' };
  const newGig2 = { id: 'g2', artist: 'Mor ve Ötesi', venue: 'KüçükÇiftlik Park', date: '2026-11-26', fee: '60000', currency: 'TRY' };
  const diff = ActionLogger.calculateDiff(oldGig2, newGig2);
  ActionLogger.log('EDIT_GIG', 'Mor ve Ötesi güncellendi', { id: 'g2', diff });

  // 3. Simulate DELETE_GIG
  const deletedGig = { id: 'g3', artist: 'Silinen Grup', venue: 'Kadıköy Sahne', date: '2026-10-30', fee: '15000', currency: 'TRY' };
  ActionLogger.log('DELETE_GIG', 'Silinen Grup konseri silindi', { id: 'g3', gig: deletedGig });

  // 4. Simulate DAY_NOTE
  const dayNotes = { '2026-11-20': 'Soundcheck 16:00, yedek bas gitar teli al' };

  // 5. Build AI Context
  const context = AiAssistant.buildContext({
    gigs: [gig1, newGig2],
    dayNotes: dayNotes,
    activeYear: '2026'
  });

  // Verify memory recall
  assert.ok(context.includes('Duman'), 'Must contain active gig');
  assert.ok(context.includes('fee: 40000 -> 60000'), 'Must contain edited diff');
  assert.ok(context.includes('Silinen Grup'), 'Must contain deleted gig in audit log');
  assert.ok(context.includes('yedek bas gitar teli al'), 'Must contain calendar day notes');
});

test('E2E - Security check: No hardcoded Gemini API keys in AI files', (t) => {
  const rootDir = path.join(__dirname, '..');
  const filesToCheck = ['index.html', 'ai-logger.js', 'ai-assistant.js'];

  const geminiKeyRegex = /AIzaSy[0-9A-Za-z-_]{33}/;

  filesToCheck.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.strictEqual(
        geminiKeyRegex.test(content),
        false,
        `File ${file} must NOT contain real hardcoded Google API keys`
      );
    }
  });
});
