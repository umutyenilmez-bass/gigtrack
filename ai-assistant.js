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
  const STORAGE_KEY_MODEL = 'gigtrack_gemini_active_model';

  // GigSync ile birebir uyumlu çoklu model yedekleme sırası
  const CANDIDATE_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-pro-latest',
    'gemini-3.8-flash'
  ];
  const DEFAULT_GEMINI_MODEL = CANDIDATE_MODELS[0];

  function getStorage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    return null;
  }

  const AiAssistant = {
    DEFAULT_MODEL: DEFAULT_GEMINI_MODEL,
    CANDIDATE_MODELS: CANDIDATE_MODELS,

    /**
     * Yerel olarak saklanan Gemini API anahtarını al
     */
    getApiKey: function () {
      const storage = getStorage();
      if (!storage) return '';
      return (storage.getItem(STORAGE_KEY_API_KEY) || '').trim();
    },

    /**
     * API anahtarını kaydet ve model önbelleğini sıfırla
     * @param {string} key
     */
    setApiKey: function (key) {
      const storage = getStorage();
      if (storage) {
        storage.setItem(STORAGE_KEY_API_KEY, (key || '').trim());
        storage.removeItem(STORAGE_KEY_MODEL);
      }
    },

    /**
     * API anahtarını sil
     */
    removeApiKey: function () {
      const storage = getStorage();
      if (storage) {
        storage.removeItem(STORAGE_KEY_API_KEY);
        storage.removeItem(STORAGE_KEY_MODEL);
      }
    },

    /**
     * API anahtarının mevcut olup olmadığını kontrol et
     */
    hasApiKey: function () {
      return this.getApiKey().length > 0;
    },

    /**
     * Kullanıcının API anahtarına tanımlı ve generateContent destekleyen aktif modelleri sorgular.
     * Google ModelService.ListModels endpoint'ini kullanarak geçerli modeli dinamik tespit eder.
     * @param {string} [apiKey]
     * @returns {Promise<string>}
     */
    detectModel: async function (apiKey) {
      const key = (apiKey || this.getApiKey()).trim();
      if (!key) return DEFAULT_GEMINI_MODEL;

      const storage = getStorage();
      if (storage) {
        const cached = storage.getItem(STORAGE_KEY_MODEL);
        // Eski kullanımdan kalkan modelleri önbellekten temizle
        if (cached && !['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash'].includes(cached) && cached.trim().length > 0) {
          return cached;
        }
      }

      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const tid = controller ? setTimeout(() => controller.abort(), 6000) : null;
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
        const res = await fetch(listUrl, {
          signal: controller ? controller.signal : undefined
        });
        if (tid) clearTimeout(tid);

        if (res && res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.models)) {
            const viable = data.models
              .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
              .map(m => (m.name || '').replace(/^models\//, ''))
              .filter(Boolean);

            if (viable.length > 0) {
              // CANDIDATE_MODELS sırasına göre mevcut olan ilkini seç
              const chosen = CANDIDATE_MODELS.find(cm => viable.includes(cm)) ||
                             viable.find(m => m.includes('flash')) ||
                             viable.find(m => m.includes('gemini')) ||
                             viable[0];
              if (chosen) {
                if (storage) {
                  storage.setItem(STORAGE_KEY_MODEL, chosen);
                }
                return chosen;
              }
            }
          }
        }
      } catch (e) {
        console.warn('[AiAssistant] ListModels dinamik tespiti atlandı:', e);
      }

      return DEFAULT_GEMINI_MODEL;
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
      const paidTotals = { TRY: 0, USD: 0, EUR: 0, GBP: 0 };
      const unpaidTotals = { TRY: 0, USD: 0, EUR: 0, GBP: 0 };

      gigs.forEach(g => {
        let feeNum = 0;
        if (typeof g.fee === 'number') {
          feeNum = g.fee;
        } else if (typeof g.fee === 'string') {
          const match = g.fee.replace(/,/g, '.').match(/(\d+\.?\d*)/);
          feeNum = match ? parseFloat(match[1]) : 0;
        }

        const curr = (g.currency || 'TRY').toUpperCase();
        if (g.paid) {
          paidCount++;
          paidTotals[curr] = (paidTotals[curr] || 0) + feeNum;
        } else {
          unpaidCount++;
          unpaidTotals[curr] = (unpaidTotals[curr] || 0) + feeNum;
        }
      });

      function formatCurrencyMap(map) {
        const list = Object.entries(map).filter(([_, v]) => v > 0);
        return list.length > 0 ? list.map(([c, v]) => `${v.toLocaleString('tr-TR')} ${c}`).join(' · ') : '0 TRY';
      }

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
      ctx += `**Tahsil Edilen (Ödenen) Toplam:** ${formatCurrencyMap(paidTotals)}\n`;
      ctx += `**Bekleyen Alacaklar Toplamı:** ${formatCurrencyMap(unpaidTotals)}\n\n`;

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
              const timeStr = g.time ? ` Saat: ${g.time}` : '';
              const paidStr = g.paid ? ' [Ödendi]' : ' [Bekliyor]';
              const noteStr = g.notes ? ` (Not: ${g.notes})` : '';
              const expenseStr = g.expenseAmount ? ` [Masraf: ${g.expenseName || 'Masraf'} - ${g.expenseAmount}]` : '';
              detailStr = ` [Detay: ${g.artist} @ ${g.venue}, ${g.date}${timeStr}, ${g.fee} ${g.currency || 'TRY'}${paidStr}${noteStr}${expenseStr}]`;
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
      let lastRole = null;

      // Geçmiş sohbet mesajlarını ardışık aynı rol gelmeyecek şekilde normalize et
      if (Array.isArray(history)) {
        history.forEach(item => {
          if (!item.text) return;
          const role = item.role === 'assistant' ? 'model' : 'user';
          if (role !== lastRole) {
            contents.push({
              role: role,
              parts: [{ text: item.text }]
            });
            lastRole = role;
          } else if (contents.length > 0) {
            // Aynı rol ardışık gelirse birleştir
            contents[contents.length - 1].parts[0].text += '\n' + item.text;
          }
        });
      }

      // Yeni kullanıcı sorusunu ekle
      if (lastRole === 'user' && contents.length > 0) {
        contents[contents.length - 1].parts[0].text += '\n' + userPrompt;
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: userPrompt }]
        });
      }

      return {
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: contents,
        generationConfig: {
          maxOutputTokens: 2048
        }
      };
    },

    /**
     * Gemini API'ye soru sor (GigSync benzeri otomatik çoklu model kademeli yedekleme)
     * Sırasıyla aday modelleri dener; biri yoğunsa (503), kotalıysa (429) veya desteklenmiyorsa (404)
     * bir sonraki modele anında kesintisiz geçiş yapar.
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

      const storage = getStorage();
      let cachedModel = (storage && storage.getItem(STORAGE_KEY_MODEL)) || '';
      // Eski kullanımdan kalkmış modelleri önbellekten temizle
      if (['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash'].includes(cachedModel)) {
        cachedModel = '';
      }

      // Denenecek modeller sırası: Önbellekteki çalışan model varsa en başta, ardından tüm aday modeller
      const modelsToTry = [];
      if (cachedModel && CANDIDATE_MODELS.includes(cachedModel)) {
        modelsToTry.push(cachedModel);
      }
      CANDIDATE_MODELS.forEach(m => {
        if (!modelsToTry.includes(m)) {
          modelsToTry.push(m);
        }
      });

      let lastError = null;
      let lastNetworkError = false;

      for (let i = 0; i < modelsToTry.length; i++) {
        const model = modelsToTry[i];
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 16000); // Model başına 16 saniye zaman aşımı

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            if (
              data.candidates &&
              data.candidates.length > 0 &&
              data.candidates[0].content &&
              data.candidates[0].content.parts &&
              data.candidates[0].content.parts.length > 0
            ) {
              // Başarılı modeli önbelleğe kaydet (sonraki istekler doğrudan bu modelle başlar)
              if (storage) {
                storage.setItem(STORAGE_KEY_MODEL, model);
              }
              return data.candidates[0].content.parts[0].text;
            }
            throw new Error('EMPTY_RESPONSE');
          }

          let errBody = {};
          try { errBody = await response.json(); } catch (e) {}
          const errMsg = (errBody.error && errBody.error.message) ? errBody.error.message : `HTTP_${response.status}`;

          // API anahtarı geçersizse diğer modelleri boşuna deneme, hemen bildir
          if (response.status === 400 || response.status === 403) {
            if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID')) {
              throw new Error('INVALID_API_KEY');
            }
          }

          console.warn(`[AiAssistant] Model '${model}' yanıt vermedi (${response.status}: ${errMsg}), sıradaki modele geçiliyor...`);
          lastError = new Error(errMsg);

          // Kota / yoğunluk / 404 / 503 durumlarında döngü bir sonraki adaya devam eder
          continue;
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.message === 'INVALID_API_KEY') {
            throw fetchErr;
          }
          if (fetchErr.name === 'AbortError') {
            console.warn(`[AiAssistant] Model '${model}' zaman aşımına uğradı (16s), sıradaki modele geçiliyor...`);
            lastError = new Error('TIMEOUT_ERROR');
            continue;
          }

          console.warn(`[AiAssistant] Model '${model}' ağ hatası:`, fetchErr);
          lastNetworkError = true;
          lastError = new Error('NETWORK_ERROR');
        }
      }

      if (lastNetworkError && (!lastError || lastError.message === 'NETWORK_ERROR')) {
        throw new Error('NETWORK_ERROR');
      }

      throw lastError || new Error('MODEL_UNAVAILABLE');
    },

    /**
     * Modern Google Gemini Interactions API REST çağrısı (Opsiyonel / İleri düzey)
     * POST https://generativelanguage.googleapis.com/v1beta/interactions
     * @param {string} apiKey
     * @param {string} model
     * @param {string} userPrompt
     * @param {Array} history
     * @param {string} context
     * @param {AbortSignal} [signal]
     * @returns {Promise<string>}
     */
    callInteractionsApi: async function (apiKey, model, userPrompt, history = [], context = '', signal) {
      const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(apiKey)}`;

      let fullPrompt = userPrompt;
      if (Array.isArray(history) && history.length > 0) {
        const historyText = history
          .filter(h => h && h.text)
          .map(h => `${h.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${h.text}`)
          .join('\n\n');
        fullPrompt = `[Önceki Konuşma]:\n${historyText}\n\n[Kullanıcı Sorusu]:\n${userPrompt}`;
      }

      const systemInstructionText = `Sen GigTrack uygulamasının dahili AI asistanısın. Umut'un konser takvimini, finansını ve sistem hareketlerini hafızandan takip ediyorsun.\n\n${context}`;

      const body = {
        model: model || DEFAULT_GEMINI_MODEL,
        input: fullPrompt,
        system_instruction: systemInstructionText,
        generation_config: {
          max_output_tokens: 2048
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'Api-Revision': '2026-05-20'
        },
        body: JSON.stringify(body),
        signal: signal
      });

      if (!res.ok) {
        let errBody = {};
        try { errBody = await res.json(); } catch (e) {}
        const msg = (errBody.error && errBody.error.message) ? errBody.error.message : `HTTP_${res.status}`;

        if (res.status === 400 || res.status === 403) {
          if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
            throw new Error('INVALID_API_KEY');
          }
        }
        if (res.status === 429) {
          throw new Error('RATE_LIMIT');
        }
        throw new Error(msg);
      }

      const data = await res.json();
      if (data.output_text) return data.output_text;
      if (data.interaction && data.interaction.output_text) return data.interaction.output_text;
      if (Array.isArray(data.steps)) {
        for (const step of data.steps) {
          if (Array.isArray(step.content)) {
            for (const c of step.content) {
              if (c.type === 'text' && c.text) return c.text;
            }
          }
        }
      }
      throw new Error('EMPTY_RESPONSE');
    }
  };

  return AiAssistant;
});
