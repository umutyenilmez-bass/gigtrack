import { Response } from "express";
import db, { toLira, toCents } from "../db.js";
import { AuthRequest } from "../types/index.js";
import { processApprovedIds } from "./import.js";

export const getProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    // Auto-finalize any pending statement drafts for the user so they are instantly processed
    const pendingDrafts = await db.prepare("SELECT id FROM draft_transactions WHERE user_id = ? AND status = 'pending'").all(userId) as any[];
    if (pendingDrafts.length > 0) {
      const now = new Date().toISOString();
      const approvedIds = pendingDrafts.map(d => d.id);
      const placeholders = approvedIds.map(() => '?').join(',');
      await db.prepare(`UPDATE draft_transactions SET status = 'approved' WHERE user_id = ? AND id IN (${placeholders}) AND status = 'pending'`)
        .run(userId, ...approvedIds);
      await processApprovedIds(userId!, approvedIds, now);
    }

    const profile = await db.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(userId) as any;
    const userExpenses = await db.prepare("SELECT * FROM expenses WHERE user_id = ?").get(req.user?.id) as any;
    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(req.user?.id) as any;

    const rentLira = toLira(profile?.rent);
    const rentIncomeLira = profile?.rent_income ? toLira(profile.rent_income) : 0;
    let debtsList = profile?.debts_list ? JSON.parse(profile.debts_list) : [];

    let listModified = false;
    const rentDebtId = 'manual_rent_expense';
    const rentDebtIdx = debtsList.findIndex((d: any) => d.id === rentDebtId);
    if (rentDebtIdx !== -1) {
      if (debtsList[rentDebtIdx].minimumPayment !== 0) {
        debtsList[rentDebtIdx].minimumPayment = 0;
        listModified = true;
      }
    } else if (rentLira > 0) {
      debtsList.push({
        id: rentDebtId,
        name: 'Aylık Kira Ödemesi',
        balance: rentLira,
        apr: 0,
        minimumPayment: 0,
        type: 'debt'
      });
      listModified = true;
    }

    const rentIncomeId = 'manual_rent_income';
    const rentIncomeIdx = debtsList.findIndex((d: any) => d.id === rentIncomeId);
    if (rentIncomeIdx !== -1) {
      if (debtsList[rentIncomeIdx].minimumPayment !== 0) {
        debtsList[rentIncomeIdx].minimumPayment = 0;
        listModified = true;
      }
    } else if (rentIncomeLira > 0) {
      debtsList.push({
        id: rentIncomeId,
        name: 'Aylık Kira Geliri',
        balance: rentIncomeLira,
        apr: 0,
        minimumPayment: 0,
        type: 'receivable'
      });
      listModified = true;
    }

    const originalDebts = profile?.debts_list ? JSON.parse(profile.debts_list) : [];
    if (listModified || debtsList.length !== originalDebts.length) {
      await db.prepare("UPDATE financial_profiles SET debts_list = ? WHERE user_id = ?")
        .run(JSON.stringify(debtsList), userId);
    }

    res.json({
      financialData: {
        monthlyIncome: toLira(profile?.monthly_income),
        rent: rentLira,
        rentIncome: rentIncomeLira,
        readyCash: profile?.ready_cash !== undefined && profile?.ready_cash !== null ? toLira(profile.ready_cash) : 0,
        totalDebt: toLira(profile?.total_debt),
        interestRate: toLira(profile?.interest_rate),
        minimumPaymentIsBankasi: toLira(profile?.min_payment_isbank),
        minimumPaymentEnpara: toLira(profile?.min_payment_enpara),
        debtsList: debtsList
      },
      expenses: {
        essentials: toLira(userExpenses?.essentials),
        financial: toLira(userExpenses?.financial),
        discretionary: toLira(userExpenses?.discretionary),
        subscriptions: toLira(userExpenses?.subscriptions),
        installments: toLira(userExpenses?.installments),
      },
      modelProvider: user?.model_provider || 'gemini',
      localEndpoint: user?.local_endpoint || 'http://localhost:1234/v1',
      modelName: user?.model_name || '',
      hasApiKey: !!user?.api_key,
      hasCurrencyApiKey: !!user?.currency_api_key,
      hasDriveConfig: !!(user?.gdrive_api_key && user?.gdrive_folder_id),
    });
  } catch (err) {
    console.error("getProfile error:", err);
    res.status(500).json({ error: "Profil verileri alınamadı." });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  const { financialData, expenses } = req.body;
  try {
    // Compare balances to detect manual payments and insert them in ledger
    const oldProfile = await db.prepare("SELECT rent, rent_income, debts_list FROM financial_profiles WHERE user_id = ?").get(req.user?.id) as any;
    const oldRent = oldProfile ? toLira(oldProfile.rent) : 0;
    const oldRentIncome = oldProfile?.rent_income ? toLira(oldProfile.rent_income) : 0;
    const oldDebts = oldProfile?.debts_list ? JSON.parse(oldProfile.debts_list) : [];
    let newDebts = financialData.debtsList || [];
    const newRent = financialData.rent || 0;
    const newRentIncome = financialData.rentIncome || 0;

    // Auto-sync rent expense (Aylık Kira Ödemesi)
    const rentDebtId = 'manual_rent_expense';
    const existingRentDebtIndex = newDebts.findIndex((d: any) => d.id === rentDebtId);
    if (newRent > 0) {
      const rentDebtObj = {
        id: rentDebtId,
        name: 'Aylık Kira Ödemesi',
        balance: existingRentDebtIndex !== -1 && newRent === oldRent 
          ? newDebts[existingRentDebtIndex].balance 
          : newRent,
        apr: 0,
        minimumPayment: 0,
        type: 'debt'
      };

      if (existingRentDebtIndex !== -1) {
        newDebts[existingRentDebtIndex] = rentDebtObj;
      } else {
        newDebts.push(rentDebtObj);
      }
    } else {
      newDebts = newDebts.filter((d: any) => d.id !== rentDebtId);
    }

    // Auto-sync rent income (Aylık Kira Geliri)
    const rentIncomeId = 'manual_rent_income';
    const existingRentIncomeIndex = newDebts.findIndex((d: any) => d.id === rentIncomeId);
    if (newRentIncome > 0) {
      const rentIncomeObj = {
        id: rentIncomeId,
        name: 'Aylık Kira Geliri',
        balance: existingRentIncomeIndex !== -1 && newRentIncome === oldRentIncome 
          ? newDebts[existingRentIncomeIndex].balance 
          : newRentIncome,
        apr: 0,
        minimumPayment: 0,
        type: 'receivable'
      };

      if (existingRentIncomeIndex !== -1) {
        newDebts[existingRentIncomeIndex] = rentIncomeObj;
      } else {
        newDebts.push(rentIncomeObj);
      }
    } else {
      newDebts = newDebts.filter((d: any) => d.id !== rentIncomeId);
    }

    for (const newD of newDebts) {
      const oldD = oldDebts.find((o: any) => o.id === newD.id);
      if (oldD && newD.balance < oldD.balance) {
        const payAmount = oldD.balance - newD.balance;
        if (payAmount > 0.01) {
          const ledgerId = `ledger_pay_${Math.random().toString(36).slice(2, 10)}`;
          const now = new Date().toISOString();

          // Ensure account reference exists in accounts table
          await db.prepare(`
            INSERT OR IGNORE INTO accounts (id, user_id, name, type, balance)
            VALUES (?, ?, ?, 'credit_card', ?)
          `).run(newD.id, req.user?.id, newD.name, toCents(newD.balance));

          await db.prepare(`
            INSERT INTO ledger_transactions (id, user_id, account_id, transaction_date, amount, type, description, created_at)
            VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)
          `).run(
            ledgerId,
            req.user?.id,
            newD.id,
            now.substring(0, 10),
            toCents(payAmount),
            `${newD.name} Borç Ödemesi`,
            now
          );
        }
      }
    }

    await db.prepare(`
      UPDATE financial_profiles SET 
        monthly_income = ?, rent = ?, rent_income = ?, total_debt = ?, interest_rate = ?, 
        min_payment_isbank = ?, min_payment_enpara = ?, debts_list = ?, ready_cash = ?
      WHERE user_id = ?
    `).run(
      toCents(financialData.monthlyIncome), toCents(financialData.rent), toCents(financialData.rentIncome), toCents(financialData.totalDebt), toCents(financialData.interestRate),
      toCents(financialData.minimumPaymentIsBankasi), toCents(financialData.minimumPaymentEnpara),
      JSON.stringify(newDebts),
      toCents(financialData.readyCash || 0),
      req.user?.id
    );

    await db.prepare(`
      UPDATE expenses SET 
        essentials = ?, financial = ?, discretionary = ?, subscriptions = ?, installments = ?
      WHERE user_id = ?
    `).run(
      toCents(expenses.essentials), toCents(expenses.financial), toCents(expenses.discretionary), toCents(expenses.subscriptions), toCents(expenses.installments), req.user?.id
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Profil güncellenemedi." });
  }
};

export const getCurrencyRates = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    const user = userId ? await db.prepare("SELECT currency_api_key FROM users WHERE id = ?").get(userId) as any : null;
    const apiKey = user?.currency_api_key || process.env.CURRENCY_API_KEY || 'fca_live_StZ6kUwnUPsDaGDr0FGiDgRRi3we9D9gH95zWGI3';

    if (apiKey) {
      try {
        const response = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&currencies=TRY,EUR,GBP`);
        if (response.ok) {
          const json = await response.json() as any;
          const rates = json.data;
          if (rates && rates.TRY) {
            const usd = rates.TRY;
            const eur = rates.EUR ? rates.TRY / rates.EUR : usd * 1.08;
            const gbp = rates.GBP ? rates.TRY / rates.GBP : usd * 1.28;
            res.json({
              usd: parseFloat(usd.toFixed(2)),
              eur: parseFloat(eur.toFixed(2)),
              gbp: parseFloat(gbp.toFixed(2)),
              isLive: true
            });
            return;
          }
        }
      } catch (e) {
        console.error("Freecurrencyapi error, trying live fallback:", e);
      }
    }

    // Live Fallback: open.er-api.com
    try {
      const openRes = await fetch('https://open.er-api.com/v6/latest/USD');
      if (openRes.ok) {
        const openData = await openRes.json() as any;
        if (openData.rates && openData.rates.TRY) {
          const usd = openData.rates.TRY;
          const eur = openData.rates.EUR ? openData.rates.TRY / openData.rates.EUR : usd * 1.08;
          const gbp = openData.rates.GBP ? openData.rates.TRY / openData.rates.GBP : usd * 1.28;
          res.json({
            usd: parseFloat(usd.toFixed(2)),
            eur: parseFloat(eur.toFixed(2)),
            gbp: parseFloat(gbp.toFixed(2)),
            isLive: true
          });
          return;
        }
      }
    } catch (e) {
      console.error("Live fallback error:", e);
    }

    // Fallback: Default market estimation
    res.json({
      usd: 47.42,
      eur: 54.16,
      gbp: 63.17,
      isLive: false
    });
  } catch (err) {
    console.error("Currency rates error:", err);
    res.json({
      usd: 47.42,
      eur: 54.16,
      gbp: 63.17,
      isLive: false
    });
  }
};

// ─── Google Drive Ayarlarini Kaydet ───────────────────────────
export const saveDriveConfig = async (req: AuthRequest, res: Response) => {
  const { gdriveApiKey, gdriveFolderId } = req.body;
  try {
    await db.prepare("UPDATE users SET gdrive_api_key = ?, gdrive_folder_id = ? WHERE id = ?")
      .run(gdriveApiKey || null, gdriveFolderId || null, req.user?.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Drive ayarları kaydedilemedi." });
  }
};

// ─── Google Drive'a Yedek Gönder ──────────────────────────────
export const backupToDrive = async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.prepare("SELECT gdrive_api_key, gdrive_folder_id FROM users WHERE id = ?").get(req.user?.id) as any;
    if (!user?.gdrive_api_key || !user?.gdrive_folder_id) {
      res.status(400).json({ error: "Google Drive API Key ve Folder ID girilmemiş." });
      return;
    }

    // Kullanıcı verilerini topla
    const profile = await db.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(req.user?.id) as any;
    const expenses = await db.prepare("SELECT * FROM expenses WHERE user_id = ?").get(req.user?.id) as any;
    const dbUser = await db.prepare("SELECT username FROM users WHERE id = ?").get(req.user?.id) as any;

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      username: dbUser?.username,
      financialData: {
        monthlyIncome: profile?.monthly_income / 100 || 0,
        rent: profile?.rent / 100 || 0,
        totalDebt: profile?.total_debt / 100 || 0,
        debtsList: profile?.debts_list ? JSON.parse(profile.debts_list) : []
      },
      expenses: {
        essentials: expenses?.essentials / 100 || 0,
        financial: expenses?.financial / 100 || 0,
        discretionary: expenses?.discretionary / 100 || 0,
        subscriptions: expenses?.subscriptions / 100 || 0,
        installments: expenses?.installments / 100 || 0,
      }
    };

    const fileName = `cfos_backup_${new Date().toISOString().slice(0,10)}.json`;
    const content = JSON.stringify(backup, null, 2);
    const contentB64 = Buffer.from(content).toString('base64');

    // Google Drive REST API: multipart upload
    const boundary = '-------cfos_boundary';
    const metadata = JSON.stringify({ name: fileName, parents: [user.gdrive_folder_id] });
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      'Content-Transfer-Encoding: base64',
      '',
      contentB64,
      `--${boundary}--`
    ].join('\r\n');

    const driveRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.gdrive_api_key}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body
      }
    );

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      res.status(400).json({ error: `Drive yükleme hatası: ${errText}` });
      return;
    }

    const driveJson = await driveRes.ok ? await driveRes.json() as any : {};
    res.json({ success: true, fileId: driveJson.id, fileName });
  } catch (err: any) {
    res.status(500).json({ error: `Drive yedekleme hatası: ${err.message}` });
  }
};

export const getTransactions = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { cardId } = req.query;
  try {
    let query = "SELECT * FROM transactions WHERE card_id IN (SELECT id FROM credit_cards WHERE user_id = ?) ORDER BY transaction_date DESC";
    let params: any[] = [userId];
    if (cardId) {
      query = "SELECT id, card_id, transaction_date, description, amount, category, created_at FROM transactions WHERE card_id = ? AND card_id IN (SELECT id FROM credit_cards WHERE user_id = ?) ORDER BY transaction_date DESC";
      params = [cardId, userId];
    }
    const rawTransactions = await db.prepare(query).all(...params) as any[];
    const transactions = rawTransactions.map(t => ({
      ...t,
      amount: toLira(t.amount)
    }));
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: "İşlemler alınamadı." });
  }
};

export const resetProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    const runInTransaction = db.transaction(() => {
      // 1. Delete transactions
      db.prepare("DELETE FROM transactions WHERE card_id IN (SELECT id FROM credit_cards WHERE user_id = ?)")
        .run(userId);
      // 2. Delete ledger transactions
      db.prepare("DELETE FROM ledger_transactions WHERE user_id = ?")
        .run(userId);
      // 3. Delete draft transactions
      db.prepare("DELETE FROM draft_transactions WHERE user_id = ?")
        .run(userId);
      // 4. Delete credit cards
      db.prepare("DELETE FROM credit_cards WHERE user_id = ?")
        .run(userId);
      // 5. Delete accounts
      db.prepare("DELETE FROM accounts WHERE user_id = ?")
        .run(userId);
      // 6. Reset expenses
      db.prepare("UPDATE expenses SET essentials = 0, financial = 0, discretionary = 0, subscriptions = 0, installments = 0 WHERE user_id = ?")
        .run(userId);
      // 7. Reset financial profile
      db.prepare("UPDATE financial_profiles SET monthly_income = 0, rent = 0, total_debt = 0, interest_rate = 0, min_payment_isbank = 0, min_payment_enpara = 0, debts_list = '[]' WHERE user_id = ?")
        .run(userId);
    });
    await runInTransaction();
    res.json({ success: true, message: "Sistem başarıyla sıfırlandı." });
  } catch (err: any) {
    console.error("Reset profile error:", err);
    res.status(500).json({ error: "Sistem sıfırlanırken bir hata oluştu." });
  }
};
