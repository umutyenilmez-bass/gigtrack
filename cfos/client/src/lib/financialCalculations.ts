/**
 * Finansal Hesaplama Yardımcı Fonksiyonları
 * Borç yönetimi, faiz hesaplama ve ödeme planlaması için
 */

export interface DebtScenario {
  currentDebt: number;
  monthlyPayment: number;
  interestRate: number;
  months: number;
}

export interface PaymentSchedule {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  remainingDebt: number;
}

/**
 * Aylık faiz oranını hesapla
 */
export function calculateMonthlyInterestRate(annualRate: number): number {
  return annualRate / 12 / 100;
}

/**
 * Bir borcu kapatmak için gereken ayı hesapla
 */
export function calculateMonthsToPayOff(
  debt: number,
  monthlyPayment: number,
  annualInterestRate: number
): number {
  if (monthlyPayment <= 0) return Infinity;
  
  const monthlyRate = calculateMonthlyInterestRate(annualInterestRate);
  
  if (monthlyRate === 0) {
    return Math.ceil(debt / monthlyPayment);
  }
  
  // Formül: n = -log(1 - (debt * r / payment)) / log(1 + r)
  const numerator = 1 - (debt * monthlyRate) / monthlyPayment;
  
  if (numerator <= 0) {
    return Infinity; // Ödeme faizden az, borç asla kapanmaz
  }
  
  return Math.ceil(-Math.log(numerator) / Math.log(1 + monthlyRate));
}

/**
 * Ödeme planı oluştur
 */
export function generatePaymentSchedule(
  initialDebt: number,
  monthlyPayment: number,
  annualInterestRate: number,
  maxMonths: number = 60
): PaymentSchedule[] {
  const schedule: PaymentSchedule[] = [];
  const monthlyRate = calculateMonthlyInterestRate(annualInterestRate);
  
  let remainingDebt = initialDebt;
  
  for (let month = 1; month <= maxMonths && remainingDebt > 0; month++) {
    const interest = remainingDebt * monthlyRate;
    const principal = Math.min(monthlyPayment - interest, remainingDebt);
    
    remainingDebt = Math.max(0, remainingDebt - principal);
    
    schedule.push({
      month,
      payment: monthlyPayment,
      interest,
      principal,
      remainingDebt,
    });
    
    if (remainingDebt === 0) break;
  }
  
  return schedule;
}

/**
 * Toplam faiz maliyetini hesapla
 */
export function calculateTotalInterest(
  initialDebt: number,
  monthlyPayment: number,
  annualInterestRate: number
): number {
  const schedule = generatePaymentSchedule(
    initialDebt,
    monthlyPayment,
    annualInterestRate
  );
  
  return schedule.reduce((total, payment) => total + payment.interest, 0);
}

/**
 * Nakit akışı analizi
 */
export interface CashFlowAnalysis {
  monthlyIncome: number;
  fixedExpenses: number;
  variableExpenses: number;
  totalExpenses: number;
  availableForDebt: number;
  debtPaymentCapacity: number;
}

export function analyzeCashFlow(
  monthlyIncome: number,
  fixedExpenses: number,
  variableExpenses: number,
  minimumDebtPayment: number
): CashFlowAnalysis {
  const totalExpenses = fixedExpenses + variableExpenses;
  const availableForDebt = monthlyIncome - totalExpenses;
  const debtPaymentCapacity = Math.max(0, availableForDebt);
  
  return {
    monthlyIncome,
    fixedExpenses,
    variableExpenses,
    totalExpenses,
    availableForDebt,
    debtPaymentCapacity,
  };
}

/**
 * Borç Çığı Stratejisi (Debt Avalanche)
 * En yüksek faizli borçtan başlayarak ödeme
 */
export interface Debt {
  name: string;
  balance: number;
  interestRate: number;
  minimumPayment: number;
}

export interface AvalancheStrategy {
  order: Debt[];
  totalMonthlyPayment: number;
  estimatedPayoffMonths: number;
  totalInterestCost: number;
}

export function calculateDebtAvalanche(
  debts: Debt[],
  totalMonthlyPayment: number
): AvalancheStrategy {
  // Faiz oranına göre sırala (en yüksekten en düşüğe)
  const sortedDebts = [...debts].sort((a, b) => b.interestRate - a.interestRate);
  
  // Tahmini ödeme süresi hesapla
  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  const avgInterestRate = debts.reduce((sum, d) => sum + d.interestRate, 0) / debts.length;
  const estimatedMonths = calculateMonthsToPayOff(totalDebt, totalMonthlyPayment, avgInterestRate);
  
  // Toplam faiz maliyeti
  const totalInterest = calculateTotalInterest(totalDebt, totalMonthlyPayment, avgInterestRate);
  
  return {
    order: sortedDebts,
    totalMonthlyPayment,
    estimatedPayoffMonths: isFinite(estimatedMonths) ? Math.ceil(estimatedMonths) : 999,
    totalInterestCost: totalInterest,
  };
}

/**
 * Borç Kartopu Stratejisi (Debt Snowball)
 * En düşük bakiyeli borçtan başlayarak ödeme
 */
export interface SnowballStrategy {
  order: Debt[];
  totalMonthlyPayment: number;
  estimatedPayoffMonths: number;
  totalInterestCost: number;
}

export function calculateDebtSnowball(
  debts: Debt[],
  totalMonthlyPayment: number
): SnowballStrategy {
  // Bakiyeye göre sırala (en düşükten en yükseğe)
  const sortedDebts = [...debts].sort((a, b) => a.balance - b.balance);
  
  // Tahmini ödeme süresi hesapla
  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  const avgInterestRate = debts.reduce((sum, d) => sum + d.interestRate, 0) / debts.length;
  const estimatedMonths = calculateMonthsToPayOff(totalDebt, totalMonthlyPayment, avgInterestRate);
  
  // Toplam faiz maliyeti
  const totalInterest = calculateTotalInterest(totalDebt, totalMonthlyPayment, avgInterestRate);
  
  return {
    order: sortedDebts,
    totalMonthlyPayment,
    estimatedPayoffMonths: isFinite(estimatedMonths) ? Math.ceil(estimatedMonths) : 999,
    totalInterestCost: totalInterest,
  };
}

/**
 * Acil durum fonu hedefini hesapla
 */
export function calculateEmergencyFundTarget(
  monthlyExpenses: number,
  months: number = 6
): number {
  return monthlyExpenses * months;
}

/**
 * Tasarruf hedefini hesapla
 */
export function calculateSavingsGoal(
  currentAmount: number,
  targetAmount: number,
  monthlyContribution: number
): number {
  if (monthlyContribution <= 0) return Infinity;
  return Math.ceil((targetAmount - currentAmount) / monthlyContribution);
}
