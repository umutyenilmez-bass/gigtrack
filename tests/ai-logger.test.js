const test = require('node:test');
const assert = require('node:assert');

// Mock localStorage for testing
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

const mockStorage = new MockLocalStorage();
global.localStorage = mockStorage;

const ActionLogger = require('../ai-logger.js');

test('ActionLogger - should log actions and retrieve history', (t) => {
  ActionLogger.clear();

  const entry = ActionLogger.log('ADD_GIG', 'Konser eklendi: Dorock XL', {
    gig: { id: 'gig1', artist: 'Umut', venue: 'Dorock XL', fee: '15000', currency: 'TRY', date: '2026-11-01' }
  });

  assert.ok(entry.id, 'Entry must have an ID');
  assert.ok(entry.timestamp, 'Entry must have a timestamp');
  assert.strictEqual(entry.type, 'ADD_GIG');
  assert.strictEqual(entry.summary, 'Konser eklendi: Dorock XL');

  const history = ActionLogger.getHistory();
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].id, entry.id);
});

test('ActionLogger - calculateDiff should identify changed fields accurately', (t) => {
  const oldGig = {
    id: 'gig1',
    artist: 'Umut',
    venue: 'Dorock XL',
    date: '2026-11-01',
    time: '21:00',
    fee: '15000',
    currency: 'TRY',
    notes: 'Önemli',
    paid: false
  };

  const newGig = {
    id: 'gig1',
    artist: 'Umut',
    venue: 'Kadıköy Sahne', // changed
    date: '2026-11-02',     // changed
    time: '21:00',
    fee: '18000',          // changed
    currency: 'TRY',
    notes: 'Önemli',
    paid: true             // changed
  };

  const diff = ActionLogger.calculateDiff(oldGig, newGig);
  assert.strictEqual(diff.length, 4);

  const venueChange = diff.find(d => d.field === 'venue');
  assert.deepStrictEqual(venueChange, { field: 'venue', from: 'Dorock XL', to: 'Kadıköy Sahne' });

  const feeChange = diff.find(d => d.field === 'fee');
  assert.deepStrictEqual(feeChange, { field: 'fee', from: '15000', to: '18000' });

  const dateChange = diff.find(d => d.field === 'date');
  assert.deepStrictEqual(dateChange, { field: 'date', from: '2026-11-01', to: '2026-11-02' });

  const paidChange = diff.find(d => d.field === 'paid');
  assert.deepStrictEqual(paidChange, { field: 'paid', from: false, to: true });
});

test('ActionLogger - should enforce FIFO limit of 200 items', (t) => {
  ActionLogger.clear();

  for (let i = 0; i < 220; i++) {
    ActionLogger.log('ADD_GIG', `Item ${i}`, { index: i });
  }

  const history = ActionLogger.getHistory();
  assert.strictEqual(history.length, 200);
  assert.strictEqual(history[0].summary, 'Item 219'); // newest first
  assert.strictEqual(history[199].summary, 'Item 20'); // oldest retained
});
