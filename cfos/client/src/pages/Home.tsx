import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart, Area, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import {
  AlertCircle, TrendingUp, TrendingDown, DollarSign, AlertTriangle, Upload,
  Download, CheckCircle2, LogOut, User as UserIcon, Loader2,
  ChevronDown, ChevronUp, Trash2, CreditCard, Target, Zap, ShieldAlert,
  Info, BarChart2, Calendar, ArrowRight, X, Check, ChevronRight
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useLocation } from 'wouter';
import {
  generateJSONExport, generateTXTExport, generateMDExport,
  generateHTMLExport, downloadBlob, parseFinancialText, AppState
} from '../lib/importExportUtils';
import {
  simulatePayoff, analyzeCashFlow, generateAlerts, calculateDebtTotals, applyPaymentToDebt, estimatePayoffMonths, formatCurrency,
  type Debt, type MonthlyExpenses, type CashFlowAnalysis, type FinancialAlert
} from '@shared/financialEngine';


// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface FinancialData {
  monthlyIncome: number;
  rent: number;
  rentIncome?: number;
  readyCash?: number;
  totalDebt: number;
  interestRate: number;
  minimumPaymentIsBankasi: number;
  minimumPaymentEnpara: number;
  debtsList?: Debt[];
}

// ─── Sabitler ────────────────────────────────────────────────────────────────

const EXPENSE_LABELS: Record<string, string> = {
  essentials: 'Zorunlu Giderler',
  financial: 'Finansal Giderler',
  discretionary: 'Keyfi Giderler',
  subscriptions: 'Abonelikler',
  installments: 'Taksitler',
};

const EXPENSE_COLORS: Record<string, string> = {
  essentials: '#3b82f6',
  financial: '#f97316',
  discretionary: '#a855f7',
  subscriptions: '#ec4899',
  installments: '#14b8a6',
};

// ─── Yardımcı: Risk Rengi ────────────────────────────────────────────────────
function statusColor(s: CashFlowAnalysis['cashFlowStatus']) {
  switch (s) {
    case 'healthy':  return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800' };
    case 'tight':    return { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   badge: 'bg-amber-100 text-amber-800' };
    case 'critical': return { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  badge: 'bg-orange-100 text-orange-800' };
    case 'negative': return { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     badge: 'bg-red-100 text-red-800' };
  }
}

function alertIcon(level: FinancialAlert['level']) {
  if (level === 'critical') return <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
  if (level === 'warning')  return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
  return <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />;
}

function alertBg(level: FinancialAlert['level']) {
  if (level === 'critical') return 'bg-red-50 border-red-200';
  if (level === 'warning')  return 'bg-amber-50 border-amber-200';
  return 'bg-blue-50 border-blue-200';
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

export default function Home() {
  const [, setLocation] = useLocation();
  const token = localStorage.getItem('token');
  const loggedInUser = localStorage.getItem('username') || '';

  // ── AI/Ayarlar State ──────────────────────────────────────────────────────
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasCurrencyApiKey, setHasCurrencyApiKey] = useState(false);
  const [hasDriveConfig, setHasDriveConfig] = useState(false);
  const [modelProvider, setModelProvider] = useState('gemini');
  const [localEndpoint, setLocalEndpoint] = useState('http://localhost:1234/v1');
  const [modelName, setModelName] = useState('');
  const [rates, setRates] = useState<{ usd: number; eur: number; gbp: number; isLive: boolean } | null>(null);

  // ── UI State ──────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);


  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [rolloverDebt, setRolloverDebt] = useState<Debt | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', balance: '', apr: '', minimumPayment: '' });
  
  const handleEditSubmit = async () => {
    if (!editingDebt) return;
    const updatedDebts = (financialData.debtsList || []).map(d => {
      if (d.id === editingDebt.id) {
        return {
          ...d,
          name: editFormData.name,
          balance: parseFloat(editFormData.balance) || 0,
          apr: parseFloat(editFormData.apr) || 0,
          minimumPayment: parseFloat(editFormData.minimumPayment) || 0
        };
      }
      return d;
    });
    const newFd = { ...financialData, debtsList: updatedDebts };
    setFinancialData(newFd);
    await saveData(newFd, expenses);
    setEditingDebt(null);
  };

  const handleRollover = async () => {
    if (!rolloverDebt) return;
    
    let updatedDebts = [...(financialData.debtsList || [])];
    
    // Archive current debt
    updatedDebts = updatedDebts.map(d => {
      if (d.id === rolloverDebt.id) {
        return { ...d, archived: true };
      }
      return d;
    });
    
    // If there is remaining balance, create a new cycle debt
    if (rolloverDebt.balance > 0) {
      const newDebt = {
        ...rolloverDebt,
        id: 'card_' + Date.now(),
        archived: false,
        carriedOverAmount: rolloverDebt.balance,
        statementDate: new Date().toISOString()
      };
      updatedDebts.push(newDebt);
    }
    
    // Recalculate totals EXCLUDING archived entries
    const totals = calculateDebtTotals(updatedDebts);
    const newFd = {
      ...financialData,
      totalDebt: totals.totalDebt,
      minimumPaymentIsBankasi: totals.minimumPaymentIsBankasi,
      minimumPaymentEnpara: totals.minimumPaymentEnpara,
      debtsList: updatedDebts
    };
    setFinancialData(newFd);
    await saveData(newFd, expenses);
    setRolloverDebt(null);
  };

  const [activeTab, setActiveTab] = useState('dashboard');
  const [exportFormat, setExportFormat] = useState('json');

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState<'ORIGINAL' | 'TRY'>('TRY');
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [expandedTransactions, setExpandedTransactions] = useState<any[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);

  const toggleExpandDebt = async (debtId: string) => {
    if (expandedDebtId === debtId) {
      setExpandedDebtId(null);
      setExpandedTransactions([]);
      return;
    }
    setExpandedDebtId(debtId);
    if (debtId.startsWith('card_')) {
      setIsLoadingTransactions(true);
      setExpandedTransactions([]);
      try {
        const res = await fetch(`/api/profile/transactions?cardId=${debtId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setExpandedTransactions(data.transactions || []);
        }
      } catch (err) {
        console.error("İşlemler yüklenemedi:", err);
      } finally {
        setIsLoadingTransactions(false);
      }
    }
  };

  const [activeStrategy, setActiveStrategy] = useState<'avalanche' | 'snowball'>('avalanche');

  // ── Yeni Borç Formu (Kişisel Bilanço Modeli) ──────────────────────────────────
  const [activeAddForm, setActiveAddForm] = useState<'receivable' | 'debt' | null>(null);
  const [addName, setAddName] = useState('');
  const [addBalance, setAddBalance] = useState('');
  const [addCurrency, setAddCurrency] = useState('TRY');
  const [addDueDateOption, setAddDueDateOption] = useState<'this_month' | 'next_month' | 'uncertain'>('this_month');
  const [addIsPredictedOnly, setAddIsPredictedOnly] = useState(false);
  const [addDueDate, setAddDueDate] = useState('');

  const [drafts, setDrafts] = useState<any[]>([]);
  const [rejectedDraftIds, setRejectedDraftIds] = useState<string[]>([]);

  // ── GigTrack Auto Sync ──────────────────────────────────────────────────
  const [gigTrackIncome, setGigTrackIncome] = useState<number>(0);
  const [gigTrackCount, setGigTrackCount] = useState<number>(0);

  const syncGigTrackEarnings = useCallback(() => {
    if (typeof (window as any).getGigTrackPaidEarnings === 'function') {
      const data = (window as any).getGigTrackPaidEarnings();
      if (data) {
        setGigTrackIncome(data.totalTRY || 0);
        setGigTrackCount(data.paidCount || 0);
      }
    }
  }, []);

  useEffect(() => {
    syncGigTrackEarnings();
    window.addEventListener('focus', syncGigTrackEarnings);
    window.addEventListener('gigtrack-data-changed', syncGigTrackEarnings);
    return () => {
      window.removeEventListener('focus', syncGigTrackEarnings);
      window.removeEventListener('gigtrack-data-changed', syncGigTrackEarnings);
    };
  }, [syncGigTrackEarnings]);

  // ── Finansal Veri ─────────────────────────────────────────────────────────
  const [financialData, setFinancialData] = useState<FinancialData>({
    monthlyIncome: 0,
    rent: 0,
    rentIncome: 0,
    readyCash: 0,
    totalDebt: 0,
    interestRate: 0,
    minimumPaymentIsBankasi: 0,
    minimumPaymentEnpara: 0,
    debtsList: []
  });

  const [expenses, setExpenses] = useState<MonthlyExpenses>({
    essentials: 67594,
    financial: 18276,
    discretionary: 8360,
    subscriptions: 1865,
    installments: 14820,
  });

  // ── Profil Yükle ─────────────────────────────────────────────────────────
  const fetchProfileData = useCallback(() => {
    if (!token) { setLocation('/auth'); return; }
    fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          setLocation('/auth');
          throw new Error('Oturum süresi doldu.');
        }
        return res.json();
      })
      .then(data => {
        if (data.financialData) setFinancialData(data.financialData);
        if (data.expenses)     setExpenses(data.expenses);
        setHasApiKey(data.hasApiKey);
        setHasCurrencyApiKey(data.hasCurrencyApiKey);
        setHasDriveConfig(data.hasDriveConfig || false);
        setModelProvider(data.modelProvider || 'gemini');
        setLocalEndpoint(data.localEndpoint || 'http://localhost:1234/v1');
        setModelName(data.modelName || '');
        
        // Fetch drafts
        fetch('/api/upload/drafts', { headers: { 'Authorization': `Bearer ${token}` } })
          .then(r => r.json())
          .then(d => { if (d.drafts) setDrafts(d.drafts); })
          .catch(err => console.error('Taslak yükleme hatası:', err));
      })
      .catch(err => console.error('Profil yükleme hatası:', err));
  }, [token, setLocation]);

  const fetchCurrencyRates = useCallback(() => {
    let loaded = false;
    if (token) {
      fetch('/api/profile/rates', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.usd) {
            setRates({ usd: data.usd, eur: data.eur, gbp: data.gbp, isLive: data.isLive });
            loaded = true;
          }
        })
        .catch(() => {});
    }

    // Direct live open API fetch fallback
    setTimeout(() => {
      if (!loaded) {
        fetch('https://open.er-api.com/v6/latest/USD')
          .then(res => res.json())
          .then(openData => {
            if (openData.rates && openData.rates.TRY) {
              const usd = openData.rates.TRY;
              const eur = openData.rates.EUR ? openData.rates.TRY / openData.rates.EUR : usd * 1.08;
              const gbp = openData.rates.GBP ? openData.rates.TRY / openData.rates.GBP : usd * 1.28;
              setRates({
                usd: parseFloat(usd.toFixed(2)),
                eur: parseFloat(eur.toFixed(2)),
                gbp: parseFloat(gbp.toFixed(2)),
                isLive: true
              });
            }
          })
          .catch(err => console.error('Döviz kurları yükleme hatası:', err));
      }
    }, 500);
  }, [token]);

  useEffect(() => {
    fetchProfileData();
    fetchCurrencyRates();
  }, [fetchProfileData, fetchCurrencyRates]);

  // ── Kaydet ────────────────────────────────────────────────────────────────
  const saveData = useCallback(async (fd: FinancialData, exp: MonthlyExpenses) => {
    if (!token) return;
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ financialData: fd, expenses: exp })
      });
      if (!res.ok) throw new Error('Veriler kaydedilemedi.');
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  }, [token]);

  const handleSave = async () => {
    setIsSaving(true); setErrorMsg('');
    await saveData(financialData, expenses);
    setImportSuccess(true);
    setTimeout(() => setImportSuccess(false), 2000);
    setIsSaving(false);
  };

  const handleResetSystem = async () => {
    if (!confirm("Tüm finansal verilerinizi, borçlarınızı, alacaklarınızı ve harcama geçmişinizi sıfırlamak istediğinize emin misiniz? Bu işlem geri alınamaz!")) return;
    if (!confirm("SON UYARI: Tüm veriler kalıcı olarak silinecektir. Devam etmek istiyor musunuz?")) return;

    if (!token) return;
    try {
      const res = await fetch('/api/profile/reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Sistem başarıyla sıfırlandı.");
        setExpenses({ essentials: 0, financial: 0, discretionary: 0, subscriptions: 0, installments: 0 });
        setFinancialData({
          monthlyIncome: 0,
          rent: 0,
          totalDebt: 0,
          interestRate: 0,
          minimumPaymentIsBankasi: 0,
          minimumPaymentEnpara: 0,
          debtsList: []
        });
        fetchProfileData();
      } else {
        const data = await res.json();
        alert(data.error || "Sıfırlama işlemi başarısız oldu.");
      }
    } catch (err) {
      console.error(err);
      alert("Sıfırlama sırasında bağlantı hatası oluştu.");
    }
  };


  const handleDraftAction = (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      setRejectedDraftIds(prev => [...prev, id]);
    }
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const handleFinalizeDrafts = async () => {
    if (!token) return;
    try {
      const remainingIds = drafts.map(d => d.id);
      const res = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ approvedIds: remainingIds, rejectedIds: rejectedDraftIds })
      });
      if (res.ok) {
        setDrafts([]);
        setRejectedDraftIds([]);
        setImportSuccess(true);
        fetchProfileData();
        setTimeout(() => setImportSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Borç İşlemleri ────────────────────────────────────────────────────────
  const updateDebtList = async (list: Debt[]) => {
    const totals = calculateDebtTotals(list);
    const newFd: FinancialData = { 
      ...financialData, 
      totalDebt: totals.totalDebt, 
      minimumPaymentIsBankasi: totals.minimumPaymentIsBankasi, 
      minimumPaymentEnpara: totals.minimumPaymentEnpara, 
      debtsList: list 
    };
    setFinancialData(newFd);
    await saveData(newFd, expenses);
  };

  const handleMakePayment = () => {
    if (!selectedDebt || !paymentAmount) return;
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) return;

    let deductAmount = amount;
    const debtCurrency = selectedDebt.currency || 'TRY';

    // Kullanıcı TL ile ödedi ama borç yabancı para birimindeyse → kura göre çevir
    if (paymentCurrency === 'TRY' && debtCurrency !== 'TRY' && rates) {
      const key = debtCurrency.toLowerCase() as 'usd' | 'eur' | 'gbp';
      const rate = rates[key] || 1;
      deductAmount = amount / rate; // TL ödemeyi orijinal para birimine çevir
    }

    const list = applyPaymentToDebt(financialData.debtsList || [], selectedDebt.id, deductAmount);
    updateDebtList(list);
    setPaymentModalOpen(false);
    setSelectedDebt(null);
    setPaymentAmount('');
    setPaymentCurrency('TRY');
  };

  // Para birimi sembolü yardımcısı
  const currencySymbol = (currency?: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default:    return '₺';
    }
  };

  const handleDeleteDebt = (id: string) => {
    const debt = (financialData.debtsList || []).find(d => d.id === id);
    const label = debt?.type === 'receivable' ? 'alacağı' : 'borcu';
    if (!confirm(`Bu ${label} silmek istediğinize emin misiniz?`)) return;
    updateDebtList((financialData.debtsList || []).filter(d => d.id !== id));
  };

  const handleAddDebt = (type: 'debt' | 'receivable') => {
    const name = addName.trim();
    const balance = parseFloat(addBalance) || 0;
    if (!name || balance <= 0) {
      setErrorMsg(`Lütfen geçerli bir ${type === 'receivable' ? 'alacak adı' : 'borç adı'} ve tutar girin.`);
      return;
    }

    const debt: Debt = { 
      id: 'd-' + Date.now(), 
      name, 
      balance, 
      apr: 0, 
      minimumPayment: type === 'debt' ? balance : 0, 
      currency: addCurrency || 'TRY',
      type,
      isPredictedOnly: type === 'receivable' ? addIsPredictedOnly : false
    };

    updateDebtList([...(financialData.debtsList || []), debt]);
    
    // Reset states
    setAddName('');
    setAddBalance('');
    setAddCurrency('TRY');
    setAddDueDateOption('this_month');
    setAddIsPredictedOnly(false);
    setAddDueDate('');
    setActiveAddForm(null);
    setErrorMsg('');
  };

  // ── Hesaplamalar (Kural Tabanlı Finansal Motor) ───────────────────────────
  const convertToTry = useCallback((amount: number, currency?: string) => {
    if (!currency || currency === 'TRY' || !rates) return amount;
    const key = currency.toLowerCase() as 'usd' | 'eur' | 'gbp';
    const rate = rates[key] || 1;
    return amount * rate;
  }, [rates]);

  const convertedDebts = useMemo(() => {
    const list = financialData.debtsList || [];
    return list
      .filter(d => d.type !== 'receivable' && !d.archived)
      .map(d => ({
        ...d,
        balance: convertToTry(d.balance, d.currency),
        minimumPayment: convertToTry(d.minimumPayment, d.currency),
      }));
  }, [financialData.debtsList, convertToTry]);

  const convertedReceivables = useMemo(() => {
    const list = financialData.debtsList || [];
    return list
      .filter(d => d.type === 'receivable')
      .map(d => ({
        ...d,
        balance: convertToTry(d.balance, d.currency),
      }));
  }, [financialData.debtsList, convertToTry]);

  const totalReceivables = useMemo(() => {
    return convertedReceivables.reduce((sum, item) => sum + item.balance, 0);
  }, [convertedReceivables]);

  const totalCertainReceivables = useMemo(() => {
    return convertedReceivables
      .filter(r => !r.isPredictedOnly)
      .reduce((sum, item) => sum + item.balance, 0);
  }, [convertedReceivables]);

  const totalDebtsTry = useMemo(() => {
    return convertedDebts.reduce((sum, item) => sum + item.balance, 0);
  }, [convertedDebts]);

  const debts = financialData.debtsList || [];

  const cashFlow = useMemo(() =>
    analyzeCashFlow(financialData.monthlyIncome + (financialData.rentIncome || 0), financialData.rent, expenses, convertedDebts),
    [financialData.monthlyIncome, financialData.rent, financialData.rentIncome, expenses, convertedDebts]
  );

  const alerts = useMemo(() => generateAlerts(cashFlow, convertedDebts), [cashFlow, convertedDebts]);

  // Aylık karta yüklenen harcamalar (Rolling Debt):
  // Toplam gider - kira = kartla ödenen zaruri giderler (nakit harcamalar dışında)
  const monthlyCardSpend = useMemo(() => {
    const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
    return Math.max(0, totalExpenses); // Kira nakit ödeniyor; kalan giderler karta yükleniyor
  }, [expenses]);

  const avalanchePlan = useMemo(() =>
    convertedDebts.length > 0 ? simulatePayoff(convertedDebts, cashFlow.availableForExtraPayment, 'avalanche', 360, monthlyCardSpend) : null,
    [convertedDebts, cashFlow.availableForExtraPayment, monthlyCardSpend]
  );

  const snowballPlan = useMemo(() =>
    convertedDebts.length > 0 ? simulatePayoff(convertedDebts, cashFlow.availableForExtraPayment, 'snowball', 360, monthlyCardSpend) : null,
    [convertedDebts, cashFlow.availableForExtraPayment, monthlyCardSpend]
  );

  const activePlan = activeStrategy === 'avalanche' ? avalanchePlan : snowballPlan;
  const savingsFromAvalanche = avalanchePlan && snowballPlan
    ? Math.max(0, snowballPlan.totalInterestPaid - avalanchePlan.totalInterestPaid)
    : 0;

  // Grafik verileri
  const expenseChartData = Object.entries(expenses).map(([k, v]) => ({
    name: EXPENSE_LABELS[k], value: v, color: EXPENSE_COLORS[k]
  }));

  const debtChartData = activePlan?.schedule
    .filter((_, i) => i % Math.max(1, Math.floor((activePlan.schedule.length) / 12)) === 0)
    .slice(0, 24)
    .map(r => ({ ay: `Ay ${r.month}`, Borç: r.totalRemaining, Ödeme: r.totalPayment })) || [];

  const statusColors = statusColor(cashFlow.cashFlowStatus);

  // ── PDF Yükleme ───────────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');

    if (file.name.endsWith('.pdf')) {
      if (!token) return;
      setIsUploading(true);
      const formData = new FormData();
      formData.append('statement', file);
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ekstre yüklenemedi.');

        if (data.parsedData) {
          const pd = data.parsedData;
          if (pd.expenses) setExpenses(prev => ({ ...prev, ...pd.expenses }));

          if (pd.financialData) {
            const bankName = pd.financialData.minimumPaymentIsBankasi > 0 ? 'isbank' : 'enpara';
            const cardName = bankName === 'isbank' ? 'İş Bankası Kredi Kartı' : 'Enpara Kredi Kartı';
            const newDebtItem: Debt = {
              id: 'card_' + Date.now(),
              name: cardName,
              balance: pd.financialData.totalDebt || 0,
              apr: (pd.financialData.interestRate || 4.25) * 12,
              minimumPayment: pd.financialData.minimumPaymentIsBankasi || pd.financialData.minimumPaymentEnpara || 0,
              bankName,
            };
            // Use a snapshot of current debtsList to avoid stale closure
            setFinancialData(prevFd => {
              const currentList = prevFd.debtsList || [];
              // Find the ACTIVE (non-archived) record for this card
              const activeExistIdx = currentList.findIndex(d => d.name === cardName && !d.archived);
              const updated = activeExistIdx !== -1
                ? currentList.map((d, i) => i === activeExistIdx ? {
                    ...d,
                    balance: newDebtItem.balance,
                    apr: newDebtItem.apr,
                    minimumPayment: newDebtItem.minimumPayment,
                    statementDate: new Date().toISOString()
                  } : d)
                : [...currentList, newDebtItem];
              const totals = calculateDebtTotals(updated);
              const newFd = {
                ...prevFd,
                totalDebt: totals.totalDebt,
                minimumPaymentIsBankasi: totals.minimumPaymentIsBankasi,
                minimumPaymentEnpara: totals.minimumPaymentEnpara,
                debtsList: updated
              };
              // Save to server in background (fire and forget after state update)
              saveData(newFd, expenses);
              return newFd;
            });
          }
          setImportSuccess(true);
          setTimeout(() => setImportSuccess(false), 3000);
        } else {
          // Reload drafts so they appear in Veri Girişi tab immediately
          fetchProfileData();
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Text/JSON dosyaları
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') return;
      try {
        let updatedFd = { ...financialData };
        let updatedExp = { ...expenses };
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (parsed.financialData || parsed.expenses) {
            updatedFd = { ...updatedFd, ...(parsed.financialData || {}) };
            updatedExp = { ...updatedExp, ...(parsed.expenses || {}) };
          }
        } else {
          const parsed = parseFinancialText(content);
          if (parsed.financialData) Object.assign(updatedFd, parsed.financialData);
          if (parsed.expenses)      Object.assign(updatedExp, parsed.expenses);
        }
        setFinancialData(updatedFd);
        setExpenses(updatedExp);
        await saveData(updatedFd, updatedExp);
        setImportSuccess(true);
        setTimeout(() => setImportSuccess(false), 3000);
      } catch { setErrorMsg('Dosya çözümlenirken hata oluştu.'); }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const state: AppState = { financialData, expenses };
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `finans_raporu_${dateStr}`;
    switch (exportFormat) {
      case 'json': downloadBlob(generateJSONExport(state),  `${filename}.json`, 'application/json'); break;
      case 'txt':  downloadBlob(generateTXTExport(state),   `${filename}.txt`,  'text/plain;charset=utf-8'); break;
      case 'md':   downloadBlob(generateMDExport(state),    `${filename}.md`,   'text/markdown;charset=utf-8'); break;
      default:     downloadBlob(generateHTMLExport(state, 'Finans Raporu'), `${filename}.html`, 'text/html;charset=utf-8');
    }
  };

  // ── JSX ───────────────────────────────────────────────────────────────────

  const renderDebtsTable = (items: Debt[]) => {
  const activeItems = items.filter(i => !i.archived);
  return (
    <>
      {activeItems.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <CreditCard className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Henüz borç veya alacak eklenmemiş.</p>
                  <p className="text-slate-500 text-xs mt-1">Aşağıdan manuel ekleyebilirsiniz.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {['Tür / Ad', 'Bakiye', 'Yıllık Faiz', 'Asgari Ödeme', 'Tahmini Kapanış', ''].map((h, i) => (
                          <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...activeItems]
                        .sort((a, b) => {
                          const aRec = a.type === 'receivable';
                          const bRec = b.type === 'receivable';
                          if (aRec !== bRec) return aRec ? 1 : -1;
                          return b.apr - a.apr;
                        })
                        .map((debt, idx) => {
                          const isReceivable = debt.type === 'receivable';
                          const convertedDebt = isReceivable 
                            ? convertedReceivables.find(cd => cd.id === debt.id) || debt
                            : convertedDebts.find(cd => cd.id === debt.id) || debt;
                          const payoffMonths = isReceivable ? 0 : estimatePayoffMonths(convertedDebt.balance, convertedDebt.apr, convertedDebt.minimumPayment + cashFlow.availableForExtraPayment / Math.max(1, debts.filter(d => d.type !== 'receivable').length));
                          const payoffText = payoffMonths >= 360 ? '30+ yıl' : payoffMonths > 0 ? `${payoffMonths} ay` : '—';
                          const isExpanded = expandedDebtId === debt.id;
                          const isCard = debt.id.startsWith('card_');
                          return (
                            <Fragment key={debt.id}>
                              <tr 
                                onClick={() => isCard && toggleExpandDebt(debt.id)}
                                className={`border-b border-white/5 hover:bg-white/5 transition-colors ${isCard ? 'cursor-pointer' : ''}`}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {isCard && (
                                      <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    )}
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                      style={{ background: isReceivable ? 'rgba(16,185,129,0.2)' : debt.bankName === 'isbank' ? 'rgba(59,130,246,0.2)' : 'rgba(168,85,247,0.2)' }}>
                                      {isReceivable ? '🤝' : debt.bankName === 'isbank' ? '🏦' : '💳'}
                                    </div>
                                    <div>
                                      <p className="font-medium text-white text-xs flex items-center gap-1.5">
                                        {debt.name}
                                        {isReceivable ? (
                                          <>
                                            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">ALACAK</span>
                                            {debt.isPredictedOnly && (
                                              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">TAHMİNİ</span>
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-semibold">BORÇ</span>
                                        )}
                                      </p>
                                      {debt.bankName && <p className="text-slate-500 text-xs">{debt.bankName.toUpperCase()}</p>}
                                      {debt.carriedOverAmount ? (
                                        <div className="text-[10px] text-purple-400 mt-0.5">
                                          Önceki Ekstreden Kalan: {formatCurrency(debt.carriedOverAmount)}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {(() => {
                                    const tryVal = convertedDebt.balance;
                                    const isForex = debt.currency && debt.currency !== 'TRY';
                                    return (
                                      <div>
                                        <span className={`font-bold text-sm ${isReceivable ? 'text-emerald-300' : 'text-orange-300'}`}>
                                          {formatCurrency(debt.balance, debt.currency)}
                                        </span>
                                        {isForex && (
                                          <p className="text-slate-500 text-xs mt-0.5">≈ {formatCurrency(tryVal)}</p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="px-4 py-3">
                                  {isReceivable ? (
                                    <span className="text-slate-500 text-xs">—</span>
                                  ) : (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${debt.apr > 40 ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                      %{debt.apr}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-300 text-xs">
                                  {isReceivable || !isCard ? (
                                    <span className="text-slate-500 text-xs">—</span>
                                  ) : (
                                    (() => {
                                      const tryMin = convertedDebt.minimumPayment;
                                      const isForex = debt.currency && debt.currency !== 'TRY';
                                      return (
                                        <div>
                                          <span>{formatCurrency(debt.minimumPayment, debt.currency)}</span>
                                          {isForex && <p className="text-slate-600 text-xs">≈ {formatCurrency(tryMin)}</p>}
                                        </div>
                                      );
                                    })()
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-300 text-xs">{isReceivable ? '—' : payoffText}</td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" onClick={() => {
                                      setSelectedDebt(debt);
                                      setPaymentAmount('');
                                      setPaymentCurrency('TRY');
                                      setPaymentModalOpen(true);
                                    }}
                                      className={`h-7 text-xs border-0 ${
                                        isReceivable
                                          ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                          : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                                      }`}>
                                      {isReceivable ? 'Tahsil Et' : 'Ödeme Yap'}
                                    </Button>
                                    {debt.id.startsWith('card_') && (
                                      <>
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs border-0 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 ml-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditFormData({
                                              name: debt.name,
                                              balance: debt.balance.toString(),
                                              apr: debt.apr.toString(),
                                              minimumPayment: debt.minimumPayment.toString()
                                            });
                                            setEditingDebt(debt);
                                          }}
                                        >
                                          Düzenle
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs border-0 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 ml-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRolloverDebt(debt);
                                          }}
                                        >
                                          Yeni Dönem
                                        </Button>
                                      </>
                                    )}
                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteDebt(debt.id)}
                                      className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/20">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && debt.id.startsWith('card_') && (
                                <tr className="bg-slate-950/40">
                                  <td colSpan={6} className="px-6 py-4 border-b border-white/5">
                                    <div className="flex flex-col space-y-4">
                                      {/* Faiz ve Maliyet Özeti */}
                                      {!isLoadingTransactions && expandedTransactions.length > 0 && (() => {
                                        const interestKeywords = ['faiz', 'kkdf', 'bsmv', 'gecikme', 'komisyon', 'masraf', 'kart ucreti', 'yillik ucret'];
                                        const interestTx = expandedTransactions.filter(tx => {
                                          const desc = (tx.description || '').toLowerCase();
                                          return interestKeywords.some(kw => desc.includes(kw));
                                        });
                                        const totalInterestValue = interestTx.reduce((s, tx) => s + tx.amount, 0);

                                        return (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Ekstre Faizi & Finansman Maliyetleri</p>
                                              <p className="text-lg font-bold text-orange-300 mt-1">{formatCurrency(totalInterestValue)}</p>
                                              <p className="text-[10px] text-slate-500 mt-1">Ekstrede yer alan faiz, gecikme faizi, KKDF, BSMV ve masraflar toplamı.</p>
                                            </div>
                                            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Maliyet Detayları ({interestTx.length})</p>
                                              {interestTx.length > 0 ? (
                                                <div className="mt-2 space-y-1.5 max-h-[70px] overflow-y-auto pr-1">
                                                  {interestTx.map((tx, txIdx) => (
                                                    <div key={txIdx} className="flex justify-between text-[11px] border-b border-white/5 pb-1 last:border-0 last:pb-0">
                                                      <span className="text-slate-400 truncate max-w-[180px]">{tx.description}</span>
                                                      <span className="text-slate-300 font-medium">{formatCurrency(tx.amount)}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                <p className="text-[11px] text-slate-500 mt-2">Bu ekstrede faiz veya finansman maliyeti tespit edilmedi.</p>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      <div>
                                        <div className="text-xs text-slate-400 font-semibold mb-2">Kredi Kartı Ekstresi Harcamaları:</div>
                                        {isLoadingTransactions ? (
                                          <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Yükleniyor...
                                          </div>
                                        ) : expandedTransactions.length === 0 ? (
                                          <div className="text-slate-500 text-xs py-2">Harcama bulunamadı.</div>
                                        ) : (
                                          <div className="max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-slate-900/50">
                                            <table className="w-full text-xs text-left">
                                              <thead>
                                                <tr className="border-b border-white/10 text-slate-400 bg-white/5">
                                                  <th className="px-3 py-2">Tarih</th>
                                                  <th className="px-3 py-2">Açıklama</th>
                                                  <th className="px-3 py-2">Kategori</th>
                                                  <th className="px-3 py-2 text-right">Tutar</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {expandedTransactions.map((tx) => (
                                                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 text-slate-300">
                                                    <td className="px-3 py-2 whitespace-nowrap">{tx.transaction_date}</td>
                                                    <td className="px-3 py-2">{tx.description}</td>
                                                    <td className="px-3 py-2">
                                                      <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-slate-400">
                                                        {tx.category === 'essentials' ? 'Temel' 
                                                         : tx.category === 'financial' ? 'Finansal' 
                                                         : tx.category === 'discretionary' ? 'Keyfi' 
                                                         : tx.category === 'subscriptions' ? 'Abonelik' 
                                                         : tx.category === 'installments' ? 'Taksit' 
                                                         : tx.category}
                                                      </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-white">
                                                      {formatCurrency(tx.amount)}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
    </>
  );
}

  return (

    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/10" style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/CfOS-logo.png" alt="CfOS Logo" className="h-9 w-auto object-contain rounded-xl" />
            <div>
              <h1 className="text-lg font-bold text-white leading-none">Finans Kontrol</h1>
            </div>
            {rates && (
              <div className="flex flex-wrap items-center gap-3 ml-2 sm:ml-6 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-xs text-slate-300">
                <span className="flex items-center gap-1.5 font-medium">
                  💵 USD: <strong className="text-emerald-400">{rates.usd.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</strong>
                </span>
                <span className="w-px h-3 bg-white/20 hidden sm:inline" />
                <span className="flex items-center gap-1.5 font-medium">
                  💶 EUR: <strong className="text-blue-400">{rates.eur.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</strong>
                </span>
                <span className="w-px h-3 bg-white/20 hidden sm:inline" />
                <span className="flex items-center gap-1.5 font-medium">
                  💷 GBP: <strong className="text-purple-400">{rates.gbp.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</strong>
                </span>
                <span className="w-px h-3 bg-white/20" />
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${rates.isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {rates.isLive ? 'Canlı Kur' : 'Güncel'}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-xs text-slate-300">
              <UserIcon className="w-3 h-3" /> {loggedInUser}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('username'); setLocation('/auth'); }}
              className="text-xs text-slate-400 hover:text-white hover:bg-white/10 flex items-center gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> Çıkış
            </Button>
          </div>
        </div>
      </header>

      {/* ── SEKMELER ──────────────────────────────────────────────────────────── */}
      <main className="container mx-auto px-4 pt-6 pb-20">
        {/* Canlı Döviz Kurları Kartı */}
        {rates && (
          <div className="mb-6 p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-base">
                💱
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Anlık Canlı Döviz Kurları</h3>
                <p className="text-[11px] text-slate-400">Dolar, Euro ve Sterlin Otomatik Canlı Hesaplanır</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2 rounded-xl flex items-center gap-2">
                <span className="text-slate-400">💵 1 USD:</span>
                <strong className="text-emerald-300 font-bold text-sm">{rates.usd.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</strong>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 px-3.5 py-2 rounded-xl flex items-center gap-2">
                <span className="text-slate-400">💶 1 EUR:</span>
                <strong className="text-blue-300 font-bold text-sm">{rates.eur.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</strong>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/30 px-3.5 py-2 rounded-xl flex items-center gap-2">
                <span className="text-slate-400">💷 1 GBP:</span>
                <strong className="text-purple-300 font-bold text-sm">{rates.gbp.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</strong>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {rates.isLive ? 'Canlı Kur Aktif' : 'Güncel Kur'}
              </div>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-white/10 rounded-xl p-1 border border-white/10">
            <TabsTrigger value="dashboard" className="rounded-lg text-slate-300 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-xs font-semibold">📊 Dashboard</TabsTrigger>
            <TabsTrigger value="debts"     className="rounded-lg text-slate-300 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-xs font-semibold">💳 Borçlar</TabsTrigger>
            <TabsTrigger value="input"     className="rounded-lg text-slate-300 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-xs font-semibold">⚙️ Veri Girişi</TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════════
              DASHBOARD SEKMESİ
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="rounded-2xl p-0 border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/20 text-slate-400">
                      <th className="py-4 px-6 font-semibold text-sm uppercase tracking-wider">Gösterge</th>
                      <th className="py-4 px-6 font-semibold text-sm uppercase tracking-wider text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="text-white text-lg">
                    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-5 px-6 flex items-center gap-3 cursor-pointer hover:bg-white/5" onClick={() => setActiveTab('ekstreler')}>
                        <CreditCard className="w-6 h-6 text-blue-400" /> 
                        <span className="font-medium text-blue-400 underline decoration-blue-400/30 underline-offset-4">Ekstreler</span>
                      </td>
                      <td className="py-5 px-6 text-right font-bold text-blue-300">
                        {formatCurrency(convertedDebts.filter(d => d.id.startsWith('card_') || d.bankName).reduce((a, b) => a + b.balance, 0))}
                      </td>
                    </tr>
                    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-5 px-6 flex items-center gap-3">
                        <TrendingUp className="w-6 h-6 text-emerald-400" /> 
                        <span className="font-medium">Alacaklar</span>
                      </td>
                      <td className="py-5 px-6 text-right font-bold text-emerald-300">
                        {formatCurrency(totalReceivables)}
                      </td>
                    </tr>
                    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-5 px-6 flex items-center gap-3">
                        <AlertTriangle className="w-6 h-6 text-rose-400" /> 
                        <span className="font-medium">Borçlar</span>
                      </td>
                      <td className="py-5 px-6 text-right font-bold text-rose-300">
                        {formatCurrency(convertedDebts.filter(d => !d.id.startsWith('card_') && !d.bankName).reduce((a, b) => a + b.balance, 0))}
                      </td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="py-5 px-6 flex items-center gap-3">
                        <DollarSign className="w-6 h-6 text-amber-400" /> 
                        <span className="font-medium">Kasa <span className="text-sm text-slate-400 font-normal ml-2">(Toplam Elde Olan Nakit)</span></span>
                      </td>
                      <td className="py-5 px-6 text-right font-bold text-amber-300">
                        {formatCurrency(financialData.readyCash || 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ekstreler" className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Button variant="ghost" size="sm" onClick={() => setActiveTab('dashboard')} className="text-slate-400 hover:text-white px-2">
                ← Geri
              </Button>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-blue-400" /> Ekstreler Detayı
              </h2>
            </div>
            <div className="rounded-2xl border border-white/10 p-0 overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {renderDebtsTable(debts.filter(d => d.id.startsWith('card_') || d.bankName))}
            </div>
          </TabsContent>


          {/* ════════════════════════════════════════════════════════════════
              BORÇLAR SEKMESİ
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="debts" className="space-y-4">
            <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-400" /> Borç & Alacak Listesi
                  <span className="bg-white/10 text-slate-300 text-xs px-2 py-0.5 rounded-full">
                    {debts.filter(d => d.type !== 'receivable').length} borç, {debts.filter(d => d.type === 'receivable').length} alacak
                  </span>
                </h2>
                <div className="text-xs sm:text-sm text-slate-400 flex gap-3">
                  <span>Borç: <strong className="text-orange-300">{formatCurrency(calculateDebtTotals(debts).totalDebt)}</strong></span>
                  <span className="text-white/20">|</span>
                  <span>Alacak: <strong className="text-emerald-300">{formatCurrency(totalReceivables)}</strong></span>
                </div>
              </div>

              {renderDebtsTable(debts)}
            </div>

            {/* Butonlar: Bana Para Gelecek / Para Ödeyeceğim */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              <Button 
                onClick={() => {
                  setActiveAddForm(activeAddForm === 'receivable' ? null : 'receivable');
                  setAddName('');
                  setAddBalance('');
                  setAddIsPredictedOnly(false);
                  setErrorMsg('');
                }}
                className={`h-12 text-sm font-bold flex items-center justify-center gap-2 rounded-xl transition-all border ${
                  activeAddForm === 'receivable'
                    ? 'bg-emerald-500/30 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/10'
                    : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20'
                }`}
              >
                <TrendingUp className="w-4 h-4" /> [+] Bana Para Gelecek (Alacak Ekle)
              </Button>

              <Button 
                onClick={() => {
                  setActiveAddForm(activeAddForm === 'debt' ? null : 'debt');
                  setAddName('');
                  setAddBalance('');
                  setErrorMsg('');
                }}
                className={`h-12 text-sm font-bold flex items-center justify-center gap-2 rounded-xl transition-all border ${
                  activeAddForm === 'debt'
                    ? 'bg-rose-500/30 border-rose-500 text-rose-200 shadow-lg shadow-rose-500/10'
                    : 'bg-rose-600/10 border-rose-500/30 text-rose-400 hover:bg-rose-600/20'
                }`}
              >
                <AlertTriangle className="w-4 h-4" /> [-] Para Ödeyeceğim (Borç Ekle)
              </Button>
            </div>

            {/* Bana Para Gelecek Formu */}
            {activeAddForm === 'receivable' && (
              <div className="mt-4 p-5 rounded-2xl border border-emerald-500/20 bg-[#1e293b]/80 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Yeni Alacak Ekle</h4>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-white" onClick={() => setActiveAddForm(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">Kimden para alacaksın?</Label>
                    <Input value={addName} onChange={e => setAddName(e.target.value)}
                      placeholder="Örn: Ahmet" className="bg-white/5 border-white/10 text-white h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">Para Birimi</Label>
                    <select value={addCurrency} onChange={e => setAddCurrency(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#0f172a] text-white text-sm px-3 h-9">
                      <option value="TRY">TRY (₺)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">Ne kadar alacaksın?</Label>
                    <Input type="number" value={addBalance} onChange={e => setAddBalance(e.target.value)}
                      placeholder="0.00" className="bg-white/5 border-white/10 text-white h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">Ne zaman gelecek?</Label>
                    <select value={addDueDateOption} onChange={e => setAddDueDateOption(e.target.value as any)}
                      className="w-full rounded-lg border border-white/10 bg-[#0f172a] text-white text-sm px-3 h-9">
                      <option value="this_month">Bu ay</option>
                      <option value="next_month">Gelecek ay</option>
                      <option value="uncertain">Tarih belirsiz</option>
                    </select>
                  </div>
                </div>

                {/* Aşırı Güven Filtresi */}
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <p className="text-xs font-semibold text-slate-300">🧠 Aşırı Güven Filtresi (Overconfidence Filter)</p>
                  <p className="text-[11px] text-slate-400">
                    {addName.trim() ? addName.trim() : 'Ahmet'}'ten beklediğiniz bu paranın geleceği tarih kesin mi, yoksa tahmin mi?
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setAddIsPredictedOnly(false)}
                      className={`flex-1 text-xs py-1.5 rounded-lg font-bold transition-all border ${
                        !addIsPredictedOnly
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      Kesin (Net Duruma yansır)
                    </button>
                    <button 
                      onClick={() => setAddIsPredictedOnly(true)}
                      className={`flex-1 text-xs py-1.5 rounded-lg font-bold transition-all border ${
                        addIsPredictedOnly
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      Tahmin (Bilanço riskine karşı Net Durumdan hariç tutulur)
                    </button>
                  </div>
                </div>

                {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
                
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={() => setActiveAddForm(null)}>İptal</Button>
                  <Button onClick={() => handleAddDebt('receivable')} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
                    Listeme Güvenle Ekle
                  </Button>
                </div>
              </div>
            )}

            {/* Para Ödeyeceğim Formu */}
            {activeAddForm === 'debt' && (
              <div className="mt-4 p-5 rounded-2xl border border-rose-500/20 bg-[#1e293b]/80 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400">Yeni Borç Ekle</h4>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-white" onClick={() => setActiveAddForm(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">Kime ödeme yapacaksın?</Label>
                    <Input value={addName} onChange={e => setAddName(e.target.value)}
                      placeholder="Örn: Ev Sahibi" className="bg-white/5 border-white/10 text-white h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">Para Birimi</Label>
                    <select value={addCurrency} onChange={e => setAddCurrency(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#0f172a] text-white text-sm px-3 h-9">
                      <option value="TRY">TRY (₺)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">Ne kadar ödeyeceksin?</Label>
                    <Input type="number" value={addBalance} onChange={e => setAddBalance(e.target.value)}
                      placeholder="0.00" className="bg-white/5 border-white/10 text-white h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">Son ödeme günü ne zaman?</Label>
                    <Input type="date" value={addDueDate} onChange={e => setAddDueDate(e.target.value)}
                      className="bg-white/5 border-white/10 text-white h-9 text-slate-300" />
                  </div>
                </div>

                {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
                
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={() => setActiveAddForm(null)}>İptal</Button>
                  <Button onClick={() => handleAddDebt('debt')} className="bg-rose-600 hover:bg-rose-500 text-white font-bold">
                    Listeme Ekle
                  </Button>
                </div>
              </div>
            )}

          </TabsContent>




          {/* ════════════════════════════════════════════════════════════════
              VERİ GİRİŞİ SEKMESİ
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="input" className="space-y-6">
            {/* Gelir & Kira */}
            <div className="rounded-2xl p-6 border border-white/10" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Gelir & Sabit Giderler</h3>
                {gigTrackIncome > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFinancialData(prev => ({ ...prev, monthlyIncome: gigTrackIncome }));
                    }}
                    className="h-8 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40"
                  >
                    <Zap className="w-3.5 h-3.5 mr-1" />
                    GigTrack Gelirini Aktar ({gigTrackIncome.toLocaleString('tr-TR')} ₺)
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'Aylık Gelir (₺)', field: 'monthlyIncome' as keyof FinancialData },
                  { label: 'Aylık Kira Gideri (₺) (Ödediğiniz)', field: 'rent' as keyof FinancialData },
                  { label: 'Aylık Kira Geliri (₺) (Aldığınız)', field: 'rentIncome' as keyof FinancialData },
                  { label: 'Elimdeki Hazır Nakit (₺)', field: 'readyCash' as keyof FinancialData },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <Label className="text-xs text-slate-400 mb-1.5 block">{label}</Label>
                    <Input type="number" placeholder="0" value={(financialData[field] as number) === 0 ? '' : (financialData[field] as number)}
                      onChange={e => setFinancialData(p => ({ ...p, [field]: parseFloat(e.target.value) || 0 }))}
                      className="bg-white/5 border-white/10 text-white h-9 text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* Harcama Kategorileri */}
            <div className="rounded-2xl p-6 border border-white/10" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <h3 className="text-sm font-bold text-white mb-4">Aylık Harcama Kategorileri</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(expenses).map(([key, value]) => (
                  <div key={key}>
                    <Label className="text-xs text-slate-400 mb-1.5 block flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EXPENSE_COLORS[key] }} />
                      {EXPENSE_LABELS[key]}
                    </Label>
                    <Input type="number" placeholder="0" value={value === 0 ? '' : value}
                      onChange={e => setExpenses(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                      className="bg-white/5 border-white/10 text-white h-9 text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* Kaydet */}
            <div className="flex justify-end gap-3">
              {importSuccess && <span className="text-emerald-400 text-sm flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Kaydedildi!</span>}
              <Button onClick={handleSave} disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm h-9 flex items-center gap-2">
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Kaydet
              </Button>
            </div>


            {/* PDF / Dosya Yükleme */}
            <div className="rounded-2xl p-6 border border-white/10" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" /> Banka Ekstresi Yükle
              </h3>
              <p className="text-xs text-slate-400 mb-4">PDF ekstresi yükleyin — İş Bankası ve Enpara otomatik olarak algılanır, tüm işlemler kategorilere ayrılır. Yapay zeka gerekmez.</p>
              <div className="relative border-2 border-dashed border-white/20 rounded-xl p-8 flex flex-col items-center hover:border-blue-400/50 transition-colors cursor-pointer">
                <input type="file" accept=".json,.txt,.md,.pdf" onChange={handleImport} disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                {isUploading ? (
                  <>
                    <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-3" />
                    <p className="text-sm text-white font-medium">Ekstre çözümleniyor...</p>
                    <p className="text-xs text-slate-400 mt-1">Kural tabanlı motor çalışıyor (API gerekmez)</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-slate-500 mb-3" />
                    <p className="text-sm text-white font-medium">PDF, JSON veya TXT yükleyin</p>
                    <p className="text-xs text-slate-400 mt-1">Tıklayın veya dosyayı sürükleyin</p>
                  </>
                )}
              </div>
              {importSuccess && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-emerald-300 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Ekstre başarıyla yüklendi ve işlendi!
                </div>
              )}
              {errorMsg && (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {errorMsg}
                </div>
              )}
            </div>

            {/* Dışa Aktar */}
            <div className="rounded-2xl p-6 border border-white/10" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Download className="w-4 h-4 text-green-400" /> Rapor İndir
              </h3>
              <div className="flex gap-3">
                <select value={exportFormat} onChange={e => setExportFormat(e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 text-white text-sm px-3 py-2">
                  <option value="json">JSON (.json)</option>
                  <option value="txt">Metin (.txt)</option>
                  <option value="md">Markdown (.md)</option>
                  <option value="pdf">HTML/PDF</option>
                </select>
                <Button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm h-9 flex items-center gap-2">
                  <Download className="w-3.5 h-3.5" /> İndir
                </Button>
              </div>
            </div>

            {/* Tehlikeli Bölge / Sıfırlama */}
            <div className="rounded-2xl p-6 border border-red-500/20 bg-red-500/5">
              <h3 className="text-sm font-bold text-red-400 mb-2 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Tehlikeli Bölge
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Sistemdeki tüm borçları, alacakları, kredi kartı harcamalarını, harcama kategorilerini ve hesap hareketlerini tamamen siler. Bu işlem geri alınamaz.
              </p>
              <div className="flex justify-start">
                <Button onClick={handleResetSystem} className="bg-red-600 hover:bg-red-500 text-white text-xs h-9">
                  Sistemi Komple Sıfırla
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>



      {/* ── ÖDEME VE TAHSİLAT MODALI ────────────────────────────────────────── */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-md" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }}>
          <DialogHeader>
            <DialogTitle className="text-white font-semibold">
              {selectedDebt?.type === 'receivable' ? 'Tahsilat Yap' : 'Ödeme Yap'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedDebt && (() => {
              const isReceivable = selectedDebt.type === 'receivable';
              const debtCurrency = selectedDebt.currency || 'TRY';
              const isForex = debtCurrency !== 'TRY';
              const key = debtCurrency.toLowerCase() as 'usd' | 'eur' | 'gbp';
              const rate = (isForex && rates) ? (rates[key] || 1) : 1;
              const balanceTRY = selectedDebt.balance * rate;
              const minPayTRY = selectedDebt.minimumPayment * rate;
              const quickMin = paymentCurrency === 'TRY' ? minPayTRY : selectedDebt.minimumPayment;
              const quickAll = paymentCurrency === 'TRY' ? balanceTRY : selectedDebt.balance;
              const activeSym = paymentCurrency === 'TRY' ? '₺' : currencySymbol(debtCurrency);

              return (
                <>
                  {/* Özet — TL karşılığı önce, orijinal para birimi küçük */}
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-xs text-slate-400">{isReceivable ? 'Seçili Alacak' : 'Seçili Borç'}</p>
                    <p className="text-white font-medium mt-0.5">{selectedDebt.name}</p>
                    <p className={`font-bold ${isReceivable ? 'text-emerald-300' : 'text-orange-300'}`}>
                      {formatCurrency(selectedDebt.balance, debtCurrency)}
                      {isForex && (
                        <span className="text-slate-500 text-xs ml-2 font-normal">
                          ≈ {formatCurrency(balanceTRY)}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Para birimi seçici (yabancı para ise göster) */}
                  {isForex && (
                    <div className="flex gap-2">
                      <p className="text-xs text-slate-400 self-center mr-1">
                        {isReceivable ? 'Tahsilat Para Birimi:' : 'Ödeme Para Birimi:'}
                      </p>
                      {(['TRY', debtCurrency] as const).map(cur => (
                        <button key={cur}
                          onClick={() => { setPaymentCurrency(cur === 'TRY' ? 'TRY' : 'ORIGINAL'); setPaymentAmount(''); }}
                          className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-all border ${
                            (cur === 'TRY' ? paymentCurrency === 'TRY' : paymentCurrency === 'ORIGINAL')
                              ? 'bg-blue-500/30 border-blue-500/60 text-blue-200'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                          }`}>
                          {cur === 'TRY' ? '₺ Türk Lirası' : `${currencySymbol(debtCurrency)} ${debtCurrency}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Tutar */}
                  <div>
                    <Label className="text-xs text-slate-400 mb-1.5 block">
                      {isReceivable ? 'Tahsil Edilen Tutar' : 'Ödeme Tutarı'} ({activeSym})
                      {isForex && paymentCurrency === 'TRY' && rates && (
                        <span className="text-slate-500 ml-1">
                          — kura göre {currencySymbol(debtCurrency)} olarak düşülecek
                        </span>
                      )}
                    </Label>
                    <Input type="number" placeholder="0.00" value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      className="bg-white/5 border-white/10 text-white" />
                    <div className="flex gap-2 mt-2">
                      {[[quickMin, 'Asgari'], [quickAll, 'Tümü']]
                        .filter(([_, label]) => label !== 'Asgari' || !isReceivable)
                        .map(([v, label], i) => (
                          <button key={i} onClick={() => setPaymentAmount(String((v as number).toFixed(2)))}
                            className="text-xs text-blue-400 hover:text-blue-300 underline">
                            {label}: {activeSym}{Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaymentModalOpen(false)} className="text-slate-400 hover:text-white hover:bg-white/10">İptal</Button>
            <Button onClick={handleMakePayment} className="bg-blue-600 hover:bg-blue-500 text-white">
              {selectedDebt?.type === 'receivable' ? 'Tahsilatı Kaydet' : 'Ödemeyi Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Debt Modal */}
      <Dialog open={!!editingDebt} onOpenChange={(open) => !open && setEditingDebt(null)}>
        <DialogContent className="bg-[#0f172a] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Ekstre Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-300">İsim</label>
              <Input value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Bakiye</label>
              <Input type="number" value={editFormData.balance} onChange={e => setEditFormData({...editFormData, balance: e.target.value})} className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Yıllık Faiz (%)</label>
              <Input type="number" value={editFormData.apr} onChange={e => setEditFormData({...editFormData, apr: e.target.value})} className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Asgari Ödeme</label>
              <Input type="number" value={editFormData.minimumPayment} onChange={e => setEditFormData({...editFormData, minimumPayment: e.target.value})} className="bg-white/5 border-white/10" />
            </div>
            <Button onClick={handleEditSubmit} className="w-full">Kaydet</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rollover Modal */}
      <Dialog open={!!rolloverDebt} onOpenChange={(open) => !open && setRolloverDebt(null)}>
        <DialogContent className="bg-[#0f172a] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Yeni Dönem Başlat</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-slate-300">
            <p className="mb-4">Bu ekstre için ayı kapatıp yeni döneme geçmek istiyor musunuz?</p>
            <p className="mb-4 text-sm text-slate-400">Ödenmemiş bakiye yeni aya <strong>Önceki Ekstreden Kalan Borç</strong> olarak devredilecek ve bu kayıt arşive kaldırılacaktır.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setRolloverDebt(null)}>İptal</Button>
              <Button onClick={handleRollover} className="bg-purple-600 hover:bg-purple-700">Yeni Dönemi Başlat</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}