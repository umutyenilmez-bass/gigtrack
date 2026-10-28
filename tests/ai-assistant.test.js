const test = require('node:test');
const assert = require('node:assert');

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

// Mock ActionLogger
global.ActionLogger = {
  getHistory: (limit) => [
    {
      id: 'act1',
      timestamp: '2026-10-28 20:00:00',
      type: 'DELETE_GIG',
      summary: 'Dorock XL (2026-11-01) silindi',
      details: {
        gig: {
          id: 'g1',
          artist: 'Umut',
          venue: 'Dorock XL',
          fee: '15000',
          currency: 'TRY',
          date: '2026-11-01',
          time: '21:30',
          paid: false,
          notes: 'Yedek jak kablosu unutma',
          expenseAmount: '500',
          expenseName: 'Taksi'
        }
      }
    },
    {
      id: 'act2',
      timestamp: '2026-10-28 20:05:00',
      type: 'EDIT_GIG',
      summary: 'Kadıköy Sahne güncellendi',
      details: {
        diff: [{ field: 'fee', from: '10000', to: '12000' }]
      }
    }
  ]
};

const AiAssistant = require('../ai-assistant.js');

test('AiAssistant - API key management', (t) => {
  AiAssistant.removeApiKey();
  assert.strictEqual(AiAssistant.getApiKey(), '');
  assert.strictEqual(AiAssistant.hasApiKey(), false);

  AiAssistant.setApiKey('AIzaSyFakeTestKey123');
  assert.strictEqual(AiAssistant.getApiKey(), 'AIzaSyFakeTestKey123');
  assert.strictEqual(AiAssistant.hasApiKey(), true);

  AiAssistant.removeApiKey();
  assert.strictEqual(AiAssistant.hasApiKey(), false);
});

test('AiAssistant - buildContext creates comprehensive context with gigs, dayNotes, and action log', (t) => {
  const sampleGigs = [
    {
      id: 'gig1',
      artist: 'Umut Band',
      venue: 'IF Performance',
      date: '2026-11-10',
      time: '21:30',
      fee: '20000',
      currency: 'TRY',
      paid: false,
      notes: 'Soundcheck 18:00'
    },
    {
      id: 'gig2',
      artist: 'Akustik Trio',
      venue: 'Blind',
      date: '2026-11-15',
      time: '20:00',
      fee: '15000',
      currency: 'TRY',
      paid: true,
      notes: ''
    }
  ];

  const sampleDayNotes = {
    '2026-11-10': 'Bas gitar bakım günü',
    '2026-11-20': 'Stüdyo prova'
  };

  const context = AiAssistant.buildContext({
    gigs: sampleGigs,
    dayNotes: sampleDayNotes,
    activeYear: '2026'
  });

  // Verify core sections exist
  assert.ok(context.includes('SİSTEM BAĞLAMI VE MEVCUT DURUM'), 'Must have main context header');
  assert.ok(context.includes('IF Performance'), 'Must include gig details');
  assert.ok(context.includes('Akustik Trio'), 'Must include gig details');
  assert.ok(context.includes('Bas gitar bakım günü'), 'Must include day notes');
  assert.ok(context.includes('Dorock XL (2026-11-01) silindi'), 'Must include deleted gig from action log');
  assert.ok(context.includes('Yedek jak kablosu unutma'), 'Must include full deleted gig notes');
  assert.ok(context.includes('Saat: 21:30'), 'Must include deleted gig time');
  assert.ok(context.includes('Tahsil Edilen (Ödenen) Toplam:** 15.000 TRY'), 'Must include paid total breakdown');
  assert.ok(context.includes('Bekleyen Alacaklar Toplamı:** 20.000 TRY'), 'Must include unpaid total breakdown');
  assert.ok(context.includes('EDIT_GIG'), 'Must include edit actions from log');
  assert.ok(context.includes('10000 -> 12000'), 'Must include field diffs');
});

test('AiAssistant - preparePayload builds valid Gemini API payload with strict alternating turns', (t) => {
  const prompt = 'Dün hangi konseri sildim?';
  const history = [
    { role: 'user', text: 'Merhaba' },
    { role: 'assistant', text: 'Merhaba Umut! Nasıl yardımcı olabilirim?' }
  ];
  const context = 'Sistem bağlamı burada';

  const payload = AiAssistant.preparePayload(prompt, history, context);

  assert.ok(payload.systemInstruction, 'Payload must have systemInstruction');
  assert.strictEqual(payload.systemInstruction.parts[0].text.includes(context), true);
  assert.ok(Array.isArray(payload.contents), 'Contents must be array');
  assert.strictEqual(payload.contents.length, 3);
  assert.strictEqual(payload.contents[0].role, 'user');
  assert.strictEqual(payload.contents[1].role, 'model');
  assert.strictEqual(payload.contents[2].role, 'user');
  assert.strictEqual(payload.contents[2].parts[0].text, prompt);

  // Test consecutive user turns are merged or sanitized
  const messyHistory = [
    { role: 'user', text: 'İlk soru' },
    { role: 'user', text: 'İkinci soru (ağ hatası kalıntısı)' }
  ];
  const messyPayload = AiAssistant.preparePayload('Üçüncü soru', messyHistory, context);
  // Verify contents still strictly alternates (no consecutive same roles)
  for (let i = 0; i < messyPayload.contents.length - 1; i++) {
    assert.notStrictEqual(
      messyPayload.contents[i].role,
      messyPayload.contents[i + 1].role,
      'Consecutive roles must never be identical'
    );
  }
});

test('AiAssistant - ask without API key throws expected error', async (t) => {
  AiAssistant.removeApiKey();
  await assert.rejects(
    async () => {
      await AiAssistant.ask('Test soru', [], {});
    },
    {
      message: 'API_KEY_MISSING'
    }
  );
});
