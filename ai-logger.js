/**
 * GigTrack AI Action Logger
 * Tüm konser, takvim ve not değişikliklerini hafızaya alır.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ActionLogger = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'gigtrack_action_log';
  const MAX_ENTRIES = 200;

  function getStorage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    return null;
  }

  function getRawLog() {
    const storage = getStorage();
    if (!storage) return [];
    try {
      const data = storage.getItem(STORAGE_KEY);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[ActionLogger] Parse error, resetting log:', e);
      return [];
    }
  }

  function saveRawLog(entries) {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.error('[ActionLogger] Save error:', e);
    }
  }

  function formatTimestamp(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const ActionLogger = {
    /**
     * Eylem kaydet
     * @param {'ADD_GIG' | 'EDIT_GIG' | 'DELETE_GIG' | 'TOGGLE_PAID' | 'SAVE_NOTE' | 'DELETE_NOTE' | 'UNDO'} type
     * @param {string} summary
     * @param {object} details
     */
    log: function (type, summary, details = {}) {
      const entries = getRawLog();
      const entry = {
        id: uid(),
        timestamp: formatTimestamp(),
        type: type,
        summary: summary || '',
        details: details || {}
      };

      // En yeni eylem listenin başında (LIFO / newest first)
      entries.unshift(entry);
      if (entries.length > MAX_ENTRIES) {
        entries.length = MAX_ENTRIES;
      }

      saveRawLog(entries);
      return entry;
    },

    /**
     * Geçmiş eylemleri getir
     * @param {number} [limit=200]
     */
    getHistory: function (limit = 200) {
      const entries = getRawLog();
      return entries.slice(0, limit);
    },

    /**
     * İki konser nesnesi arasındaki farkları tespit et
     * @param {object} oldGig
     * @param {object} newGig
     * @returns {Array<{field: string, from: any, to: any}>}
     */
    calculateDiff: function (oldGig = {}, newGig = {}) {
      const diff = [];
      const fields = ['artist', 'venue', 'date', 'time', 'fee', 'currency', 'repeat', 'notes', 'paid', 'expenseName', 'expenseAmount'];

      fields.forEach(field => {
        const oldVal = oldGig[field] !== undefined ? oldGig[field] : '';
        const newVal = newGig[field] !== undefined ? newGig[field] : '';

        // Boşlukları ve tip uyumunu normalize et
        const sOld = String(oldVal).trim();
        const sNew = String(newVal).trim();

        if (sOld !== sNew) {
          diff.push({
            field: field,
            from: oldVal,
            to: newVal
          });
        }
      });

      return diff;
    },

    /**
     * Günlüğü temizle
     */
    clear: function () {
      const storage = getStorage();
      if (storage) {
        storage.removeItem(STORAGE_KEY);
      }
    }
  };

  return ActionLogger;
});
