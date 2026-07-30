/**
 * Client-side Finansal Analiz Motoru (Kural Tabanlı)
 * server/financialEngine.ts ile aynı mantık — tarayıcıda çalışır
 */

export interface Debt {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimumPayment: number;
  currency?: string;
  bankName?: string;
  spending?: Record<string, number>;
  type?: 'debt' | 'receivable';
  isPredictedOnly?: boolean;
  archived?: boolean;
  statementDate?: string;
  carriedOverAmount?: number;
}

export interface MonthlyExpenses {
  essentials: number;
  financial: number;
  discretionary: number;
  subscriptions: number;
  installments: number;
}

export interface MonthlyScheduleRow {
  month: number;
  totalPayment: number;
  totalInterest: number;
  totalPrincipal: number;
  totalRemaining: number;
  debts: { id: string; name: string; balance: number }[];
  payments: { id: string; name: string; amount: number; isExtra: boolean }[];
}

export interface DebtPayoffPlan {
  strategy: 'avalanche' | 'snowball';
  totalMonths: number;
  totalInterestPaid: number;
  totalPaid: number;
  schedule: MonthlyScheduleRow[];
}

export interface CashFlowAnalysis {
  monthlyIncome: number;
  rent: number;
  totalExpenses: number;
  totalMinimumPayments: number;
  availableForExtraPayment: number;
  netCashFlow: number;
  cashFlowStatus: 'healthy' | 'tight' | 'critical' | 'negative';
  utilizationRate: number;
  debtToIncomeRatio: number;
}

export interface FinancialAlert {
  level: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
  action: string;
}

// ─── Faiz ────────────────────────────────────────────────
function monthlyRate(apr: number) { return apr / 100 / 12; }

// ─── Ödeme Planı Simülasyonu ──────────────────────────────
export function simulatePayoff(
  debts: Debt[],
  extraPayment: number,
  strategy: 'avalanche' | 'snowball',
  maxMonths = 360,
  monthlyCardSpend = 0   // ← Aylık karta yüklenen yeni zaruri harcamalar (Rolling Debt)
): DebtPayoffPlan {
  // Filter out rent expenses/incomes and zero balance items from simulation
  let remaining = debts
    .filter(d => d.balance > 0.01 && d.id !== 'manual_rent_expense' && d.id !== 'manual_rent_income')
    .map(d => ({ ...d }));

  const sortFn = strategy === 'avalanche'
    ? (a: Debt, b: Debt) => b.apr - a.apr
    : (a: Debt, b: Debt) => a.balance - b.balance;

  const schedule: MonthlyScheduleRow[] = [];
  let totalInterestPaid = 0;
  let totalPaid = 0;
  let month = 0;

  while (remaining.some(d => d.balance > 0.01) && month < maxMonths) {
    month++;
    const sorted = [...remaining].sort(sortFn);
    let monthInterest = 0;
    let monthPrincipal = 0;
    let monthPayment = 0;
    let extra = extraPayment;
    const monthPayments: { id: string; name: string; amount: number; isExtra: boolean }[] = [];

    // 1. Faiz ekle
    for (const debt of sorted) {
      if (debt.balance <= 0.01) continue;
      const interest = debt.balance * monthlyRate(debt.apr);
      debt.balance += interest;
      monthInterest += interest;
      totalInterestPaid += interest;
    }

    // 1b. Aylık kart harcamalarını (rolling charge) borçlara dağıt
    // En yüksek faizli karta yükle (avalanche uyumlu) ya da hepsine orantılı
    if (monthlyCardSpend > 0 && sorted.length > 0) {
      // En yüksek faizli karta yükle
      const targetDebt = [...sorted].sort((a, b) => b.apr - a.apr)[0];
      if (targetDebt) {
        targetDebt.balance += monthlyCardSpend;
      }
    }

    // 2. Asgari ödemeleri yap
    for (const debt of sorted) {
      if (debt.balance <= 0.01) continue;
      let payment = Math.min(debt.minimumPayment, debt.balance);
      debt.balance -= payment;
      monthPayment += payment;
      totalPaid += payment;

      if (payment > 0.01) {
        monthPayments.push({
          id: debt.id,
          name: debt.name,
          amount: payment,
          isExtra: false
        });
      }
    }

    // 3. Ekstra ödemeyi şelale (waterfall) yöntemiyle sırayla borçlara dağıt
    for (const debt of sorted) {
      if (debt.balance <= 0.01) continue;
      if (extra <= 0) break;

      const extraApplied = Math.min(extra, debt.balance);
      debt.balance -= extraApplied;
      monthPayment += extraApplied;
      totalPaid += extraApplied;
      extra -= extraApplied;

      const existingPay = monthPayments.find(p => p.id === debt.id);
      if (existingPay) {
        existingPay.amount += extraApplied;
        existingPay.isExtra = true;
      } else if (extraApplied > 0.01) {
        monthPayments.push({
          id: debt.id,
          name: debt.name,
          amount: extraApplied,
          isExtra: true
        });
      }
    }

    // Taksitleri yuvarla
    const roundedPayments = monthPayments.map(p => ({
      ...p,
      amount: Math.round(p.amount)
    })).filter(p => p.amount > 0);

    monthPrincipal = monthPayment - monthInterest;
    remaining = sorted.filter(d => d.balance > 0.01);

    schedule.push({
      month,
      totalPayment: Math.round(monthPayment),
      totalInterest: Math.round(monthInterest),
      totalPrincipal: Math.round(monthPrincipal),
      totalRemaining: Math.round(remaining.reduce((s, d) => s + d.balance, 0)),
      debts: remaining.map(d => ({ id: d.id, name: d.name, balance: Math.round(d.balance) })),
      payments: roundedPayments
    });
  }

  return {
    strategy,
    totalMonths: month,
    totalInterestPaid: Math.round(totalInterestPaid),
    totalPaid: Math.round(totalPaid),
    schedule
  };
}

// ─── Nakit Akışı Analizi ──────────────────────────────────
export function analyzeCashFlow(
  monthlyIncome: number,
  rent: number,
  expenses: MonthlyExpenses,
  debts: Debt[]
): CashFlowAnalysis {
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  const totalMinimumPayments = debts.reduce((s, d) => s + d.minimumPayment, 0);
  const netCashFlow = monthlyIncome - rent - totalExpenses - totalMinimumPayments;
  const availableForExtraPayment = Math.max(0, netCashFlow);

  const debtToIncomeRatio = monthlyIncome > 0
    ? ((totalMinimumPayments + rent) / monthlyIncome) * 100 : 0;
  const utilizationRate = monthlyIncome > 0
    ? ((totalExpenses + totalMinimumPayments + rent) / monthlyIncome) * 100 : 0;

  let cashFlowStatus: CashFlowAnalysis['cashFlowStatus'];
  if (netCashFlow > monthlyIncome * 0.2) cashFlowStatus = 'healthy';
  else if (netCashFlow > 0) cashFlowStatus = 'tight';
  else if (netCashFlow > -(monthlyIncome * 0.1)) cashFlowStatus = 'critical';
  else cashFlowStatus = 'negative';

  return {
    monthlyIncome,
    rent,
    totalExpenses,
    totalMinimumPayments,
    availableForExtraPayment,
    netCashFlow,
    cashFlowStatus,
    utilizationRate: Math.round(utilizationRate * 10) / 10,
    debtToIncomeRatio: Math.round(debtToIncomeRatio * 10) / 10,
  };
}

// ─── Uyarı Sistemi ────────────────────────────────────────
export function generateAlerts(
  cashFlow: CashFlowAnalysis,
  debts: Debt[]
): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];

  if (cashFlow.cashFlowStatus === 'negative') {
    alerts.push({
      level: 'critical',
      code: 'NEGATIVE_CASHFLOW',
      message: `Nakit akışı ${Math.abs(cashFlow.netCashFlow).toLocaleString('tr-TR')} ₺ negatif!`,
      action: 'Zorunlu olmayan tüm harcamaları derhal durdurun.'
    });
  } else if (cashFlow.cashFlowStatus === 'critical') {
    alerts.push({
      level: 'warning',
      code: 'CRITICAL_CASHFLOW',
      message: 'Nakit akışı kritik — çok az ekstra ödeme kapasitesi var.',
      action: 'Abonelik ve keyfi harcamaları kısın.'
    });
  }

  if (cashFlow.debtToIncomeRatio > 50) {
    alerts.push({
      level: 'critical',
      code: 'HIGH_DTI',
      message: `Borç/Gelir oranı: %${cashFlow.debtToIncomeRatio.toFixed(0)} (kritik üst sınır: %50)`,
      action: 'Yeni kredi almayın. Mevcut borçları en kısa sürede kapatın.'
    });
  } else if (cashFlow.debtToIncomeRatio > 36) {
    alerts.push({
      level: 'warning',
      code: 'ELEVATED_DTI',
      message: `Borç/Gelir oranı: %${cashFlow.debtToIncomeRatio.toFixed(0)} (riskli bölge)`,
      action: 'Harcamaları azaltıp ekstra ödeme kapasitesini artırın.'
    });
  }

  const maxApr = debts.length ? Math.max(...debts.map(d => d.apr)) : 0;
  if (maxApr > 40) {
    alerts.push({
      level: 'critical',
      code: 'HIGH_INTEREST',
      message: `%${maxApr.toFixed(0)} yıllık faizli borcunuz var — her gün faiz işliyor!`,
      action: 'Avalanche yöntemi: En yüksek faizli borç önce ödenirse en fazla tasarruf edilir.'
    });
  }

  if (cashFlow.availableForExtraPayment > 500) {
    alerts.push({
      level: 'info',
      code: 'EXTRA_PAYMENT',
      message: `Aylık ${cashFlow.availableForExtraPayment.toLocaleString('tr-TR')} ₺ ekstra ödeme kapasitesi mevcut.`,
      action: 'Bu tutarı en yüksek faizli borca yönlendirin.'
    });
  }

  return alerts;
}

// ─── Tahmini Kapanış Ayı ─────────────────────────────────
export function estimatePayoffMonths(
  balance: number,
  apr: number,
  monthlyPayment: number
): number {
  if (monthlyPayment <= 0 || balance <= 0) return 0;
  const r = monthlyRate(apr);
  if (r === 0) return Math.ceil(balance / monthlyPayment);
  const ratio = (r * balance) / monthlyPayment;
  if (ratio >= 1) return 999;
  return Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
}

// ─── Para Formatı ─────────────────────────────────────────
export function formatCurrency(amount: number, currency = 'TRY'): string {
  return new Intl.NumberFormat(currency === 'TRY' ? 'tr-TR' : 'en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}


// ─── Borç Toplamları Hesaplama ─────────────────────────────
export function calculateDebtTotals(debtsList: Debt[]) {
  const filteredList = debtsList.filter(d => d.type !== 'receivable' && !d.archived);
  const totalDebt = filteredList.reduce((s, d) => s + d.balance, 0);
  const minimumPaymentIsBankasi = filteredList
    .filter(d => d.bankName === 'isbank' || d.name.includes('İş Bankası'))
    .reduce((s, d) => s + d.minimumPayment, 0);
  const minimumPaymentEnpara = filteredList
    .filter(d => d.bankName === 'enpara' || d.name.includes('Enpara'))
    .reduce((s, d) => s + d.minimumPayment, 0);

  return { totalDebt, minimumPaymentIsBankasi, minimumPaymentEnpara };
}

// ─── Manuel Ödeme Uygulama ──────────────────────────────────
export function applyPaymentToDebt(debtsList: Debt[], selectedDebtId: string, amount: number): Debt[] {
  return debtsList.map(d => {
    if (d.id !== selectedDebtId && !((d.bankName || '').toLowerCase().includes(selectedDebtId.toLowerCase()) || (d.name || '').toLowerCase().includes(selectedDebtId.toLowerCase()))) {
      return d;
    }
    const newBalance = Math.max(0, d.balance - amount);
    const newMin = Math.max(0, d.minimumPayment - amount);
    return { ...d, balance: newBalance, minimumPayment: Math.min(newMin, newBalance) };
  });
}


// ─── Chat Prompt Değişkenleri Hesaplama ─────────────────────
export function calculateChatPromptVariables(
  monthlyIncome: number,
  rent: number,
  totalDebt: number,
  interestRate: number,
  minPaymentIsBankasi: number,
  minPaymentEnpara: number,
  expenses: MonthlyExpenses
) {
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  const debtPaymentCapacity = monthlyIncome - rent - totalExpenses;
  const monthlyInterest = (totalDebt * interestRate) / 100;
  
  const totalMinimumPayments = minPaymentIsBankasi + minPaymentEnpara;
  const totalPayment = totalMinimumPayments + Math.max(0, debtPaymentCapacity - totalMinimumPayments);
  const monthsToPayOff = totalPayment > 0 ? Math.ceil(totalDebt / totalPayment) : Infinity;

  return {
    totalExpenses,
    debtPaymentCapacity,
    monthlyInterest,
    totalPayment,
    monthsToPayOff
  };
}
