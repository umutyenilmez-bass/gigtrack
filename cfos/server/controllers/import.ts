import { Response } from "express";
import { AuthRequest } from "../types/index.js";
import db, { toCents, toLira } from "../db.js";
import { parseBankStatement } from "../pdfParser.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer, options?: any) => Promise<{text: string; numpages: number; info: any}> = require("pdf-parse");

// Helper function to process and finalize approved draft transactions to ledger
export async function processApprovedIds(userId: number, approvedIds: string[], now: string) {
  if (approvedIds.length === 0) return;
  const placeholders = approvedIds.map(() => '?').join(',');
  const approvedDrafts = await db.prepare(`SELECT * FROM draft_transactions WHERE user_id = ? AND id IN (${placeholders}) AND status = 'approved'`).all(userId, ...approvedIds) as any[];

  // 1. Move to Transactions and Ledger
  for (const draft of approvedDrafts) {
    const match = draft.id.match(/^draft_(card_.*?)_([^_]+)_([^_]+)$/);
    const cardId = match ? match[1] : `unknown_${draft.id}`;

    const parts = (draft.import_source || '').split('|');
    if (parts.length >= 4) {
      const bankName = parts[0].replace('pdf_', '');
      const totalDebt = parseFloat(parts[1]);
      const interestRate = parseFloat(parts[2]);
      const minimumPayment = parseFloat(parts[3]);
      const last4 = cardId.split('_').pop();

      const existingCard = await db.prepare("SELECT id FROM credit_cards WHERE id = ?").get(cardId);
      if (existingCard) {
        await db.prepare(`UPDATE credit_cards SET total_debt = ?, interest_rate = ?, minimum_payment = ? WHERE id = ?`)
          .run(toCents(totalDebt), toCents(interestRate), toCents(minimumPayment), cardId);
      } else {
        await db.prepare(`INSERT INTO credit_cards (id, user_id, bank_name, card_number_last4, total_debt, interest_rate, minimum_payment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(cardId, userId, bankName, last4, toCents(totalDebt), toCents(interestRate), toCents(minimumPayment), now);
      }

      // Ensure a corresponding account exists in accounts table for ledger reference
      const existingAccount = await db.prepare("SELECT id FROM accounts WHERE id = ?").get(cardId);
      if (!existingAccount) {
        await db.prepare(`INSERT INTO accounts (id, user_id, name, type, balance, currency, created_at) VALUES (?, ?, ?, 'credit_card', ?, 'TRY', ?)`)
          .run(cardId, userId, bankName === 'isbank' ? 'İş Bankası Kredi Kartı' : 'Enpara Kredi Kartı', -toCents(totalDebt), now);
      } else {
        await db.prepare(`UPDATE accounts SET balance = ? WHERE id = ?`)
          .run(-toCents(totalDebt), cardId);
      }
    }
    
    const exists = await db.prepare(`SELECT id FROM transactions WHERE card_id = ? AND transaction_date = ? AND description = ? AND amount = ?`).get(cardId, draft.transaction_date, draft.description, draft.amount);
    
    if (!exists) {
      const txId = `tx_${cardId}_${draft.transaction_date}_${Math.random().toString(36).slice(2, 8)}`;
      await db.prepare(`
        INSERT INTO transactions
          (id, card_id, transaction_date, description, amount, category, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(txId, cardId, draft.transaction_date, draft.description, draft.amount, draft.category, now);

      const ledgerId = `ledger_${Math.random().toString(36).slice(2, 10)}`;
      await db.prepare(`
        INSERT INTO ledger_transactions
          (id, user_id, account_id, transaction_date, amount, type, description, created_at)
        VALUES (?, ?, ?, ?, ?, 'expense', ?, ?)
      `).run(ledgerId, userId, cardId, draft.transaction_date, draft.amount, draft.description, now);
    }
  }

  // 2. Update expenses category summary
  const allTx = await db.prepare(
    "SELECT category, SUM(amount) as total FROM transactions WHERE card_id IN (SELECT id FROM credit_cards WHERE user_id = ?) GROUP BY category"
  ).all(userId) as any[];

  const expMap: Record<string, number> = {
    essentials: 0, financial: 0, discretionary: 0, subscriptions: 0, installments: 0
  };
  for (const row of allTx) {
    if (expMap[row.category] !== undefined) {
      expMap[row.category] = Math.round(row.total);
    }
  }

  await db.prepare(`
    UPDATE expenses SET
      essentials = ?,
      financial = ?,
      discretionary = ?,
      subscriptions = ?,
      installments = ?
    WHERE user_id = ?
  `).run(
    expMap.essentials, expMap.financial, expMap.discretionary,
    expMap.subscriptions, expMap.installments, userId
  );

  // 3. Update total debt and minimum payments under financial profiles
  const allCards = await db.prepare("SELECT * FROM credit_cards WHERE user_id = ?").all(userId) as any[];
  const totalAllDebt = allCards.reduce((s: number, c: any) => s + (c.total_debt || 0), 0);
  const avgInterest  = allCards.length ? allCards.reduce((s: number, c: any) => s + (c.interest_rate || 0), 0) / allCards.length : 0;
  const minIsbank = allCards.filter((c: any) => c.bank_name === 'isbank').reduce((s: number, c: any) => s + (c.minimum_payment || 0), 0);
  const minEnpara = allCards.filter((c: any) => c.bank_name === 'enpara').reduce((s: number, c: any) => s + (c.minimum_payment || 0), 0);

  // Preserve existing manual debts/receivables (non-card-based IDs)
  const profile = await db.prepare("SELECT debts_list FROM financial_profiles WHERE user_id = ?").get(userId) as any;
  const existingDebtsList: any[] = profile?.debts_list ? JSON.parse(profile.debts_list) : [];

  // Keep all archived entries as-is (they are historical records)
  const archivedEntries = existingDebtsList.filter((d: any) => d.archived === true);

  // Keep manual debts/receivables that are not card-based at all
  const manualDebts = existingDebtsList.filter((d: any) => !d.id.startsWith('card_') && !d.archived);

  // Build fresh entries from credit_cards table, but MERGE with existing active card entries
  // to preserve carriedOverAmount and other metadata
  const cardDebtsList = allCards.map((c: any) => {
    const cardName = c.bank_name === 'isbank' ? 'İş Bankası Kredi Kartı' : 'Enpara Kredi Kartı';
    // Find the currently active (non-archived) entry for this card in the existing list
    const existingActive = existingDebtsList.find(
      (d: any) => d.id === c.id && !d.archived
    );
    return {
      id: c.id,
      name: cardName,
      balance: toLira(c.total_debt),
      apr: c.interest_rate || 51,
      minimumPayment: toLira(c.minimum_payment),
      bankName: c.bank_name,
      type: 'debt' as const,
      // Preserve rollover metadata if it exists
      ...(existingActive?.carriedOverAmount !== undefined && { carriedOverAmount: existingActive.carriedOverAmount }),
      ...(existingActive?.statementDate !== undefined && { statementDate: existingActive.statementDate }),
    };
  });

  const updatedDebtsList = [...manualDebts, ...cardDebtsList, ...archivedEntries];

  await db.prepare(`
    UPDATE financial_profiles SET
      total_debt = ?,
      interest_rate = ?,
      min_payment_isbank = ?,
      min_payment_enpara = ?,
      debts_list = ?
    WHERE user_id = ?
  `).run(totalAllDebt, avgInterest, minIsbank, minEnpara, JSON.stringify(updatedDebtsList), userId);
}


export const uploadStatement = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "Dosya yüklenmedi." });
    return;
  }

  try {
    // ── 1. Extract PDF Text ──────────────────────────────────────────────
    const pdfData = await pdfParse(req.file.buffer);
    const pdfText = pdfData.text;

    if (!pdfText || pdfText.trim().length < 20) {
      throw new Error("PDF içeriği okunamadı. Tarayıcıdan PDF (görüntü değil metin tabanlı) yüklediğinizden emin olun.");
    }

    // Log raw text to file for debugging
    try {
      const fs = await import("fs");
      fs.writeFileSync("pdf_debug.txt", pdfText, "utf-8");
      console.log("Logged uploaded PDF text to pdf_debug.txt");
    } catch (fsErr) {
      console.error("Failed to write pdf_debug.txt:", fsErr);
    }

    // ── 2. Parse PDF Statement ───────────────────────────────────────────
    const parsed = parseBankStatement(pdfText);

    // ── 3. Register Credit Card and Commit Transactions Directly ─────────
    const cardId = `card_${req.user?.id}_${parsed.bankName}_${parsed.cardNumberLast4}`;
    const now = new Date().toISOString();

    const importSource = `pdf_${parsed.bankName}|${parsed.totalDebt}|${parsed.interestRate}|${parsed.minimumPayment}`;
    const draftIds: string[] = [];

    // 3.5. Write draft transactions as approved
    for (const tx of parsed.transactions) {
      const draftId = `draft_${cardId}_${tx.date}_${Math.random().toString(36).slice(2, 8)}`;
      draftIds.push(draftId);
      await db.prepare(`
        INSERT INTO draft_transactions
          (id, user_id, import_source, transaction_date, description, amount, category, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?)
      `).run(
        draftId,
        req.user?.id,
        importSource,
        tx.date,
        tx.description,
        toCents(tx.amount),
        tx.category,
        now
      );
    }

    // Automatically commit these transactions to the final tables
    await processApprovedIds(req.user?.id!, draftIds, now);

    res.json({
      success: true,
      bankName: parsed.bankName,
      cardNumberLast4: parsed.cardNumberLast4,
      totalDebt: parsed.totalDebt,
      interestRate: parsed.interestRate,
      minimumPayment: parsed.minimumPayment,
      transactionCount: parsed.transactions.length,
      categoryTotals: parsed.categoryTotals,
      usedFallback: false
    });

  } catch (err: any) {
    console.error("PDF Ekstre hatası:", err);
    res.status(500).json({ error: err.message || "PDF ekstresi işlenirken hata oluştu." });
  }
};

export const getDrafts = async (req: AuthRequest, res: Response) => {
  try {
    const drafts = await db.prepare("SELECT * FROM draft_transactions WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC").all(req.user?.id);
    res.json({ drafts });
  } catch (err: any) {
    res.status(500).json({ error: "Taslaklar alınamadı." });
  }
};

export const finalizeDrafts = async (req: AuthRequest, res: Response) => {
  const { approvedIds, rejectedIds } = req.body || {};
  const userId = req.user?.id;
  const now = new Date().toISOString();

  try {
    if (approvedIds && Array.isArray(approvedIds) && approvedIds.length > 0) {
      const placeholders = approvedIds.map(() => '?').join(',');
      await db.prepare(`UPDATE draft_transactions SET status = 'approved' WHERE user_id = ? AND id IN (${placeholders}) AND status = 'pending'`)
        .run(userId, ...approvedIds);
      
      await processApprovedIds(userId!, approvedIds, now);
    }
    
    if (rejectedIds && Array.isArray(rejectedIds) && rejectedIds.length > 0) {
      const placeholders = rejectedIds.map(() => '?').join(',');
      await db.prepare(`UPDATE draft_transactions SET status = 'rejected' WHERE user_id = ? AND id IN (${placeholders}) AND status = 'pending'`)
        .run(userId, ...rejectedIds);
    }

    res.json({ success: true, message: "Taslaklar başarıyla deftere işlendi." });
  } catch (err: any) {
    console.error("Finalize error:", err);
    res.status(500).json({ error: "Taslaklar güncellenemedi." });
  }
};
