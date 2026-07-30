/**
 * PDF Ekstre İşleme Motoru — Kural Tabanlı (AI Yok)
 * 
 * Desteklenen Bankalar:
 *   - Türkiye İş Bankası (Kredi Kartı / Maximum Kart)
 *   - QNB Finansbank / Enpara (Kredi Kartı)
 *
 * Çıktı:
 *   - Banka adı, bakiye, faiz oranı, asgari ödeme
 *   - İşlem listesi (tarih, açıklama, tutar, kategori)
 *   - Kategori toplamları
 */

// ─────────────────────────────────────────────
// Yardımcı: TR/EN sayı formatını JS float'a çevir
// ─────────────────────────────────────────────
export function parseTrNumber(s: string): number {
  s = String(s).trim().replace(/\s/g, '');
  if (/,\d{1,2}$/.test(s)) {          // 1.234,56 → TR
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) { // 1,234.56 → EN
    s = s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');           // 1234,56 → 1234.56
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────
// Yardımcı: Unicode normalizasyonu
// ─────────────────────────────────────────────
export function normalizeTR(s: string): string {
  return s
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ─────────────────────────────────────────────
// Kategori Anahtar Sözcükleri
// ─────────────────────────────────────────────
const CAT_INSTALLMENT = ['taksit', 'taksidi', 'taksitli', 'takside', ' tks ', '/tks', 'tks/'];

const CAT_SUBSCRIPTIONS = [
  'spotify', 'youtube premium', 'netflix', 'blutv', 'exxen', 'gain tv', 'tod', 'mubi', 'deezer',
  'apple music', 'amazon music', 'amazon prime', 'disney', 'hbo', 'beinsports',
  'openai', 'chatgpt', 'claude', 'anthropic', 'midjourney', 'notion', 'figma', 'canva',
  'adobe', 'microsoft 365', 'office 365', 'google one', 'google workspace', 'dropbox',
  'icloud', 'github', 'digitalocean', 'aws', 'vercel', 'app store', 'google play',
  'gym', 'fitness', 'aidat', 'spor salonu'
];

const CAT_ESSENTIALS = [
  // Telefon & İnternet & Faturalar (Kullanıcı zorunlu gider olarak tanımladı)
  'turkcell', 'turk telekom', 'telekom', 'ttnet', 'superonline', 'bimcell', 'netgsm', 'vodafone',
  'd-smart', 'digiturk', 'tivibu', 'fatura', 'elektrik', 'dogalgaz', ' su ', 'igdas', 'enerjisa',
  'gdiz', 'aydem', 'ck bogazici',
  // Sigorta & BES
  'sigorta', 'axa', 'allianz', 'agesa', 'nn hayat', 'bireysel emeklilik', 'bes odemesi',
  // Marketler
  'migros', 'carrefour', 'a101', 'bim ', 'sok ', 'metro market', 'file market',
  'macro center', 'gida', 'market', 'supermarket', 'kasap', 'manav', 'firin', 'bakkal',
  // Yakıt
  'shell', 'opet', 'petrol', 'total energies', 'bp ', 'akaryakit', 'benzin', 'motorin', 'aytemiz', 'poas',
  // Sağlık
  'eczane', 'eczanesi', 'doktor', 'klinik', 'hastane', 'saglik', 'medikal', 'optik',
  // Eğitim
  'okul', 'egitim', 'kurs', 'kitap', 'udemy', 'coursera',
  // Ulaşım
  'iett', 'ulasim', 'metrobus', 'metro istanbul', 'marmaray', 'taxi', 'taksi',
  'hgs', 'ogs', 'otopark', 'otogar', 'ptt', 'kargo', 'cargo',
  // Yemek marketi
  'getir', 'yemeksepeti market', 'tazedirekt', 'gorsel market'
];

const CAT_DISCRETIONARY = [
  // Fast food & Kafe & Yeme İçme (Keyfi harcamalar)
  'mcdonalds', 'mcdonald', 'burger king', 'kfc ', 'subway ', 'popeyes',
  'starbucks', 'caribou', 'gloria jeans', 'dunkin', 'kahve', 'starbucks', 'kahvesi',
  'dominos', 'little caesars', 'sbarro', 'pizza hut',
  'restoran', 'restaurant', 'cafe ', 'bistro', 'lokanta',
  'doner', 'kebap', 'lahmacun', 'pide', 'hamburger', 'kofte', 'kofteci', 'donerci', 'kebapci',
  'pizzaci', 'burger', 'corba', 'corbaci', 'pastane', 'borek', 'patisserie', 'tatli', 'tatlici',
  'bar ', 'pub ', 'lounge', 'meyhane', 'taverna', 'sarap', 'tekel', 'bira', 'cikolata',
  'yemeksepeti', 'trendyol yemek', 'getir yemek', 'migros yemek',
  // Giyim & Alışveriş
  'zara', 'h&m', 'hm ', 'lcwaikiki', 'lcw', 'lc waikiki', 'koton', 'defacto', 'mango', 'pull&bear',
  'bershka', 'boyner', 'network', 'vakko', 'pierre cardin', 'kigili', 'altinyildiz', 'mavi', 'colins',
  'nike', 'adidas', 'puma', 'skechers', 'flo ', 'polaris', 'decathlon',
  // E-ticaret
  'hepsiburada', 'trendyol', 'n11', 'ciceksepeti', 'amazon.com', 'amazon.com.tr', 'amazon turkey',
  'ikea', 'koctas', 'teknosa', 'mediamarkt', 'vatan', 'beko', 'vestel',
  // Eğlence / Turizm
  'biletix', 'biletmaster', 'passo', 'sinema', 'tiyatro', 'konser', 'otel', 'hotel', 'tatil', 'bilet',
  'thy', 'pegasus', 'sunexpress', 'anadolujet', 'enuygun', 'obilet', 'jolly', 'etstur'
];

const CAT_FINANCIAL = [
  'kredi taksit', 'konut kredisi', 'tasit kredisi', 'ihtiyac kredisi',
  'kredi odeme', 'faiz', 'banka masrafi', 'komisyon', 'munzam aidat',
  'efthavale', 'swift', 'havale', 'eft ',
  // Finansman borçlanma maliyetleri (faiz, vergi vb.)
  'kkdf', 'bsmv', 'gecikme faiz', 'gecikme ucreti', 'limit asim', 'kart ucreti', 'yillik ucret'
];

// ─────────────────────────────────────────────
// Kategori Belirleme
// ─────────────────────────────────────────────
export type Category = 'essentials' | 'financial' | 'discretionary' | 'subscriptions' | 'installments';

export function detectCategory(description: string): Category {
  const n = normalizeTR(description);

  // 1. Taksit şablonları: fractional format örn. "5/6" veya "\d+ tk"
  if (/\b\d+\s*\/\s*\d+\b/.test(n) || /\b\d+\s*tk\b/.test(n)) {
    return 'installments';
  }

  // 2. Taksit anahtar kelimeleri
  if (CAT_INSTALLMENT.some(k => n.includes(normalizeTR(k)))) return 'installments';
  // 3. Finansal
  if (CAT_FINANCIAL.some(k => n.includes(normalizeTR(k)))) return 'financial';
  // 4. Abonelik
  if (CAT_SUBSCRIPTIONS.some(k => n.includes(normalizeTR(k)))) return 'subscriptions';
  // 5. Zorunlu
  if (CAT_ESSENTIALS.some(k => n.includes(normalizeTR(k)))) return 'essentials';
  // 6. İsteğe bağlı
  if (CAT_DISCRETIONARY.some(k => n.includes(normalizeTR(k)))) return 'discretionary';

  return 'essentials'; // Bilinmeyen → zorunlu harcama olarak sınıflandır
}

// ─────────────────────────────────────────────
// İşlem satırı
// ─────────────────────────────────────────────
export interface Transaction {
  date: string;
  description: string;
  amount: number;
  category: Category;
}

// ─────────────────────────────────────────────
// Parser çıktı şeması
// ─────────────────────────────────────────────
export interface ParsedStatement {
  bankName: 'isbank' | 'enpara' | 'unknown';
  cardNumberLast4: string;
  totalDebt: number;
  interestRate: number;         // Yıllık %
  minimumPayment: number;
  cutoffDate: string;
  transactions: Transaction[];
  categoryTotals: {
    essentials: number;
    financial: number;
    discretionary: number;
    subscriptions: number;
    installments: number;
  };
}

// ─────────────────────────────────────────────
// Esnek Sayı Yakalayıcı (Bozuk PDF satırlarına karşı dirençli)
// ─────────────────────────────────────────────
function grab(normalizedText: string, patterns: string[]): number {
  for (const p of patterns) {
    const idx = normalizedText.indexOf(normalizeTR(p));
    if (idx !== -1) {
      // İlgili kelimeden sonraki 150 karakteri al
      let chunk = normalizedText.substring(idx + p.length, idx + p.length + 150);
      // Tarihleri sil (örn: 15.04.2026, 15/04/2026, 2026)
      chunk = chunk.replace(/\d{2}[./]\d{2}[./]\d{4}/g, '').replace(/\b202\d\b/g, '');
      
      // İlk bulduğumuz mantıklı sayıyı döndür
      const numRe = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/g;
      let m;
      while ((m = numRe.exec(chunk)) !== null) {
        const v = parseTrNumber(m[1]);
        if (v > 0) return v;
      }
    }
  }
  return 0;
}

// ─────────────────────────────────────────────
// Banka Şablonları
// ─────────────────────────────────────────────

// ── İŞ BANKASI ──────────────────────────────
function parseIsbank(rawText: string, normText: string): Partial<ParsedStatement> {
  // Hesap özeti borcu → birkaç farklı etiketle gelebilir
  const totalDebt = grab(normText, [
    'hesap ozeti borcu',
    'donem borcu',
    'toplam ekstre borcu',
    'guncel ekstre borcu',
    'toplam borc',
    'hesap kesim tutari',
    'borc tutari'
  ]);

  const minimumPayment = grab(normText, [
    'odenmesi gereken asgari tutar',
    'asgari odeme tutari',
    'minimum odeme tutari',
    'asgari tutar',
    'asgari odeme(?!\\s*oran)'
  ]);

  // Yıllık faiz oranı
  let interestRate = 0;
  const aprMatch = normText.match(/yillik[^%\n]{0,50}%\s*([\d.,]+)/i)
    || normText.match(/alisveris[^%\n]{0,30}yillik[^%\n]{0,30}%\s*([\d.,]+)/i)
    || normText.match(/akdi faiz[^%\n]{0,30}%\s*([\d.,]+)/i);
  if (aprMatch) interestRate = parseTrNumber(aprMatch[1]);

  // Aylık → yıllığa çevir
  if (interestRate === 0) {
    const monthlyMatch = normText.match(/aylik[^%\n]{0,30}%\s*([\d.,]+)/i);
    if (monthlyMatch) interestRate = Math.round(parseTrNumber(monthlyMatch[1]) * 12 * 100) / 100;
  }

  // Kart numarasının son 4 hanesi
  const cardMatch = rawText.match(/\*{3,}\s*(\d{4})\b/) || rawText.match(/ending\s+in\s+(\d{4})/i);
  const cardNumberLast4 = cardMatch ? cardMatch[1] : '****';

  // Hesap kesim tarihi
  const cutoffMatch = rawText.match(/kesim tarihi[:\s]+(\d{2}[./]\d{2}[./]\d{4})/i)
    || rawText.match(/(\d{2}[./]\d{2}[./]\d{4})/);
  const cutoffDate = cutoffMatch ? cutoffMatch[1] : '';

  return { totalDebt, minimumPayment, interestRate, cardNumberLast4, cutoffDate };
}

// ── ENPARA / QNB FİNANSBANK ─────────────────
function parseEnpara(rawText: string, normText: string): Partial<ParsedStatement> {
  const totalDebt = grab(normText, [
    'ekstre borcu',
    'hesap ozeti borcu',
    'toplam ekstre tutari',
    'odeme tutari',
    'kart borc tutari',
    'toplam borc',
    'guncel borc'
  ]);

  const minimumPayment = grab(normText, [
    'asgari odeme tutari',
    'minimum odeme',
    'odenmesi gereken asgari',
    'asgari odeme(?!\\s*oran)'
  ]);

  // Yıllık faiz
  let interestRate = 0;
  const aprMatch = normText.match(/yillik[^%\n]{0,50}%\s*([\d.,]+)/i)
    || normText.match(/akdi[^%\n]{0,30}faiz[^%\n]{0,30}%\s*([\d.,]+)/i)
    || normText.match(/faiz oran[i][^%\n]{0,30}%\s*([\d.,]+)/i);
  if (aprMatch) interestRate = parseTrNumber(aprMatch[1]);

  if (interestRate === 0) {
    const monthlyMatch = normText.match(/aylik[^%\n]{0,30}%\s*([\d.,]+)/i);
    if (monthlyMatch) interestRate = Math.round(parseTrNumber(monthlyMatch[1]) * 12 * 100) / 100;
  }

  const cardMatch = rawText.match(/\*{3,}\s*(\d{4})\b/) || rawText.match(/kart no[:\s.]+\d{4}\s*\d{4}\s*\d{4}\s*(\d{4})/i);
  const cardNumberLast4 = cardMatch ? cardMatch[1] : '****';

  const cutoffMatch = rawText.match(/hesap\s+kesim\s+tarihi[:\s]+(\d{2}[./]\d{2}[./]\d{4})/i)
    || rawText.match(/ekstre\s+tarihi[:\s]+(\d{2}[./]\d{2}[./]\d{4})/i)
    || rawText.match(/(\d{2}[./]\d{2}[./]\d{4})/);
  const cutoffDate = cutoffMatch ? cutoffMatch[1] : '';

  return { totalDebt, minimumPayment, interestRate, cardNumberLast4, cutoffDate };
}

// ─────────────────────────────────────────────
// İşlem satırlarını çıkar (Bozuk/Birleşik satırlara dirençli)
// ─────────────────────────────────────────────
const TR_AMOUNT_RE = /(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;

function extractTransactions(rawText: string): Transaction[] {
  const lines = rawText.split(/\r?\n/);
  const txns: Transaction[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (line.length < 8) continue;

    // Match date at start of line
    const dateMatch = line.match(/^(\d{1,2}[./]\d{1,2}[./]\d{4})\s*(.*)/);
    if (!dateMatch) continue;

    const dateStr = dateMatch[1].replace(/\//g, '.');
    let rest = dateMatch[2];

    // Clean known parazites BEFORE matching end amount
    // (Prevents pdf-parse concatenated text like "KAZANILAN MAXİPUAN:0,101,050.00-")
    rest = rest
      .replace(/KAZANILAN\s+MAXİPUAN\s*:?\s*[\d.,]+/gi, ' ')
      .replace(/VR\/FN\s*:?\s*[\d.,]+/gi, ' ')
      .replace(/FZ\s*:?\s*[\d.,]+/gi, ' ')
      .replace(/KL\s*:?\s*[\d.,]+/gi, ' ')
      .replace(/KUR\s*:?\s*[\d.,]+/gi, ' ');

    // Match amount and sign (+/-) at end of line
    const endAmountMatch = rest.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*([+-])?\s*$/);
    if (!endAmountMatch) continue;

    const rawAmountStr = endAmountMatch[1];
    const sign = endAmountMatch[2] || '-';
    const amount = parseTrNumber(rawAmountStr);

    if (amount <= 0 || amount > 1_000_000) continue;

    // Extract description between date and amount
    let descRaw = rest.substring(0, endAmountMatch.index).trim();

    // Clean description noise
    descRaw = descRaw
      .replace(/\b\d{4}-\d{7}\b/g, '')
      .replace(/\b\d{4,}\b/g, '')
      .replace(/[,:.-]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Filter out payments from expense list (payments have '+' sign or start with 'odeme' / 'hesaptan aktarim')
    const normDesc = normalizeTR(descRaw);
    const isPayment = sign === '+' || normDesc.includes('hesaptan aktarim') || normDesc.startsWith('odeme');
    
    if (isPayment) {
      continue;
    }

    const category = detectCategory(descRaw);
    txns.push({
      date: dateStr,
      description: descRaw || 'Banka Harcaması',
      amount: Math.round(amount * 100) / 100,
      category
    });
  }

  return txns;
}

// ─────────────────────────────────────────────
// ANA PARSER FONKSİYONU
// ─────────────────────────────────────────────
export function parseBankStatement(rawText: string): ParsedStatement {
  const normText = normalizeTR(rawText.replace(/\r/g, ''));

  // ── Banka Tespiti ────────────────────────
  let bankName: 'isbank' | 'enpara' | 'unknown' = 'unknown';

  if (
    normText.includes('is bank') || normText.includes('isbank') ||
    normText.includes('turkiye is') || normText.includes('maximum') ||
    normText.includes('maxipuan') || normText.includes('is bankasi')
  ) {
    bankName = 'isbank';
  } else if (
    normText.includes('enpara') || normText.includes('qnb') ||
    normText.includes('finansbank') || normText.includes('qnb finansbank')
  ) {
    bankName = 'enpara';
  }

  // ── Banka Şablonu Uygula ─────────────────
  let bankFields: Partial<ParsedStatement> = {};
  if (bankName === 'isbank') {
    bankFields = parseIsbank(rawText, normText);
  } else if (bankName === 'enpara') {
    bankFields = parseEnpara(rawText, normText);
  } else {
    // Bilinmeyen banka → genel ayrıştırma
    bankFields = {
      totalDebt: grab(normText, ['toplam borc', 'hesap ozeti borcu', 'ekstre borcu', 'borc tutari']),
      minimumPayment: grab(normText, ['asgari odeme', 'minimum odeme']),
      interestRate: (() => {
        const m = normText.match(/yillik[^%\n]{0,50}%\s*([\d.,]+)/i);
        return m ? parseTrNumber(m[1]) : 0;
      })(),
      cardNumberLast4: '****',
      cutoffDate: '',
    };
  }

  // ── İşlemleri Çıkar ──────────────────────
  const transactions = extractTransactions(rawText);

  // ── Kategori Toplamları ───────────────────
  const categoryTotals = {
    essentials: 0,
    financial: 0,
    discretionary: 0,
    subscriptions: 0,
    installments: 0
  };
  for (const tx of transactions) {
    categoryTotals[tx.category] += tx.amount;
  }

  // Toplamları yuvarla
  for (const key of Object.keys(categoryTotals) as Array<keyof typeof categoryTotals>) {
    categoryTotals[key] = Math.round(categoryTotals[key] * 100) / 100;
  }

  return {
    bankName,
    cardNumberLast4: bankFields.cardNumberLast4 || '****',
    totalDebt: Math.round((bankFields.totalDebt || 0) * 100) / 100,
    interestRate: Math.round((bankFields.interestRate || 0) * 100) / 100,
    minimumPayment: Math.round((bankFields.minimumPayment || 0) * 100) / 100,
    cutoffDate: bankFields.cutoffDate || '',
    transactions,
    categoryTotals
  };
}
