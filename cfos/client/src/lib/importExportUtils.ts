import { FinancialData } from '../pages/Home';

export interface AppState {
  financialData: FinancialData;
  expenses: {
    essentials: number;
    financial: number;
    discretionary: number;
    subscriptions: number;
    installments: number;
  };
}

export function generateJSONExport(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function generateTXTExport(state: AppState): string {
  const { financialData, expenses } = state;
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  return `=== FİNANS KONTROL RAPORU ===
Tarih: ${new Date().toLocaleDateString('tr-TR')}

GELİR VE SABİT GİDERLER:
- Aylık Net Gelir: ${financialData.monthlyIncome.toLocaleString('tr-TR')} TL
- Aylık Kira Gideri: ${financialData.rent.toLocaleString('tr-TR')} TL

BORÇ DURUMU:
- Toplam Kredi Kartı Borcu: ${financialData.totalDebt.toLocaleString('tr-TR')} TL
- Aylık Faiz Oranı: %${financialData.interestRate}
- İş Bankası Asgari Ödeme: ${financialData.minimumPaymentIsBankasi.toLocaleString('tr-TR')} TL
- Enpara Asgari Ödeme: ${financialData.minimumPaymentEnpara.toLocaleString('tr-TR')} TL

HARCAMA DETAYLARI:
- Mecburi Giderler: ${expenses.essentials.toLocaleString('tr-TR')} TL
- Finansal Giderler: ${expenses.financial.toLocaleString('tr-TR')} TL
- Keyfi Giderler: ${expenses.discretionary.toLocaleString('tr-TR')} TL
- Abonelikler: ${expenses.subscriptions.toLocaleString('tr-TR')} TL
- Taksitler: ${expenses.installments.toLocaleString('tr-TR')} TL
- Toplam Giderler: ${totalExpenses.toLocaleString('tr-TR')} TL
`;
}

export function generateMDExport(state: AppState): string {
  const { financialData, expenses } = state;
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  const availableForDebt = financialData.monthlyIncome - financialData.rent - totalExpenses;

  return `# 📊 Kişisel Finans Kontrol Raporu
*Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}*

## 💰 Gelir ve Gider Özeti
| Kalem | Tutar (TL) | Açıklama |
| :--- | :---: | :--- |
| **Aylık Net Gelir** | ${financialData.monthlyIncome.toLocaleString('tr-TR')} TL | Aylık Net Maaş / Gelirler |
| **Sabit Kira Gideri** | ${financialData.rent.toLocaleString('tr-TR')} TL | Sabit Kira Ödemesi |
| **Toplam Harcama** | ${totalExpenses.toLocaleString('tr-TR')} TL | Diğer Tüm Giderler |
| **Ödeme Kapasitesi** | ${availableForDebt.toLocaleString('tr-TR')} TL | Borca Yönlendirilebilir Tutar |

## 💳 Kredi Kartı Borçları & Asgari Ödemeler
- **Toplam Borç**: ${financialData.totalDebt.toLocaleString('tr-TR')} TL
- **Aylık Faiz Oranı**: %${financialData.interestRate}
- **İş Bankası Asgari**: ${financialData.minimumPaymentIsBankasi.toLocaleString('tr-TR')} TL
- **Enpara Asgari**: ${financialData.minimumPaymentEnpara.toLocaleString('tr-TR')} TL

## 🔍 Harcama Kategorileri Dağılımı
*   **Mecburi Giderler:** ${expenses.essentials.toLocaleString('tr-TR')} TL
*   **Finansal Giderler:** ${expenses.financial.toLocaleString('tr-TR')} TL
*   **Keyfi / Sosyal Giderler:** ${expenses.discretionary.toLocaleString('tr-TR')} TL
*   **Abonelikler:** ${expenses.subscriptions.toLocaleString('tr-TR')} TL
*   **Taksitler:** ${expenses.installments.toLocaleString('tr-TR')} TL
`;
}

export function generateHTMLExport(state: AppState, title = "Finans Raporu"): string {
  const { financialData, expenses } = state;
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  const availableForDebt = financialData.monthlyIncome - financialData.rent - totalExpenses;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; padding: 30px; background-color: #f8fafc; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; font-size: 28px; }
    h2 { color: #2563eb; margin-top: 30px; font-size: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background-color: #f1f5f9; font-weight: 600; color: #1e293b; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; background: #e0f2fe; color: #0369a1; }
    .highlight { font-weight: bold; color: #1e3a8a; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Kişisel Finans & Borç Analiz Raporu</h1>
    <p><em>Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}</em></p>
    
    <h2>💰 Gelir ve Nakit Akışı Özeti</h2>
    <table>
      <thead>
        <tr>
          <th>Kalem</th>
          <th>Tutar (TL)</th>
          <th>Açıklama</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Aylık Net Gelir</td>
          <td class="highlight">${financialData.monthlyIncome.toLocaleString('tr-TR')} ₺</td>
          <td>Toplam Nakit Girişi</td>
        </tr>
        <tr>
          <td>Sabit Giderler (Kira)</td>
          <td>${financialData.rent.toLocaleString('tr-TR')} ₺</td>
          <td>Kira Ödemesi</td>
        </tr>
        <tr>
          <td>Aylık Toplam Harcamalar</td>
          <td>${totalExpenses.toLocaleString('tr-TR')} ₺</td>
          <td>Değişken & Diğer Kategoriler</td>
        </tr>
        <tr style="background-color: #f0fdf4;">
          <td class="highlight">Ödeme Kapasitesi</td>
          <td class="highlight" style="color: #166534;">${availableForDebt.toLocaleString('tr-TR')} ₺</td>
          <td style="color: #166534; font-weight: 500;">Borç Ödemeye Ayrılabilir Bakiye</td>
        </tr>
      </tbody>
    </table>

    <h2>💳 Kredi Kartı Borçları & Gecikme Önlemleri</h2>
    <table>
      <thead>
        <tr>
          <th>Kalem</th>
          <th>Tutar / Oran</th>
          <th>Açıklama</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Toplam Kart Borçları</td>
          <td class="highlight">${financialData.totalDebt.toLocaleString('tr-TR')} ₺</td>
          <td>Kümülatif Kredi Kartı Yükü</td>
        </tr>
        <tr>
          <td>Aylık Faiz Oranı</td>
          <td>%${financialData.interestRate}</td>
          <td>Ortalama Faiz Maliyeti</td>
        </tr>
        <tr>
          <td>İş Bankası Asgari Ödeme</td>
          <td style="color: #c2410c; font-weight: bold;">${financialData.minimumPaymentIsBankasi.toLocaleString('tr-TR')} ₺</td>
          <td>Kritik Adım - Bloke Riski Önleme</td>
        </tr>
        <tr>
          <td>Enpara Asgari Ödeme</td>
          <td style="color: #c2410c; font-weight: bold;">${financialData.minimumPaymentEnpara.toLocaleString('tr-TR')} ₺</td>
          <td>Ara Adım</td>
        </tr>
      </tbody>
    </table>

    <h2>🔍 Detaylı Harcama Dağılımı</h2>
    <ul>
      <li><strong>Mecburi Giderler (Market, Ulaşım, Sağlık vb.):</strong> ${expenses.essentials.toLocaleString('tr-TR')} ₺</li>
      <li><strong>Finansal Giderler (Faiz, Vergiler vb.):</strong> ${expenses.financial.toLocaleString('tr-TR')} ₺</li>
      <li><strong>Keyfi / Sosyal Giderler:</strong> ${expenses.discretionary.toLocaleString('tr-TR')} ₺</li>
      <li><strong>Abonelikler (Dijital Platformlar vb.):</strong> ${expenses.subscriptions.toLocaleString('tr-TR')} ₺</li>
      <li><strong>Taksitli Harcamalar:</strong> ${expenses.installments.toLocaleString('tr-TR')} ₺</li>
    </ul>
  </div>
</body>
</html>`;
}

export function downloadBlob(content: string, filename: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Regex parser to read financial numbers from imported text strings
export function parseFinancialText(text: string): Partial<AppState> {
  const result: Partial<AppState> = {
    financialData: {} as any,
    expenses: {} as any
  };

  const findNumber = (patterns: RegExp[]): number | null => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Strip out dots (thousands) and replace Turkish comma with dot
        let clean = match[1].replace(/\./g, '').replace(/,/g, '.');
        const num = parseFloat(clean);
        if (!isNaN(num)) return num;
      }
    }
    return null;
  };

  // Income
  const income = findNumber([
    /(?:Aylık Net Gelir|Aylık Gelir|Gelir|Income)\s*[:=-]?\s*([\d.,]+)/i,
    /Gelirler\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (income !== null) result.financialData!.monthlyIncome = income;

  // Rent
  const rent = findNumber([
    /(?:Aylık Kira Gideri|Aylık Kira|Kira|Rent)\s*[:=-]?\s*([\d.,]+)/i,
    /Sabit Kira\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (rent !== null) result.financialData!.rent = rent;

  // Total Debt
  const totalDebt = findNumber([
    /(?:Toplam Kredi Kartı Borcu|Toplam Borç|Borç|Total Debt)\s*[:=-]?\s*([\d.,]+)/i,
    /Toplam Kart Borçları\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (totalDebt !== null) result.financialData!.totalDebt = totalDebt;

  // Interest Rate
  const interestRate = findNumber([
    /(?:Aylık Faiz Oranı|Faiz Oranı|Faiz|Interest Rate)\s*[:=-]?\s*[\d.,%]*?([\d.,]+)/i
  ]);
  if (interestRate !== null) result.financialData!.interestRate = interestRate;

  // IsBankasi Minimum
  const isBankasi = findNumber([
    /(?:İş Bankası Asgari Ödeme|İş Bankası Asgari|İş Bankası|Is Bankasi)\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (isBankasi !== null) result.financialData!.minimumPaymentIsBankasi = isBankasi;

  // Enpara Minimum
  const enpara = findNumber([
    /(?:Enpara Asgari Ödeme|Enpara Asgari|Enpara)\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (enpara !== null) result.financialData!.minimumPaymentEnpara = enpara;

  // Expenses Essentials
  const essentials = findNumber([
    /(?:Mecburi Giderler|Mecburi|Essentials)\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (essentials !== null) result.expenses!.essentials = essentials;

  // Expenses Financial
  const financial = findNumber([
    /(?:Finansal Giderler|Finansal|Financial)\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (financial !== null) result.expenses!.financial = financial;

  // Expenses Discretionary
  const discretionary = findNumber([
    /(?:Keyfi Giderler|Keyfi|Discretionary)\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (discretionary !== null) result.expenses!.discretionary = discretionary;

  // Expenses Subscriptions
  const subscriptions = findNumber([
    /(?:Abonelikler|Abonelik|Subscriptions)\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (subscriptions !== null) result.expenses!.subscriptions = subscriptions;

  // Expenses Installments
  const installments = findNumber([
    /(?:Taksitler|Taksit|Installments)\s*[:=-]?\s*([\d.,]+)/i
  ]);
  if (installments !== null) result.expenses!.installments = installments;

  return result;
}
