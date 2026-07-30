import { Response } from "express";
import db, { toLira, toCents } from "../db.js";
import { AuthRequest } from "../types/index.js";
import { calculateChatPromptVariables, applyPaymentToDebt, calculateDebtTotals } from "../../shared/financialEngine.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function safeParseFloat(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  const commaCount = (str.match(/,/g) || []).length;
  const dotCount = (str.match(/\./g) || []).length;

  if (commaCount === 1 && dotCount === 0) {
    return parseFloat(str.replace(',', '.')) || 0;
  }
  if (commaCount === 0 && dotCount === 1) {
    const parts = str.split('.');
    if (parts[1] && parts[1].length === 3) {
      return parseFloat(str.replace('.', '')) || 0;
    }
    return parseFloat(str) || 0;
  }
  if (commaCount > 0 && dotCount > 0) {
    const lastCommaIndex = str.lastIndexOf(',');
    const lastDotIndex = str.lastIndexOf('.');
    if (lastCommaIndex > lastDotIndex) {
      return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    } else {
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
  }
  if (dotCount > 1) {
    return parseFloat(str.replace(/\./g, '')) || 0;
  }
  if (commaCount > 1) {
    return parseFloat(str.replace(/,/g, '')) || 0;
  }
  return parseFloat(str) || 0;
}

export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const history = await db.prepare("SELECT role, text FROM chat_history WHERE user_id = ? ORDER BY timestamp ASC").all(req.user?.id);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: "Sohbet geçmişi alınamadı." });
  }
};

export const clearHistory = async (req: AuthRequest, res: Response) => {
  try {
    await db.prepare("DELETE FROM chat_history WHERE user_id = ?").run(req.user?.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Sohbet geçmişi silinemedi." });
  }
};

export const postChat = async (req: AuthRequest, res: Response) => {
  const { message } = req.body;
  if (!message) {
    res.status(400).json({ error: "Mesaj alanı boş olamaz." });
    return;
  }

  try {
    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(req.user?.id) as any;
    if (user.model_provider === 'gemini' && !user.api_key) {
      res.status(400).json({ error: "Lütfen önce ayarlardan Gemini API Anahtarınızı girin." });
      return;
    }
    if (user.model_provider === 'groq' && !user.api_key) {
      res.status(400).json({ error: "Lütfen önce ayarlardan Groq API Anahtarınızı girin." });
      return;
    }
    if (user.model_provider === 'nvidia' && !user.api_key) {
      res.status(400).json({ error: "Lütfen önce ayarlardan NVIDIA API Anahtarınızı girin." });
      return;
    }

    // Load live financial parameters to build rich prompt context
    const profile = await db.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(req.user?.id) as any;
    const userExpenses = await db.prepare("SELECT * FROM expenses WHERE user_id = ?").get(req.user?.id) as any;

    // Fetch rates
    let rates = { usd: 47.42, eur: 54.16, gbp: 63.17 };
    try {
      const dbUser = req.user?.id ? await db.prepare("SELECT currency_api_key FROM users WHERE id = ?").get(req.user?.id) as any : null;
      const curKey = dbUser?.currency_api_key || process.env.CURRENCY_API_KEY || 'fca_live_StZ6kUwnUPsDaGDr0FGiDgRRi3we9D9gH95zWGI3';
      let fetched = false;
      if (curKey) {
        try {
          const resCur = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${curKey}&currencies=TRY,EUR,GBP`);
          if (resCur.ok) {
            const jsonCur = await resCur.json() as any;
            const rData = jsonCur.data;
            if (rData && rData.TRY) {
              rates.usd = rData.TRY;
              rates.eur = rData.EUR ? rData.TRY / rData.EUR : rates.usd * 1.08;
              rates.gbp = rData.GBP ? rData.TRY / rData.GBP : rates.usd * 1.28;
              fetched = true;
            }
          }
        } catch (e) {}
      }
      if (!fetched) {
        const openRes = await fetch('https://open.er-api.com/v6/latest/USD');
        if (openRes.ok) {
          const openData = await openRes.json() as any;
          if (openData.rates && openData.rates.TRY) {
            rates.usd = openData.rates.TRY;
            rates.eur = openData.rates.EUR ? openData.rates.TRY / openData.rates.EUR : rates.usd * 1.08;
            rates.gbp = openData.rates.GBP ? openData.rates.TRY / openData.rates.GBP : rates.usd * 1.28;
          }
        }
      }
    } catch (e) {
      // Ignore
    }

    const convertToTry = (amount: number, currency = 'TRY') => {
      if (!currency || currency === 'TRY') return amount;
      const key = currency.toLowerCase() as 'usd' | 'eur' | 'gbp';
      const rate = rates[key] || 1;
      return amount * rate;
    };

    const debtsList = profile?.debts_list ? JSON.parse(profile.debts_list) : [];

    // Convert list to TRY to calculate overall totals for system prompts
    const convertedDebts = debtsList.map((d: any) => ({
      ...d,
      balance: convertToTry(d.balance, d.currency),
      minimumPayment: convertToTry(d.minimumPayment, d.currency)
    }));

    const totals = calculateDebtTotals(convertedDebts);

    const monthlyIncome = toLira(profile?.monthly_income);
    const rent = toLira(profile?.rent);
    const rentIncome = profile?.rent_income ? toLira(profile.rent_income) : 0;
    const readyCash = profile?.ready_cash !== undefined && profile?.ready_cash !== null ? toLira(profile.ready_cash) : 0;

    const totalDebt = totals.totalDebt;
    const interestRate = toLira(profile?.interest_rate);
    const minPaymentIsBankasi = totals.minimumPaymentIsBankasi;
    const minPaymentEnpara = totals.minimumPaymentEnpara;
    const totalMinimumPayments = minPaymentIsBankasi + minPaymentEnpara;

    const essentials = toLira(userExpenses?.essentials);
    const financial = toLira(userExpenses?.financial);
    const discretionary = toLira(userExpenses?.discretionary);
    const subscriptions = toLira(userExpenses?.subscriptions);
    const installments = toLira(userExpenses?.installments);

    const expensesObj = { essentials, financial, discretionary, subscriptions, installments };

    const {
      totalExpenses,
      debtPaymentCapacity,
      monthlyInterest,
      totalPayment,
      monthsToPayOff
    } = calculateChatPromptVariables(
      monthlyIncome,
      rent,
      totalDebt,
      interestRate,
      minPaymentIsBankasi,
      minPaymentEnpara,
      expensesObj
    );

    // Load recent ledger transactions
    const recentLedger = await db.prepare(`
      SELECT transaction_date, amount, type, description 
      FROM ledger_transactions 
      WHERE user_id = ? 
      ORDER BY transaction_date DESC 
      LIMIT 20
    `).all(req.user?.id) as any[];

    const ledgerSummary = recentLedger.map(l => 
      `- [${l.transaction_date}] ${l.type === 'expense' ? 'Gider' : l.type === 'payment' ? 'Ödeme' : 'Gelir'}: ${l.description} | ${toLira(l.amount)} ₺`
    ).join('\n') || '- Henüz finansal işlem hareketi kaydedilmemiş.';

    // Load recent draft transactions (uploaded PDF credit card statement items)
    const recentDrafts = await db.prepare(`
      SELECT transaction_date, description, amount, category 
      FROM draft_transactions 
      WHERE user_id = ? 
      ORDER BY transaction_date DESC 
      LIMIT 25
    `).all(req.user?.id) as any[];

    const draftsSummary = recentDrafts.map(d => 
      `- [${d.transaction_date}] ${d.description}: ${toLira(d.amount)} ₺ (${d.category || 'Genel'})`
    ).join('\n') || '- Ekstre yükleme hareketi bulunmuyor.';

    // Load confirmed credit card transactions
    const confirmedTxns = await db.prepare(`
      SELECT transaction_date, description, amount, category 
      FROM transactions 
      WHERE card_id IN (SELECT id FROM credit_cards WHERE user_id = ?) 
      ORDER BY transaction_date DESC 
      LIMIT 25
    `).all(req.user?.id) as any[];

    const confirmedTxnsSummary = confirmedTxns.map(t => 
      `- [${t.transaction_date}] ${t.description}: ${toLira(t.amount)} ₺ (${t.category || 'Genel'})`
    ).join('\n') || '';

    const allStatementTxns = [draftsSummary, confirmedTxnsSummary].filter(Boolean).join('\n') || '- Ekstre harcama hareketi bulunmuyor.';

    const actualDebtsOnly = debtsList.filter((d: any) => d.type !== 'receivable');
    const receivablesOnly = debtsList.filter((d: any) => d.type === 'receivable');

    const debtsSummary = actualDebtsOnly.map((d: any) => 
      `- ${d.name}: ${d.balance} ${d.currency} (Asgari: ${d.minimumPayment} ${d.currency}, Faiz: %${d.apr})`
    ).join('\n') || '- Aktif borç kaydı bulunmamaktadır.';

    const receivablesSummary = receivablesOnly.map((r: any) => 
      `- ${r.name}: ${r.balance} ${r.currency}`
    ).join('\n') || '- Kayıtlı alacak bulunmamaktadır.';

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const cfoAgentKnowledgeDir = path.resolve(__dirname, "..", "knowledge", "cfo-agent");

    let knowledgeBaseText = "";
    try {
      const masterProtocol = fs.readFileSync(path.join(cfoAgentKnowledgeDir, "cfo-ai-agent-master-protocol-v3.md"), "utf-8");
      const guardrails = fs.readFileSync(path.join(cfoAgentKnowledgeDir, "cfo-ai-agent-rag-guardrails.md"), "utf-8");
      const errorHandling = fs.readFileSync(path.join(cfoAgentKnowledgeDir, "cfo-ai-agent-error-handling.md"), "utf-8");
      const fewShotTemplates = fs.readFileSync(path.join(cfoAgentKnowledgeDir, "cfo-ai-agent-few-shot-templates.md"), "utf-8");
      
      knowledgeBaseText = `
=== CFO AI AGENT OPERATING PROTOCOLS ===
${masterProtocol}

=== FEW-SHOT LEARNING & DIALOGUE EXAMPLES ===
${fewShotTemplates}

=== RAG & GUARDRAIL LIMITS ===
${guardrails}

=== ERROR HANDLING PROTOCOLS ===
${errorHandling}
`;
    } catch (err: any) {
      console.error("Error reading CFO knowledge files:", err.message);
    }

    const systemInstructionText = `Sen kullanıcının kişisel yapay zeka finans danışmanısın (Kişisel CFO). Kullanıcının tüm gelir, gider, hazır nakit (kasa), borç, alacak ve ekstre bilgilerine %100 TAM HAKİMSİN.

KRİTİK İLETİŞİM VE PERSONA KURALLARI (ZORUNLU):
1. **DOĞRUDAN İLETİŞİM DİLİ**: Kullanıcıya her zaman doğrudan "sen / siz" diliyle hitap et (Örn: "73.000 TL ödemenizi aldım ve sisteme işliyorum"). KESİNLİKLE 3. şahıs dili KULLANMA ("Kullanıcının ödeme talebini alıyorum", "Kullanıcıya sunulur" gibi ifadeler TAMAMEN YASAKTIR)!
2. **AKSİYON BLOĞU OLUŞTURMA ZORUNLULUĞU**: Kullanıcı ödeme yaptığını veya borç ekleyeceğini söylediğinde (Örn: "73000 TL ödeme yaptım"), yanıtının en sonuna KESİNLİKLE şu formatta bir JSON bloğu ekle:
[ACTION_START]
{
  "type": "MAKE_PAYMENT",
  "payload": {
    "cardNameOrBank": "isbank",
    "amount": 73000
  }
}
[ACTION_END]
Sadece metin yazıp aksiyon bloğunu koymazsan ödeme veritabanına YAZILMAZ ve YALAN SÖYLEMİŞ olursun!
3. **KISA, ÖZ VE TEKRARSIZ YANIT**: Yanıtlarını sade tut. Asla 8-10 tane alt üste "Kredi Kartı Borç Planı Raporu" gibi aynı şeyleri tekrarlayan robotik başlık dizileri KULLANMA! Tek ve net bir özet sun.
4. **GELİR = 0 İSE DTI KONTROLÜ**: Eğer kullanıcının geliri 0 ₺ ise DTI (Borç/Gelir) oranını eksi (-100%) veya mantıksız hesaplama. "Aylık geliriniz henüz sisteme girilmediği için DTI oranı hesaplanamıyor. Lütfen önce gelirinizi belirtin" uyarısı ver.

${knowledgeBaseText}

Kullanıcının Anlık Canlı Finansal Bilgileri:
- Canlı Döviz Kurları: 1 USD = ${rates.usd.toFixed(2)} ₺ | 1 EUR = ${rates.eur.toFixed(2)} ₺ | 1 GBP = ${rates.gbp.toFixed(2)} ₺
- Elimdeki Hazır Nakit (Kasa): ${readyCash.toLocaleString('tr-TR')} ₺
- Aylık Maaş/Ana Gelir: ${monthlyIncome.toLocaleString('tr-TR')} ₺
- Aylık Ekstra Gelir (Kira Geliri vb.): ${rentIncome.toLocaleString('tr-TR')} ₺
- Toplam Gelir: ${(monthlyIncome + rentIncome).toLocaleString('tr-TR')} ₺
- Aylık Kira/Konut Gideri: ${rent.toLocaleString('tr-TR')} ₺
- Diğer Aylık Giderler Toplamı: ${totalExpenses.toLocaleString('tr-TR')} ₺ (Temel: ${essentials} ₺, Finansal: ${financial} ₺, Serbest Harcama: ${discretionary} ₺, Abonelikler: ${subscriptions} ₺, Taksitler: ${installments} ₺)
- Aylık Borç Ödeme Kapasitesi (Net Nakit Akışı): ${debtPaymentCapacity.toLocaleString('tr-TR')} ₺
- Toplam Borç (TL cinsinden): ${totalDebt.toLocaleString('tr-TR')} ₺
- Ortalama Borç Faiz Oranı (Yıllık): %${interestRate * 100}
- Aylık Biriken Tahmini Faiz Yükü: ${monthlyInterest.toLocaleString('tr-TR')} ₺
- Toplam Borç Asgari Ödemeleri: ${totalMinimumPayments.toLocaleString('tr-TR')} ₺ (İş Bankası: ${minPaymentIsBankasi} ₺, Enpara: ${minPaymentEnpara} ₺)
- Mevcut Borç Yapılandırmasına Göre Aylık Toplam Yapılan Ödeme: ${totalPayment.toLocaleString('tr-TR')} ₺
- Tahmini Borç Kapanma Süresi: ${monthsToPayOff === Infinity ? 'Hesaplanamıyor (Ödeme kapasitesi yetersiz)' : `${monthsToPayOff} ay`}

Mevcut Borçların ve Kredi Kartlarının Detaylı Listesi:
${debtsSummary}

Gelecek Alacaklar (Nakit Girişleri):
${receivablesSummary}

Ekstrelerden Ve Kredi Kartlarından Kayıtlı Tüm Harcamalar:
${allStatementTxns}

Kullanıcının Son Kasa/Banka Muhasebe Hareketleri (Ledger):
${ledgerSummary}

Kurallar ve Parametreler (Referans İlkeler):
- Tasarruf Oranı Hedefi: >= %20 Sağlıklı.
- Kart Limit Kullanımı: <= %30 Sağlıklı, >= %80 Kritik (kredi notu hasarı).
- DTI (Borç Servisi / Gelir): <= %36 Sağlıklı, > %50 Kritik.
- Likidite: Kasa en az 3 ay (riskli), hedef 6 ay (güvenli) zorunlu çıkışı kapsamalıdır.
- Baby Step 1: 1 aylık nakit rezerv tamponu biriktirilir.
- Ödemeleri Değerlendirme: Eğer yukarıdaki son ödemeler listesinde kullanıcının kartlar için asgariden fazla ödeme yaptığı görünüyorsa, bunu takdir et ve kalan borç üzerinden plan yap.
- Veri Güncelleme Yetkisi (Kritik Yetki): Eğer kullanıcı senden herhangi bir veriyi güncellemeni, borç eklemeni, ödeme kaydetmeni veya gelir/kira/harcama tutarlarını değiştirmesini istiyorsa, bu işlemi gerçekleştirmek için yanıtının en sonuna MUTLAKA aşağıdaki formatta bir JSON aksiyon bloğu eklemelisin. Format dışındaki metinlerin arasında kesinlikle yer almalıdır:
[ACTION_START]
{
  "type": "UPDATE_PROFILE",
  "payload": {
    "monthlyIncome": 250000,
    "rent": 35000,
    "expenses": {
      "essentials": 45000,
      "discretionary": 10000
    }
  }
}
[ACTION_END]

Veyahut borç/kredi kartı veya herhangi bir borç (USD, EUR, GBP dahil) ekleme talebi için (eğer borç yabancı para birimindeyse "currency" alanına "USD", "EUR", "GBP" vb. yazılmalıdır, varsayılan "TRY" dir; kullanıcı özellikle belirtmedikçe yıllık faiz oranı "apr" varsayılan olarak 0 girilmelidir):
[ACTION_START]
{
  "type": "ADD_DEBT",
  "payload": {
    "name": "Nuratc Borç",
    "balance": 1000,
    "apr": 0,
    "minimumPayment": 50,
    "currency": "USD",
    "bankName": "other"
  }
}
[ACTION_END]

Veyahut kart ödemesi yapma talebi için:
[ACTION_START]
{
  "type": "MAKE_PAYMENT",
  "payload": {
    "cardNameOrBank": "isbank",
    "amount": 73000
  }
}
[ACTION_END]

Kullanıcı sadece sohbet ediyorsa veya bilgi soruyorsa asla bu aksiyon bloğunu ekleme. Yalnızca veri ekleme/güncelleme taleplerinde bu aksiyon bloğunu ekle.
- Halüsinasyon veya uydurma veri kullanma. Verilmeyen bilgileri tahmin etme.`;

    // Save user message to database
    await db.prepare("INSERT INTO chat_history (user_id, role, text) VALUES (?, ?, ?)")
      .run(req.user?.id, "user", message);

    // Load full conversation history from DB
    const historyRows = await db.prepare("SELECT role, text FROM chat_history WHERE user_id = ? ORDER BY timestamp ASC").all(req.user?.id) as any[];

    let botText = "";

    if (user.model_provider === 'local') {
      const localMessages = historyRows.map(r => ({
        role: r.role === 'model' ? 'assistant' : 'user',
        content: r.text
      }));
      localMessages.unshift({ role: 'system', content: systemInstructionText });

      const response = await fetch(`${user.local_endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: user.model_name || "default",
          messages: localMessages,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error("Yerel Sunucu (LM Studio) hatası. Sunucunun çalıştığından ve HTTP Server ayarının açık olduğundan emin olun.");
      }
      const responseData = await response.json();
      botText = responseData.choices?.[0]?.message?.content || "Yerel modelden yanıt alınamadı.";
    } else if (user.model_provider === 'groq') {
      const groqMessages = historyRows.map(r => ({
        role: r.role === 'model' ? 'assistant' : 'user',
        content: r.text
      }));
      groqMessages.unshift({ role: 'system', content: systemInstructionText });

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.api_key}`
        },
        body: JSON.stringify({
          model: user.model_name || "llama-3.3-70b-versatile",
          messages: groqMessages,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error("Groq API hatası. API anahtarını veya kotanızı kontrol edin.");
      }
      const responseData = await response.json();
      botText = responseData.choices?.[0]?.message?.content || "Groq modelinden yanıt alınamadı.";
    } else if (user.model_provider === 'nvidia') {
      const nvidiaMessages = historyRows.map(r => ({
        role: r.role === 'model' ? 'assistant' : 'user',
        content: r.text
      }));
      nvidiaMessages.unshift({ role: 'system', content: systemInstructionText });

      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.api_key}`
        },
        body: JSON.stringify({
          model: user.model_name || "meta/llama-3.1-8b-instruct",
          messages: nvidiaMessages,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`NVIDIA API Error (${response.status}):`, errText);
        throw new Error(`NVIDIA API hatası (${response.status}): ${errText}`);
      }
      const responseData = await response.json();
      botText = responseData.choices?.[0]?.message?.content || "NVIDIA modelinden yanıt alınamadı.";
    } else {
      const contents = historyRows.map(r => ({
        role: r.role === "model" ? "model" : "user",
        parts: [{ text: r.text }]
      }));

      // Call Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${user.api_key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemInstructionText }] }
          })
        }
      );

      if (!response.ok) {
        throw new Error("Gemini API hatası. API anahtarını veya kotanızı kontrol edin.");
      }

      const responseData = await response.json();
      botText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || "Üzgünüm, şu an yanıt oluşturamıyorum.";
    }

    // BACKEND INTENT GUARANTEE SAFEGUARD:
    // If the LLM outputted text without [ACTION_START], but user requested a payment, auto-inject the action block!
    if (!botText.includes('[ACTION_START]')) {
      const payMatch = message.match(/(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:tl|₺)?\s*.*?(?:ödeme|ödedim|yatırdım)/i)
        || message.match(/(?:ödeme|ödedim|yatırdım)\s*.*?:?\s*(\d{1,3}(?:\.\d{3})*|\d+)/i);
      
      if (payMatch) {
        const rawAmt = payMatch[1].replace(/\./g, '');
        const amt = parseFloat(rawAmt);
        if (!isNaN(amt) && amt > 0) {
          const bankName = message.toLowerCase().includes('enpara') ? 'enpara' : 'isbank';
          const fallbackAction = {
            type: 'MAKE_PAYMENT',
            payload: {
              cardNameOrBank: bankName,
              amount: amt
            }
          };
          botText += `\n\n[ACTION_START]\n${JSON.stringify(fallbackAction, null, 2)}\n[ACTION_END]`;
        }
      }
    }

    let refreshUI = false;
    const actionMatch = botText.match(/\[ACTION_START\]\s*(\{[\s\S]+?\})\s*\[ACTION_END\]/);
    if (actionMatch) {
      try {
        const action = JSON.parse(actionMatch[1]);
        const userId = req.user?.id;

        if (action.type === 'UPDATE_PROFILE') {
          const payload = action.payload;
          const currentProfile = await db.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(userId) as any;
          const currentExpenses = await db.prepare("SELECT * FROM expenses WHERE user_id = ?").get(userId) as any;

          const incomeVal = payload.monthlyIncome !== undefined ? toCents(payload.monthlyIncome) : currentProfile.monthly_income;
          const rentVal = payload.rent !== undefined ? toCents(payload.rent) : currentProfile.rent;

          await db.prepare(`
            UPDATE financial_profiles SET monthly_income = ?, rent = ? WHERE user_id = ?
          `).run(incomeVal, rentVal, userId);

          if (payload.expenses) {
            const essentialsVal = payload.expenses.essentials !== undefined ? toCents(payload.expenses.essentials) : currentExpenses.essentials;
            const financialVal = payload.expenses.financial !== undefined ? toCents(payload.expenses.financial) : currentExpenses.financial;
            const discretionaryVal = payload.expenses.discretionary !== undefined ? toCents(payload.expenses.discretionary) : currentExpenses.discretionary;
            const subscriptionsVal = payload.expenses.subscriptions !== undefined ? toCents(payload.expenses.subscriptions) : currentExpenses.subscriptions;
            const installmentsVal = payload.expenses.installments !== undefined ? toCents(payload.expenses.installments) : currentExpenses.installments;

            await db.prepare(`
              UPDATE expenses SET essentials = ?, financial = ?, discretionary = ?, subscriptions = ?, installments = ? WHERE user_id = ?
            `).run(essentialsVal, financialVal, discretionaryVal, subscriptionsVal, installmentsVal, userId);
          }
          refreshUI = true;
        }

        if (action.type === 'ADD_DEBT') {
          const payload = action.payload;
          const currentProfile = await db.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(userId) as any;
          const debtsList = currentProfile?.debts_list ? JSON.parse(currentProfile.debts_list) : [];

          const newDebt = {
            id: 'd-' + Date.now(),
            name: payload.name || 'Yeni Kart',
            balance: safeParseFloat(payload.balance),
            apr: payload.apr !== undefined ? (safeParseFloat(payload.apr)) : 0,
            minimumPayment: safeParseFloat(payload.minimumPayment),
            currency: payload.currency || 'TRY',
            bankName: payload.bankName || 'other'
          };

          debtsList.push(newDebt);

          // Convert list to TRY for computing db values (total_debt, min payments)
          const convertedList = debtsList.map((d: any) => ({
            ...d,
            balance: convertToTry(d.balance, d.currency),
            minimumPayment: convertToTry(d.minimumPayment, d.currency)
          }));
          const totals = calculateDebtTotals(convertedList);

          await db.prepare(`
            UPDATE financial_profiles SET 
              total_debt = ?,
              min_payment_isbank = ?,
              min_payment_enpara = ?,
              debts_list = ?
            WHERE user_id = ?
          `).run(
            toCents(totals.totalDebt),
            toCents(totals.minimumPaymentIsBankasi),
            toCents(totals.minimumPaymentEnpara),
            JSON.stringify(debtsList),
            userId
          );

          // Also insert card into credit_cards table for consistency
          const cardId = `card_${userId}_${newDebt.bankName}_${Math.floor(1000 + Math.random() * 9000)}`;
          await db.prepare(`
            INSERT OR IGNORE INTO credit_cards (id, user_id, bank_name, card_number_last4, total_debt, interest_rate, minimum_payment, currency, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            cardId,
            userId,
            newDebt.bankName,
            '0000',
            toCents(newDebt.balance),
            newDebt.apr,
            toCents(newDebt.minimumPayment),
            newDebt.currency,
            new Date().toISOString()
          );
          
          refreshUI = true;
        }

        if (action.type === 'MAKE_PAYMENT') {
          const payload = action.payload;
          const currentProfile = await db.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(userId) as any;
          const debtsList = currentProfile?.debts_list ? JSON.parse(currentProfile.debts_list) : [];

          const searchStr = (payload.cardNameOrBank || '').toLowerCase();
          const debt = debtsList.find((d: any) => 
            (d.name || '').toLowerCase().includes(searchStr) || 
            (d.bankName || '').toLowerCase().includes(searchStr)
          );

          if (debt) {
            const payAmount = safeParseFloat(payload.amount);
            if (payAmount > 0) {
              const updatedList = applyPaymentToDebt(debtsList, debt.id, payAmount);
              const totals = calculateDebtTotals(updatedList);

              await db.prepare(`
                UPDATE financial_profiles SET 
                  total_debt = ?,
                  min_payment_isbank = ?,
                  min_payment_enpara = ?,
                  debts_list = ?
                WHERE user_id = ?
              `).run(
                toCents(totals.totalDebt),
                toCents(totals.minimumPaymentIsBankasi),
                toCents(totals.minimumPaymentEnpara),
                JSON.stringify(updatedList),
                userId
              );

              // Add to ledger
              const ledgerId = `ledger_pay_${Math.random().toString(36).slice(2, 10)}`;
              const now = new Date().toISOString();

              await db.prepare(`
                INSERT OR IGNORE INTO accounts (id, user_id, name, type, balance)
                VALUES (?, ?, ?, 'credit_card', ?)
              `).run(debt.id, userId, debt.name, toCents(debt.balance - payAmount));

              await db.prepare(`
                INSERT INTO ledger_transactions (id, user_id, account_id, transaction_date, amount, type, description, created_at)
                VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)
              `).run(
                ledgerId,
                userId,
                debt.id,
                now.substring(0, 10),
                toCents(payAmount),
                `${debt.name} Borç Ödemesi`,
                now
              );
            }
          }
          refreshUI = true;
        }

        // Clean bot text from raw JSON block
        botText = botText.replace(/\[ACTION_START\][\s\S]+?\[ACTION_END\]/, '').trim();
      } catch (jsonErr) {
        console.error("Action JSON parsing error:", jsonErr);
      }
    }

    // Save assistant response to DB
    await db.prepare("INSERT INTO chat_history (user_id, role, text) VALUES (?, ?, ?)")
      .run(req.user?.id, "model", botText);

    res.json({ text: botText, refreshUI });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Yapay zeka ile iletişim kurulamadı." });
  }
};
