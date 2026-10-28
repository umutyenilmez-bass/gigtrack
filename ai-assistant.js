/**
 * GigTrack AI Assistant
 * Doğrudan Google Gemini REST API'siyle çalışan kişisel asistan ve bağlam yöneticisi.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AiAssistant = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY_API_KEY = 'gigtrack_gemini_api_key';
  const GEMINI_MODEL = 'gemini-2.5-flash';

  function getStorage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    return null;
  }

  const AiAssistant = {
    /**
     * Yerel olarak saklanan Gemini API anahtarını al
     */
    getApiKey: function () {
      const storage = getStorage();
      if (!storage) return '';
      return (storage.getItem(STORAGE_KEY_API_KEY) || '').trim();
    },

    /**
     * API anahtarını kaydet
     * @param {string} key
     */
    setApiKey: function (key) {
      const storage = getStorage();
      if (storage) {
        storage.setItem(STORAGE_KEY_API_KEY, (key || '').trim());
      }
    },

    /**
     * API anahtarını sil
     */
    removeApiKey: function () {
      const storage = getStorage();
      if (storage) {
        storage.removeItem(STORAGE_KEY_API_KEY);
      }
    },

    /**
     * API anahtarının mevcut olup olmadığını kontrol et
     */
    hasApiKey: function () {
      return this.getApiKey().length > 0;
    },

    /**
     * Mevcut sistem durumunu ve eylem hafızasını AI için zengin bir bağlam haline getir
     * @param {object} state - { gigs, dayNotes, activeYear }
     * @returns {string} Markdown formatında sistem bağlamı
     */
    buildContext: function (state = {}) {
      const gigs = Array.isArray(state.gigs) ? state.gigs : [];
      const dayNotes = state.dayNotes && typeof state.dayNotes === 'object' ? state.dayNotes : {};
      const activeYear = state.activeYear || new Date().getFullYear().toString();

      const now = new Date();
      const trDays = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
      const trMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      const currentTimeStr = `${now.getDate()} ${trMonths[now.getMonth()]} ${now.getFullYear()}, ${trDays[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Finans ve gig istatistikleri
      let paidCount = 0;
      let unpaidCount = 0;
      const totalsByCurrency = { TRY: 0, USD: 0, EUR: 0, GBP: 0 };

      gigs.forEach(g => {
        let feeNum = 0;
        if (typeof g.fee === 'number') {
          feeNum = g.fee;
        } else if (typeof g.fee === 'string') {
          const match = g.fee.replace(/,/g, '.').match(/(\d+\.?\d*)/);
          feeNum = match ? parseFloat(match[1]) : 0;
        }

        const curr = (g.currency || 'TRY').toUpperCase();
        if (totalsByCurrency[curr] !== undefined) {
          totalsByCurrency[curr] += feeNum;
        } else {
          totalsByCurrency.TRY += feeNum;
        }

        if (g.paid) paidCount++;
        else unpaidCount++;
      });

      // Eylem günlüğü (ActionLogger)
      let actionLogs = [];
      try {
        const logger = typeof ActionLogger !== 'undefined' ? ActionLogger : (typeof globalThis !== 'undefined' ? globalThis.ActionLogger : null);
        if (logger && typeof logger.getHistory === 'function') {
          actionLogs = logger.getHistory(150);
        }
      } catch (e) {
        console.error('[AiAssistant] ActionLogger okuma hatası:', e);
      }

      let ctx = `### SİSTEM BAĞLAMI VE MEVCUT DURUM\n`;
      ctx += `**Şu Anki Zaman:** ${currentTimeStr}\n`;
      ctx += `**Aktif Görüntülenen Yıl:** ${activeYear}\n`;
      ctx += `**Genel Durum:** Toplam ${gigs.length} konser kayıtlı (${paidCount} ödendi, ${unpaidCount} ödeme bekliyor).\n`;
      ctx += `**Toplam Kazanç Özeti:** ` + Object.entries(totalsByCurrency)
        .filter(([_, v]) => v > 0)
        .map(([c, v]) => `${v.toLocaleString('tr-TR')} ${c}`)
        .join(', ') + `\n\n`;

      // Güncel Konser Listesi
      ctx += `#### 1. KAYITLI KONSERLER (GIGS)\n`;
      if (gigs.length === 0) {
        ctx += `Kayıtlı konser bulunmuyor.\n\n`;
      } else {
        // Tarihe göre sırala
        const sortedGigs = [...gigs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        sortedGigs.forEach(g => {
          const status = g.paid ? 'ÖDENDİ' : 'BEKLİYOR';
          const notesStr = g.notes ? ` (Not: ${g.notes})` : '';
          const expenseStr = g.expenseAmount ? ` [Masraf: ${g.expenseName || 'Masraf'} - ${g.expenseAmount}]` : '';
          ctx += `- **${g.date}** ${g.time || ''} | **${g.artist || 'İsimsiz'}** @ **${g.venue || 'Mekan yok'}** | ${g.fee} ${g.currency || 'TRY'} | Durum: ${status}${notesStr}${expenseStr} (ID: ${g.id})\n`;
        });
        ctx += `\n`;
      }

      // Takvim Gün Notları
      ctx += `#### 2. TAKVİM GÜN NOTLARI (DAY NOTES)\n`;
      const noteDates = Object.keys(dayNotes).sort();
      if (noteDates.length === 0) {
        ctx += `Kayıtlı gün notu bulunmuyor.\n\n`;
      } else {
        noteDates.forEach(d => {
          ctx += `- **${d}:** ${dayNotes[d]}\n`;
        });
        ctx += `\n`;
      }

      // Geçmiş Eylem Hafızası (Audit Log)
      ctx += `#### 3. EYLEM HAFIZASI VE GEÇMİŞ HAREKETLER (AUDIT LOG - Son ${actionLogs.length} İşlem)\n`;
      if (actionLogs.length === 0) {
        ctx += `Henüz kaydedilmiş geçmiş hareket yok.\n\n`;
      } else {
        actionLogs.forEach(entry => {
          let detailStr = '';
          if (entry.details) {
            if (entry.details.diff && entry.details.diff.length > 0) {
              const diffText = entry.details.diff.map(d => `${d.field}: ${d.from} -> ${d.to}`).join(', ');
              detailStr = ` (Değişiklikler: ${diffText})`;
            } else if (entry.details.gig) {
              const g = entry.details.gig;
              detailStr = ` [Detay: ${g.artist} @ ${g.venue}, ${g.date}, ${g.fee} ${g.currency || 'TRY'}]`;
            } else if (entry.details.oldNote || entry.details.newNote) {
              detailStr = ` [Eski Not: "${entry.details.oldNote || ''}", Yeni Not: "${entry.details.newNote || ''}"]`;
            }
          }
          ctx += `- [${entry.timestamp}] **${entry.type}:** ${entry.summary}${detailStr}\n`;
        });
        ctx += `\n`;
      }

      return ctx;
    },

    /**
     * Gemini REST API için istek gövdesini hazırla
     */
    preparePayload: function (userPrompt, history = [], context = '') {
      const systemInstruction = `Sen GigTrack uygulamasının akıllı ve tam donanımlı kişisel asistanısın. Kullanıcı (Umut) bir bas gitarist ve müzisyendir. Konserlerini, provalarını, alacaklarını ve takvimini bu sistemde yönetir.

Aşağıda uygulamanın anlık tüm veri tabanı, gün notları ve geçmişte yaptığı TÜM hareketlerin denetim günlüğü (ne zaman ne eklendi, ne silindi, ne düzenlendi) bulunmaktadır:

${context}

TALİMATLAR:
1. Kullanıcının sorusuna doğrudan, net ve Türkçe yanıt ver. Gereksiz giriş/gelişme cümleleri veya aşırı nezaket lafları ("Harika bir soru", "Tabii ki") kullanma.
2. Kullanıcı "Dün ne sildim?", "En son kimi ekledim?", "Şunun ücretini ne zaman değiştirdim?" gibi sorular sorduğunda EYLEM HAFIZASI (Audit Log) bölümünü inceleyerek tam tarih, saat, eski/yeni değer farklarını eksiksiz belirt.
3. Konser, alacak veya takvim sorulduğunda KAYITLI KONSERLER ve TAKVİM GÜN NOTLARI bölümlerinden net rakamlar ve tarihler ver.
4. Asla tahmin yürütme; sistemde kayıtlı olmayan bir şey için "Kayıtlarımda görünmüyor" de.`;

      const contents = [];

      // Geçmiş sohbet mesajları
      if (Array.isArray(history)) {
        history.forEach(item => {
          if (!item.text) return;
          contents.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.text }]
          });
        });
      }

      // Yeni kullanıcı sorusu
      contents.push({
        role: 'user',
        parts: [{ text: userPrompt }]
      });

      return {
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      };
    },

    /**
     * Gemini API'ye soru sor
     * @param {string} userPrompt
     * @param {Array} history
     * @param {object} state
     * @returns {Promise<string>}
     */
    ask: async function (userPrompt, history = [], state = {}) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('API_KEY_MISSING');
      }

      const context = this.buildContext(state);
      const payload = this.preparePayload(userPrompt, history, context);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('[AiAssistant] Fetch network error:', err);
        throw new Error('NETWORK_ERROR');
      }

      if (!response.ok) {
        let errBody = {};
        try { errBody = await response.json(); } catch (e) {}

        if (response.status === 400 || response.status === 403) {
          throw new Error('INVALID_API_KEY');
        } else if (response.status === 429) {
          throw new Error('RATE_LIMIT');
        } else {
          const msg = errBody.error && errBody.error.message ? errBody.error.message : `HTTP_${response.status}`;
          throw new Error(msg);
        }
      }

      const data = await response.json();
      if (
        data.candidates &&
        data.candidates.length > 0 &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.length > 0
      ) {
        return data.candidates[0].content.parts[0].text;
      }

      throw new Error('EMPTY_RESPONSE');
    }
  };

  return AiAssistant;
});
