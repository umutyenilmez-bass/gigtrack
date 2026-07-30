/**
 * Finansal Analiz Motoru — Kural Tabanlı (AI Yok)
 *
 * Modüller:
 *   1. Avalanche Algoritması  → En yüksek faizli borç önce
 *   2. Kartopu  Algoritması   → En küçük bakiyeli borç önce
 *   3. Nakit Akışı Analizi    → Gelir - Gider - Borç kapasitesi
 *   4. Faiz Hesabı            → Aylık/Yıllık bileşik faiz
 *   5. Uyarı Sistemi          → Kritik eşik tespiti
 */

// ────────────────────────────────────────────────────────
// Veri tipleri
// ────────────────────────────────────────────────────────

export interface Debt {
  id: string;
  name: string;
  balance: number;
  apr: number;           // Yıllık faiz oranı (%)
  minimumPayment: number;
  bankName?: string;
  currency?: string;
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

export interface FinancialInput {
  monthlyIncome: number;
  rent: number;
  debts: Debt[];
  expenses: MonthlyExpenses;
}

export interface PaymentStep {
  month: number;
  debtId: string;
  debtName: string;
  payment: number;
  interestPaid: number;
  principalPaid: number;
  remainingBalance: number;
}

export interface DebtPayoffPlan {
  strategy: 'avalanche' | 'snowball';
  steps: PaymentStep[];
  totalMonths: number;
  totalInterestPaid: number;
  totalPaid: number;
  monthlySchedule: MonthlyScheduleRow[];
}

export interface MonthlyScheduleRow {
  month: number;
  totalPayment: number;
  totalInterest: number;
  totalPrincipal: number;
  remainingDebts: { id: string; name: string; balance: number }[];
}

export interface CashFlowAnalysis {
  monthlyIncome: number;
  rent: number;
  totalExpenses: number;
  totalMinimumPayments: number;
  availableForExtraPayment: number;
  netCashFlow: number;
  cashFlowStatus: 'healthy' | 'tight' | 'critical' | 'negative';
  utilizationRate: number;           // Borç/Gelir oranı
  debtToIncomeRatio: number;         // Aylık borç servisi / Gelir
  emergencyFundMonths: number;       // Kaç aylık acil fon gerekli
}

export interface FinancialAlert {
  level: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
  action: string;
}

export interface FinancialAnalysisResult {
  cashFlow: CashFlowAnalysis;
  avalanchePlan: DebtPayoffPlan;
  snowballPlan: DebtPayoffPlan;
  alerts: FinancialAlert[];
  recommendedStrategy: 'avalanche' | 'snowball';
  savingsFromAvalanche: number;  // Avalanche'ın Kartopu'na göre faiz tasarrufu
}

// ────────────────────────────────────────────────────────
// 1. Nakit Akışı Analizi
// ────────────────────────────────────────────────────────

export function analyzeCashFlow(input: FinancialInput): CashFlowAnalysis {
  const totalExpenses = Object.values(input.expenses).reduce((a, b) => a + b, 0);
  const totalMinimumPayments = input.debts.reduce((s, d) => s + d.minimumPayment, 0);
  const totalDebt = input.debts.reduce((s, d) => s + d.balance, 0);

  const netCashFlow = input.monthlyIncome - input.rent - totalExpenses - totalMinimumPayments;
  const availableForExtraPayment = Math.max(0, netCashFlow);

  // Borç/Gelir oranı (aylık borç servisi / aylık gelir)
  const monthlyDebtService = totalMinimumPayments + input.rent;
  const debtToIncomeRatio = input.monthlyIncome > 0
    ? (monthlyDebtService / input.monthlyIncome) * 100
    : 0;

  // Toplam harcama kullanım oranı
  const utilizationRate = input.monthlyIncome > 0
    ? ((totalExpenses + totalMinimumPayments + input.rent) / input.monthlyIncome) * 100
    : 0;

  // Acil fon hesabı: 3 aylık toplam gider
  const emergencyFundMonths = 3;

  let cashFlowStatus: CashFlowAnalysis['cashFlowStatus'];
  if (netCashFlow > input.monthlyIncome * 0.2) cashFlowStatus = 'healthy';
  else if (netCashFlow > 0) cashFlowStatus = 'tight';
  else if (netCashFlow > -input.monthlyIncome * 0.1) cashFlowStatus = 'critical';
  else cashFlowStatus = 'negative';

  return {
    monthlyIncome: input.monthlyIncome,
    rent: input.rent,
    totalExpenses,
    totalMinimumPayments,
    availableForExtraPayment,
    netCashFlow,
    cashFlowStatus,
    utilizationRate: Math.round(utilizationRate * 10) / 10,
    debtToIncomeRatio: Math.round(debtToIncomeRatio * 10) / 10,
    emergencyFundMonths
  };
}

// ────────────────────────────────────────────────────────
// 2. Bileşik Faiz Hesabı (Aylık)
// ────────────────────────────────────────────────────────

function monthlyRate(apr: number): number {
  return apr / 100 / 12;
}

function calcMonthlyInterest(balance: number, apr: number): number {
  return balance * monthlyRate(apr);
}

// ────────────────────────────────────────────────────────
// 3. Ödeme Planı Simülasyonu (Avalanche / Kartopu)
// ────────────────────────────────────────────────────────

function simulatePayoff(
  debts: Debt[],
  extraMonthlyPayment: number,
  strategy: 'avalanche' | 'snowball',
  maxMonths = 360,
  monthlyCardSpend = 0   // ← Rolling Debt: Aylık karta yüklenen yeni zaruri harcamalar
): DebtPayoffPlan {
  // Filter out rent expenses/incomes and zero balance items from simulation
  let remaining = debts
    .filter(d => d.balance > 0.01 && d.id !== 'manual_rent_expense' && d.id !== 'manual_rent_income')
    .map(d => ({ ...d }));

  // Strateji sıralaması
  const sortFn = strategy === 'avalanche'
    ? (a: Debt, b: Debt) => b.apr - a.apr          // En yüksek faiz önce
    : (a: Debt, b: Debt) => a.balance - b.balance; // En küçük bakiye önce

  const allSteps: PaymentStep[] = [];
  const monthlySchedule: MonthlyScheduleRow[] = [];
  let totalInterestPaid = 0;
  let totalPaid = 0;
  let month = 0;

  while (remaining.some(d => d.balance > 0.01) && month < maxMonths) {
    month++;
    const sorted = [...remaining].sort(sortFn);
    let monthInterest = 0;
    let monthPrincipal = 0;
    let monthPayment = 0;
    let extra = extraMonthlyPayment;

    // 1. Faiz ekle
    for (const debt of sorted) {
      if (debt.balance <= 0.01) continue;
      const interest = calcMonthlyInterest(debt.balance, debt.apr);
      debt.balance += interest;
      monthInterest += interest;
      totalInterestPaid += interest;
    }

    // 1b. Aylık kart harcamalarını (rolling charge) en yüksek faizli borca yükle
    if (monthlyCardSpend > 0 && sorted.length > 0) {
      const targetDebt = [...sorted].sort((a, b) => b.apr - a.apr)[0];
      if (targetDebt) {
        targetDebt.balance += monthlyCardSpend;
      }
    }

    // 2. Asgari ödemeleri yap
    const stepPayments: Record<string, { payment: number; interest: number; principal: number }> = {};
    for (const debt of sorted) {
      if (debt.balance <= 0.01) continue;
      const interest = calcMonthlyInterest(debt.balance - calcMonthlyInterest(debt.balance, debt.apr), debt.apr); // approximate interest
      // Wait, let's keep calcMonthlyInterest simple:
      const interestVal = calcMonthlyInterest(debt.balance - (debt.balance * (debt.apr / 100 / 12)), debt.apr); // interest was added in step 1, so the interest component is interestVal
      
      let payment = Math.min(debt.minimumPayment, debt.balance);
      debt.balance -= payment;
      monthPayment += payment;
      totalPaid += payment;

      stepPayments[debt.id] = {
        payment,
        interest: interestVal,
        principal: payment - interestVal
      };
    }

    // 3. Ekstra ödemeyi şelale yöntemiyle sırayla borçlara dağıt
    for (const debt of sorted) {
      if (debt.balance <= 0.01) continue;
      if (extra <= 0) break;

      const extraApplied = Math.min(extra, debt.balance);
      debt.balance -= extraApplied;
      monthPayment += extraApplied;
      totalPaid += extraApplied;
      extra -= extraApplied;

      if (stepPayments[debt.id]) {
        stepPayments[debt.id].payment += extraApplied;
        stepPayments[debt.id].principal += extraApplied;
      } else {
        stepPayments[debt.id] = {
          payment: extraApplied,
          interest: 0,
          principal: extraApplied
        };
      }
    }

    // Record steps for each debt this month
    for (const debt of sorted) {
      const step = stepPayments[debt.id];
      if (step && step.payment > 0.01) {
        allSteps.push({
          month,
          debtId: debt.id,
          debtName: debt.name,
          payment: Math.round(step.payment * 100) / 100,
          interestPaid: Math.round(step.interest * 100) / 100,
          principalPaid: Math.round(step.principal * 100) / 100,
          remainingBalance: Math.round(debt.balance * 100) / 100,
        });
      }
    }

    monthPrincipal = monthPayment - monthInterest;
    remaining = sorted.filter(d => d.balance > 0.01);

    monthlySchedule.push({
      month,
      totalPayment: Math.round(monthPayment * 100) / 100,
      totalInterest: Math.round(monthInterest * 100) / 100,
      totalPrincipal: Math.round(monthPrincipal * 100) / 100,
      remainingDebts: remaining.map(d => ({
        id: d.id,
        name: d.name,
        balance: Math.round(d.balance * 100) / 100
      }))
    });
  }

  return {
    strategy,
    steps: allSteps,
    totalMonths: month,
    totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    monthlySchedule
  };
}

// ────────────────────────────────────────────────────────
// 4. Uyarı Sistemi
// ────────────────────────────────────────────────────────

export function generateAlerts(
  input: FinancialInput,
  cashFlow: CashFlowAnalysis
): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const totalDebt = input.debts.reduce((s, d) => s + d.balance, 0);

  // Negatif nakit akışı
  if (cashFlow.cashFlowStatus === 'negative') {
    alerts.push({
      level: 'critical',
      code: 'NEGATIVE_CASHFLOW',
      message: `Aylık nakit akışınız ${Math.abs(cashFlow.netCashFlow).toLocaleString('tr-TR')} ₺ negatif!`,
      action: 'Zorunlu olmayan harcamalarınızı derhal azaltın ve ek gelir kaynağı arayın.'
    });
  } else if (cashFlow.cashFlowStatus === 'critical') {
    alerts.push({
      level: 'warning',
      code: 'CRITICAL_CASHFLOW',
      message: 'Nakit akışınız kritik düzeyde düşük.',
      action: 'İsteğe bağlı ve abonelik harcamalarınızı gözden geçirin.'
    });
  }

  // Yüksek borç/gelir oranı
  if (cashFlow.debtToIncomeRatio > 50) {
    alerts.push({
      level: 'critical',
      code: 'HIGH_DTI',
      message: `Borç/Gelir oranınız %${cashFlow.debtToIncomeRatio.toFixed(0)} — önerilen üst sınır %50.`,
      action: 'Yeni kredi almaktan kaçının. Mevcut borçları öncelikli ödeyin.'
    });
  } else if (cashFlow.debtToIncomeRatio > 36) {
    alerts.push({
      level: 'warning',
      code: 'ELEVATED_DTI',
      message: `Borç/Gelir oranınız %${cashFlow.debtToIncomeRatio.toFixed(0)} — riskli bölgede.`,
      action: 'Dave Ramsey Baby Step 2: En küçük borcu önce kapatın ve kartopu etkisi yaratın.'
    });
  }

  // Yüksek faizli borç uyarısı
  const highInterestDebts = input.debts.filter(d => d.apr > 40);
  if (highInterestDebts.length > 0) {
    alerts.push({
      level: 'critical',
      code: 'HIGH_INTEREST',
      message: `%${Math.max(...highInterestDebts.map(d => d.apr)).toFixed(0)}+ faizli borcunuz var. Her gün faiz biriktirir!`,
      action: 'Avalanche yöntemi ile en yüksek faizli borçtan başlayın.'
    });
  }

  // Gelir kullanım oranı
  if (cashFlow.utilizationRate > 90) {
    alerts.push({
      level: 'critical',
      code: 'HIGH_UTILIZATION',
      message: `Gelirinizin %${cashFlow.utilizationRate}\'i harcamalar ve borçlara gidiyor.`,
      action: 'Acil durum fonu oluşturmadan önce harcamaları kısın.'
    });
  }

  // Olumlu uyarılar
  if (cashFlow.availableForExtraPayment > 0 && cashFlow.cashFlowStatus !== 'negative') {
    alerts.push({
      level: 'info',
      code: 'EXTRA_PAYMENT_AVAILABLE',
      message: `Aylık ${cashFlow.availableForExtraPayment.toLocaleString('tr-TR')} ₺ ekstra ödeme kapasitesine sahipsiniz.`,
      action: 'Bu tutarı en yüksek faizli borca yönlendirerek faiz maliyetini düşürebilirsiniz.'
    });
  }

  return alerts;
}

// ────────────────────────────────────────────────────────
// 5. Ana Analiz Fonksiyonu
// ────────────────────────────────────────────────────────

export function runFinancialAnalysis(input: FinancialInput): FinancialAnalysisResult {
  const cashFlow = analyzeCashFlow(input);
  const extraPayment = cashFlow.availableForExtraPayment;

  // İki plan hesapla
  const avalanchePlan = simulatePayoff(input.debts, extraPayment, 'avalanche');
  const snowballPlan  = simulatePayoff(input.debts, extraPayment, 'snowball');

  // Uyarıları oluştur
  const alerts = generateAlerts(input, cashFlow);

  // Strateji önerisi: çoğunlukla avalanche daha az faiz öder
  const savingsFromAvalanche = snowballPlan.totalInterestPaid - avalanchePlan.totalInterestPaid;
  const recommendedStrategy: 'avalanche' | 'snowball' =
    savingsFromAvalanche >= 0 ? 'avalanche' : 'snowball';

  return {
    cashFlow,
    avalanchePlan,
    snowballPlan,
    alerts,
    recommendedStrategy,
    savingsFromAvalanche: Math.abs(Math.round(savingsFromAvalanche * 100) / 100)
  };
}

// ────────────────────────────────────────────────────────
// 6. Tahmini Kapanış Ayı (tek borç için)
// ────────────────────────────────────────────────────────

export function estimatePayoffMonths(
  balance: number,
  apr: number,
  monthlyPayment: number
): number {
  if (monthlyPayment <= 0 || balance <= 0) return 0;
  const r = monthlyRate(apr);
  if (r === 0) return Math.ceil(balance / monthlyPayment);

  // n = -ln(1 - r*P/PMT) / ln(1+r)
  const ratio = (r * balance) / monthlyPayment;
  if (ratio >= 1) return 999; // Hiç kapanmaz
  return Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
}
