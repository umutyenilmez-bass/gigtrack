// server/app.ts
import express from "express";
import cors from "cors";

// server/middleware/gdriveSync.ts
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import path from "path";
import fs2 from "fs";
import { fileURLToPath } from "url";

// server/db.ts
import { AsyncLocalStorage } from "async_hooks";
var dbContext = new AsyncLocalStorage();
var dbAdapter = {
  prepare(sql) {
    const activeDb = dbContext.getStore();
    if (!activeDb) {
      throw new Error("Aktif veritaban\u0131 ba\u011Flant\u0131s\u0131 bulunamad\u0131.");
    }
    return activeDb.prepare(sql);
  },
  transaction(fn) {
    const activeDb = dbContext.getStore();
    if (!activeDb) {
      throw new Error("Aktif veritaban\u0131 ba\u011Flant\u0131s\u0131 bulunamad\u0131.");
    }
    const sqliteTx = activeDb.transaction(fn);
    return async (...args) => {
      return sqliteTx(...args);
    };
  },
  exec(sql) {
    const activeDb = dbContext.getStore();
    if (!activeDb) {
      throw new Error("Aktif veritaban\u0131 ba\u011Flant\u0131s\u0131 bulunamad\u0131.");
    }
    return activeDb.exec(sql);
  },
  pragma(sql) {
    const activeDb = dbContext.getStore();
    if (!activeDb) {
      throw new Error("Aktif veritaban\u0131 ba\u011Flant\u0131s\u0131 bulunamad\u0131.");
    }
    return activeDb.pragma(sql);
  }
};
function initDbFile(dbInstance) {
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      api_key TEXT,
      model_provider TEXT DEFAULT 'gemini',
      local_endpoint TEXT DEFAULT 'http://localhost:1234/v1',
      model_name TEXT DEFAULT '',
      currency_api_key TEXT,
      gdrive_api_key TEXT,
      gdrive_folder_id TEXT
    );
  `);
  try {
    dbInstance.exec("ALTER TABLE users ADD COLUMN currency_api_key TEXT;");
  } catch (e) {
  }
  try {
    dbInstance.exec("ALTER TABLE users ADD COLUMN gdrive_api_key TEXT;");
  } catch (e) {
  }
  try {
    dbInstance.exec("ALTER TABLE users ADD COLUMN gdrive_folder_id TEXT;");
  } catch (e) {
  }
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'TRY',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS financial_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      monthly_income INTEGER DEFAULT 0,
      rent INTEGER DEFAULT 0,
      total_debt INTEGER DEFAULT 0,
      interest_rate INTEGER DEFAULT 0,
      min_payment_isbank INTEGER DEFAULT 0,
      min_payment_enpara INTEGER DEFAULT 0,
      debts_list TEXT DEFAULT '[]',
      rent_income INTEGER DEFAULT 0,
      ready_cash INTEGER DEFAULT 0
    );
  `);
  try {
    dbInstance.exec("ALTER TABLE financial_profiles ADD COLUMN rent_income INTEGER DEFAULT 0;");
  } catch (e) {
  }
  try {
    dbInstance.exec("ALTER TABLE financial_profiles ADD COLUMN ready_cash INTEGER DEFAULT 0;");
  } catch (e) {
  }
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      essentials INTEGER DEFAULT 0,
      financial INTEGER DEFAULT 0,
      discretionary INTEGER DEFAULT 0,
      subscriptions INTEGER DEFAULT 0,
      installments INTEGER DEFAULT 0
    );
  `);
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS credit_cards (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      bank_name TEXT NOT NULL,
      card_number_last4 TEXT NOT NULL,
      total_debt INTEGER DEFAULT 0,
      interest_rate INTEGER DEFAULT 0,
      minimum_payment INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'TRY',
      created_at DATETIME
    );
  `);
  try {
    dbInstance.exec("ALTER TABLE credit_cards ADD COLUMN currency TEXT DEFAULT 'TRY';");
  } catch (e) {
  }
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      transaction_date TEXT,
      description TEXT,
      amount INTEGER,
      category TEXT,
      created_at DATETIME
    );
  `);
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS draft_transactions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      import_source TEXT,
      transaction_date TEXT,
      description TEXT,
      amount INTEGER,
      category TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS ledger_transactions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      account_id TEXT,
      transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
function toCents(lira) {
  if (lira === void 0 || lira === null) return 0;
  return Math.round(Number(lira) * 100);
}
function toLira(cents) {
  if (cents === void 0 || cents === null) return 0;
  return Number(cents) / 100;
}
var db_default = dbAdapter;

// server/services/gdrive.ts
import crypto from "crypto";
import fs from "fs";
async function getAccessToken(gdriveApiKey) {
  const trimmed = gdriveApiKey.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const key = JSON.parse(trimmed);
      const privateKey = key.private_key;
      const clientEmail = key.client_email;
      if (!privateKey || !clientEmail) {
        throw new Error("Ge\xE7ersiz Service Account JSON format\u0131. private_key ve client_email bulunamad\u0131.");
      }
      const header = {
        alg: "RS256",
        typ: "JWT"
      };
      const now = Math.floor(Date.now() / 1e3);
      const payload = {
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/drive",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
      };
      const base64UrlEncode = (obj) => {
        return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      };
      const tokenParts = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(tokenParts);
      const signature = sign.sign(privateKey, "base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const assertion = `${tokenParts}.${signature}`;
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google OAuth hatas\u0131: ${errText}`);
      }
      const data = await response.json();
      return data.access_token;
    } catch (e) {
      throw new Error(`Google Service Account token alma hatas\u0131: ${e.message}`);
    }
  }
  return trimmed;
}
async function findDbFile(accessToken, folderId) {
  const query = encodeURIComponent(`name='cfos_db.sqlite' and '${folderId}' in parents and trashed=false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive listeleme hatas\u0131: ${errText}`);
  }
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}
async function downloadDbFile(accessToken, fileId, destPath) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive indirme hatas\u0131: ${errText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}
async function uploadNewDbFile(accessToken, folderId, srcPath) {
  const metadata = {
    name: "cfos_db.sqlite",
    parents: [folderId]
  };
  const fileContent = fs.readFileSync(srcPath);
  const boundary = "-------cfos_multipart_boundary";
  const bodyBuffer = Buffer.concat([
    Buffer.from(`--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}\r
`),
    Buffer.from(`--${boundary}\r
Content-Type: application/octet-stream\r
\r
`),
    fileContent,
    Buffer.from(`\r
--${boundary}--\r
`)
  ]);
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: bodyBuffer
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive y\xFCkleme hatas\u0131: ${errText}`);
  }
  const data = await response.json();
  return data.id;
}
async function updateDbFile(accessToken, fileId, srcPath) {
  const fileContent = fs.readFileSync(srcPath);
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream"
      },
      body: fileContent
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive g\xFCncelleme hatas\u0131: ${errText}`);
  }
}
async function findOrCreateFolder(accessToken, folderName) {
  const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&spaces=drive`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive klas\xF6r sorgulama hatas\u0131: ${errText}`);
  }
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  const createResponse = await fetch(
    "https://www.googleapis.com/drive/v3/files",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder"
      })
    }
  );
  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Drive klas\xF6r olu\u015Fturma hatas\u0131: ${errText}`);
  }
  const folderData = await createResponse.json();
  return folderData.id;
}

// server/middleware/gdriveSync.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var JWT_SECRET = process.env.JWT_SECRET || "cfos-dev-secret-change-in-production";
var LOCAL_DB_PATH = process.env.VERCEL ? path.join("/tmp", "finans_db.sqlite") : path.resolve(__dirname, "..", "finans_db.sqlite");
var gdriveSyncMiddleware = async (req, res, next) => {
  if (!req.path.startsWith("/api")) {
    return next();
  }
  let gdriveApiKey = req.headers["x-gdrive-api-key"] || req.body?.gdriveApiKey;
  let gdriveFolderId = req.headers["x-gdrive-folder-id"] || req.body?.gdriveFolderId;
  let googleRefreshToken = "";
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.gdriveApiKey) gdriveApiKey = decoded.gdriveApiKey;
      if (decoded.gdriveFolderId) gdriveFolderId = decoded.gdriveFolderId;
      if (decoded.googleRefreshToken) googleRefreshToken = decoded.googleRefreshToken;
      req.user = decoded;
    } catch (e) {
    }
  }
  const isDriveMode = !!((gdriveApiKey || googleRefreshToken) && gdriveFolderId);
  let dbInstance;
  let dbFilePath = LOCAL_DB_PATH;
  let driveAccessToken = "";
  let driveFileId = "";
  try {
    if (isDriveMode) {
      if (googleRefreshToken) {
        const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
            refresh_token: googleRefreshToken,
            grant_type: "refresh_token"
          })
        });
        if (!refreshResponse.ok) {
          const errTxt = await refreshResponse.text();
          throw new Error(`Google Refresh Token yenileme hatas\u0131: ${errTxt}`);
        }
        const refreshData = await refreshResponse.json();
        driveAccessToken = refreshData.access_token;
      } else {
        driveAccessToken = await getAccessToken(gdriveApiKey);
      }
      const safeFolderId = gdriveFolderId.replace(/[^a-zA-Z0-9-_]/g, "");
      dbFilePath = path.join("/tmp", `cfos_db_${safeFolderId}.sqlite`);
      const fileId = await findDbFile(driveAccessToken, gdriveFolderId);
      if (fileId) {
        driveFileId = fileId;
        await downloadDbFile(driveAccessToken, fileId, dbFilePath);
      } else {
        if (fs2.existsSync(dbFilePath)) {
          fs2.unlinkSync(dbFilePath);
        }
        const tempDb = new Database(dbFilePath);
        initDbFile(tempDb);
        tempDb.close();
        driveFileId = await uploadNewDbFile(driveAccessToken, gdriveFolderId, dbFilePath);
      }
    } else {
      dbFilePath = LOCAL_DB_PATH;
      const fileExists = fs2.existsSync(dbFilePath);
      if (!fileExists) {
        const tempDb = new Database(dbFilePath);
        initDbFile(tempDb);
        tempDb.close();
      }
    }
    dbInstance = new Database(dbFilePath);
    initDbFile(dbInstance);
    const originalJson = res.json;
    res.json = (async function(body) {
      if (dbInstance) {
        try {
          dbInstance.close();
          dbInstance = null;
        } catch (e) {
        }
      }
      if (isDriveMode && ["POST", "PUT", "DELETE"].includes(req.method) && driveAccessToken && driveFileId && fs2.existsSync(dbFilePath)) {
        try {
          console.log(`Auto-uploading changes to Google Drive for ${req.method} ${req.path}...`);
          await updateDbFile(driveAccessToken, driveFileId, dbFilePath);
          console.log("Google Drive upload successful.");
        } catch (e) {
          console.error("Google Drive upload failed:", e);
        }
        try {
          fs2.unlinkSync(dbFilePath);
        } catch (e) {
        }
      } else if (isDriveMode && fs2.existsSync(dbFilePath)) {
        try {
          fs2.unlinkSync(dbFilePath);
        } catch (e) {
        }
      }
      return originalJson.call(this, body);
    });
    dbContext.run(dbInstance, () => {
      next();
    });
  } catch (err) {
    console.error("Veritaban\u0131 y\xFCkleme hatas\u0131:", err);
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch (e) {
      }
    }
    res.status(500).json({ error: `Veritaban\u0131 senkronizasyon hatas\u0131: ${err.message}` });
  }
};

// server/routes/auth.ts
import { Router } from "express";

// server/controllers/auth.ts
import bcrypt from "bcryptjs";
import jwt2 from "jsonwebtoken";
import Database2 from "better-sqlite3";
import path2 from "path";
import fs3 from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
var JWT_SECRET2 = process.env.JWT_SECRET || "cfos-dev-secret-change-in-production";
var register = async (req, res) => {
  const { username, password, gdriveApiKey, gdriveFolderId } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Kullan\u0131c\u0131 ad\u0131 ve \u015Fifre gereklidir." });
    return;
  }
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const stmt = db_default.prepare("INSERT INTO users (username, password_hash, gdrive_api_key, gdrive_folder_id) VALUES (?, ?, ?, ?)");
    const result = await stmt.run(username, passwordHash, gdriveApiKey || null, gdriveFolderId || null);
    const userId = result.lastInsertRowid;
    await db_default.prepare("INSERT INTO financial_profiles (user_id) VALUES (?)").run(userId);
    await db_default.prepare("INSERT INTO expenses (user_id) VALUES (?)").run(userId);
    const token = jwt2.sign(
      { id: userId, username, gdriveApiKey: gdriveApiKey || "", gdriveFolderId: gdriveFolderId || "" },
      JWT_SECRET2,
      { expiresIn: "30d" }
    );
    res.json({ token, username });
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      res.status(400).json({ error: "Bu kullan\u0131c\u0131 ad\u0131 zaten al\u0131nm\u0131\u015F." });
      return;
    }
    res.status(500).json({ error: "Kay\u0131t s\u0131ras\u0131nda bir hata olu\u015Ftu." });
  }
};
var login = async (req, res) => {
  const { username, password, gdriveApiKey, gdriveFolderId } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Kullan\u0131c\u0131 ad\u0131 ve \u015Fifre gereklidir." });
    return;
  }
  try {
    const user = await db_default.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(400).json({ error: "Hatal\u0131 kullan\u0131c\u0131 ad\u0131 veya \u015Fifre." });
      return;
    }
    if (gdriveApiKey || gdriveFolderId) {
      await db_default.prepare("UPDATE users SET gdrive_api_key = ?, gdrive_folder_id = ? WHERE id = ?").run(gdriveApiKey || user.gdrive_api_key, gdriveFolderId || user.gdrive_folder_id, user.id);
    }
    const finalApiKey = gdriveApiKey || user.gdrive_api_key || "";
    const finalFolderId = gdriveFolderId || user.gdrive_folder_id || "";
    const token = jwt2.sign(
      { id: user.id, username: user.username, gdriveApiKey: finalApiKey, gdriveFolderId: finalFolderId },
      JWT_SECRET2,
      { expiresIn: "30d" }
    );
    res.json({ token, username: user.username, hasApiKey: !!user.api_key });
  } catch (err) {
    res.status(500).json({ error: "Giri\u015F s\u0131ras\u0131nda bir hata olu\u015Ftu." });
  }
};
var saveKey = async (req, res) => {
  const { modelProvider, localEndpoint, modelName, apiKey, currencyApiKey } = req.body;
  const userId = req.user?.id;
  try {
    const existingUser = await db_default.prepare("SELECT api_key, currency_api_key FROM users WHERE id = ?").get(userId);
    let finalApiKey = apiKey !== void 0 && apiKey !== "" ? apiKey : existingUser?.api_key || "";
    let finalCurrencyApiKey = currencyApiKey !== void 0 && currencyApiKey !== "" ? currencyApiKey : existingUser?.currency_api_key || "";
    finalApiKey = finalApiKey.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
    finalCurrencyApiKey = finalCurrencyApiKey.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
    if (finalApiKey && /[^\x00-\x7F]/.test(finalApiKey)) {
      res.status(400).json({ error: "Yapay zeka API anahtar\u0131 ge\xE7ersiz karakterler i\xE7eriyor." });
      return;
    }
    if (finalCurrencyApiKey && /[^\x00-\x7F]/.test(finalCurrencyApiKey)) {
      res.status(400).json({ error: "D\xF6viz API anahtar\u0131 ge\xE7ersiz karakterler i\xE7eriyor." });
      return;
    }
    await db_default.prepare(`
      UPDATE users SET 
        model_provider = ?, local_endpoint = ?, model_name = ?, api_key = ?, currency_api_key = ? 
      WHERE id = ?
    `).run(
      modelProvider || "gemini",
      localEndpoint || "http://localhost:1234/v1",
      modelName || "",
      finalApiKey,
      finalCurrencyApiKey,
      userId
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Model ayarlar\u0131 kaydedilemedi." });
  }
};
var googleLogin = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: clientId || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent"
  }).toString();
  res.redirect(googleAuthUrl);
};
var googleCallback = async (req, res) => {
  const { code } = req.query;
  if (!code) {
    res.status(400).send("Yetkilendirme kodu bulunamad\u0131.");
    return;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId || "",
        client_secret: clientSecret || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) {
      const errTxt = await tokenResponse.text();
      throw new Error(`Google token de\u011Fi\u015Fimi ba\u015Far\u0131s\u0131z oldu: ${errTxt}`);
    }
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const userData = await userResponse.json();
    const email = userData.email;
    const name = userData.name || email.split("@")[0];
    const folderId = await findOrCreateFolder(accessToken, "CfOS_Data");
    const safeFolderId = folderId.replace(/[^a-zA-Z0-9-_]/g, "");
    const dbFilePath = path2.join("/tmp", `cfos_db_${safeFolderId}.sqlite`);
    const fileId = await findDbFile(accessToken, folderId);
    let driveFileId = fileId;
    if (fileId) {
      await downloadDbFile(accessToken, fileId, dbFilePath);
    } else {
      if (fs3.existsSync(dbFilePath)) {
        fs3.unlinkSync(dbFilePath);
      }
      const tempDb = new Database2(dbFilePath);
      initDbFile(tempDb);
      tempDb.close();
      driveFileId = await uploadNewDbFile(accessToken, folderId, dbFilePath);
    }
    const dbInstance = new Database2(dbFilePath);
    let user;
    let userId;
    try {
      user = dbInstance.prepare("SELECT * FROM users WHERE username = ?").get(email);
      if (!user) {
        const stmt = dbInstance.prepare("INSERT INTO users (username, password_hash, gdrive_folder_id) VALUES (?, ?, ?)");
        const result = stmt.run(email, "google-oauth-dummy-password", folderId);
        userId = result.lastInsertRowid;
        dbInstance.prepare("INSERT INTO financial_profiles (user_id) VALUES (?)").run(userId);
        dbInstance.prepare("INSERT INTO expenses (user_id) VALUES (?)").run(userId);
      } else {
        userId = user.id;
        dbInstance.prepare("UPDATE users SET gdrive_folder_id = ? WHERE id = ?").run(folderId, userId);
      }
    } finally {
      dbInstance.close();
      await updateDbFile(accessToken, driveFileId, dbFilePath);
      try {
        fs3.unlinkSync(dbFilePath);
      } catch (e) {
      }
    }
    const token = jwt2.sign(
      {
        id: userId,
        username: email,
        googleRefreshToken: refreshToken || "",
        gdriveFolderId: folderId
      },
      JWT_SECRET2,
      { expiresIn: "30d" }
    );
    res.redirect(`/auth?token=${token}&username=${encodeURIComponent(name)}`);
  } catch (err) {
    console.error("Google login error:", err);
    res.status(500).send(`Google ile Giri\u015F Hatas\u0131: ${err.message}`);
  }
};

// server/middleware/auth.ts
import jwt3 from "jsonwebtoken";
var JWT_SECRET3 = process.env.JWT_SECRET || "cfos-dev-secret-change-in-production";
var authenticateToken = (req, res, next) => {
  const isLocalhost = req.get("host")?.includes("localhost") || req.get("host")?.includes("127.0.0.1");
  if (isLocalhost) {
    try {
      let user = db_default.prepare("SELECT * FROM users WHERE username = ?").get("local_user");
      if (!user) {
        const result = db_default.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run("local_user", "local_bypass_pw");
        const userId = result.lastInsertRowid;
        db_default.prepare("INSERT INTO financial_profiles (user_id) VALUES (?)").run(userId);
        db_default.prepare("INSERT INTO expenses (user_id) VALUES (?)").run(userId);
        user = { id: userId, username: "local_user" };
      }
      req.user = { id: user.id, username: user.username };
      return next();
    } catch (err) {
      console.error("Local auto-auth bypass failed:", err);
    }
  }
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Giri\u015F yap\u0131lmas\u0131 gerekiyor." });
    return;
  }
  jwt3.verify(token, JWT_SECRET3, (err, user) => {
    if (err) {
      res.status(403).json({ error: "Ge\xE7ersiz oturum." });
      return;
    }
    try {
      const userExists = db_default.prepare("SELECT id FROM users WHERE id = ?").get(user.id);
      if (!userExists) {
        res.status(401).json({ error: "Kullan\u0131c\u0131 bulunamad\u0131. L\xFCtfen tekrar kay\u0131t olun veya giri\u015F yap\u0131n." });
        return;
      }
    } catch (dbErr) {
    }
    req.user = user;
    next();
  });
};

// server/routes/auth.ts
var router = Router();
router.post("/register", register);
router.post("/login", login);
router.post("/key", authenticateToken, saveKey);
router.get("/google", googleLogin);
router.get("/google/callback", googleCallback);
var auth_default = router;

// server/routes/profile.ts
import { Router as Router2 } from "express";

// server/pdfParser.ts
function parseTrNumber(s) {
  s = String(s).trim().replace(/\s/g, "");
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function normalizeTR(s) {
  return s.toLowerCase().replace(/İ/g, "i").replace(/ı/g, "i").replace(/Ş/g, "s").replace(/ş/g, "s").replace(/Ğ/g, "g").replace(/ğ/g, "g").replace(/Ü/g, "u").replace(/ü/g, "u").replace(/Ö/g, "o").replace(/ö/g, "o").replace(/Ç/g, "c").replace(/ç/g, "c").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
var CAT_INSTALLMENT = ["taksit", "taksidi", "taksitli", "takside", " tks ", "/tks", "tks/"];
var CAT_SUBSCRIPTIONS = [
  "spotify",
  "youtube premium",
  "netflix",
  "blutv",
  "exxen",
  "gain tv",
  "tod",
  "mubi",
  "deezer",
  "apple music",
  "amazon music",
  "amazon prime",
  "disney",
  "hbo",
  "beinsports",
  "openai",
  "chatgpt",
  "claude",
  "anthropic",
  "midjourney",
  "notion",
  "figma",
  "canva",
  "adobe",
  "microsoft 365",
  "office 365",
  "google one",
  "google workspace",
  "dropbox",
  "icloud",
  "github",
  "digitalocean",
  "aws",
  "vercel",
  "app store",
  "google play",
  "gym",
  "fitness",
  "aidat",
  "spor salonu"
];
var CAT_ESSENTIALS = [
  // Telefon & İnternet & Faturalar (Kullanıcı zorunlu gider olarak tanımladı)
  "turkcell",
  "turk telekom",
  "telekom",
  "ttnet",
  "superonline",
  "bimcell",
  "netgsm",
  "vodafone",
  "d-smart",
  "digiturk",
  "tivibu",
  "fatura",
  "elektrik",
  "dogalgaz",
  " su ",
  "igdas",
  "enerjisa",
  "gdiz",
  "aydem",
  "ck bogazici",
  // Sigorta & BES
  "sigorta",
  "axa",
  "allianz",
  "agesa",
  "nn hayat",
  "bireysel emeklilik",
  "bes odemesi",
  // Marketler
  "migros",
  "carrefour",
  "a101",
  "bim ",
  "sok ",
  "metro market",
  "file market",
  "macro center",
  "gida",
  "market",
  "supermarket",
  "kasap",
  "manav",
  "firin",
  "bakkal",
  // Yakıt
  "shell",
  "opet",
  "petrol",
  "total energies",
  "bp ",
  "akaryakit",
  "benzin",
  "motorin",
  "aytemiz",
  "poas",
  // Sağlık
  "eczane",
  "eczanesi",
  "doktor",
  "klinik",
  "hastane",
  "saglik",
  "medikal",
  "optik",
  // Eğitim
  "okul",
  "egitim",
  "kurs",
  "kitap",
  "udemy",
  "coursera",
  // Ulaşım
  "iett",
  "ulasim",
  "metrobus",
  "metro istanbul",
  "marmaray",
  "taxi",
  "taksi",
  "hgs",
  "ogs",
  "otopark",
  "otogar",
  "ptt",
  "kargo",
  "cargo",
  // Yemek marketi
  "getir",
  "yemeksepeti market",
  "tazedirekt",
  "gorsel market"
];
var CAT_DISCRETIONARY = [
  // Fast food & Kafe & Yeme İçme (Keyfi harcamalar)
  "mcdonalds",
  "mcdonald",
  "burger king",
  "kfc ",
  "subway ",
  "popeyes",
  "starbucks",
  "caribou",
  "gloria jeans",
  "dunkin",
  "kahve",
  "starbucks",
  "kahvesi",
  "dominos",
  "little caesars",
  "sbarro",
  "pizza hut",
  "restoran",
  "restaurant",
  "cafe ",
  "bistro",
  "lokanta",
  "doner",
  "kebap",
  "lahmacun",
  "pide",
  "hamburger",
  "kofte",
  "kofteci",
  "donerci",
  "kebapci",
  "pizzaci",
  "burger",
  "corba",
  "corbaci",
  "pastane",
  "borek",
  "patisserie",
  "tatli",
  "tatlici",
  "bar ",
  "pub ",
  "lounge",
  "meyhane",
  "taverna",
  "sarap",
  "tekel",
  "bira",
  "cikolata",
  "yemeksepeti",
  "trendyol yemek",
  "getir yemek",
  "migros yemek",
  // Giyim & Alışveriş
  "zara",
  "h&m",
  "hm ",
  "lcwaikiki",
  "lcw",
  "lc waikiki",
  "koton",
  "defacto",
  "mango",
  "pull&bear",
  "bershka",
  "boyner",
  "network",
  "vakko",
  "pierre cardin",
  "kigili",
  "altinyildiz",
  "mavi",
  "colins",
  "nike",
  "adidas",
  "puma",
  "skechers",
  "flo ",
  "polaris",
  "decathlon",
  // E-ticaret
  "hepsiburada",
  "trendyol",
  "n11",
  "ciceksepeti",
  "amazon.com",
  "amazon.com.tr",
  "amazon turkey",
  "ikea",
  "koctas",
  "teknosa",
  "mediamarkt",
  "vatan",
  "beko",
  "vestel",
  // Eğlence / Turizm
  "biletix",
  "biletmaster",
  "passo",
  "sinema",
  "tiyatro",
  "konser",
  "otel",
  "hotel",
  "tatil",
  "bilet",
  "thy",
  "pegasus",
  "sunexpress",
  "anadolujet",
  "enuygun",
  "obilet",
  "jolly",
  "etstur"
];
var CAT_FINANCIAL = [
  "kredi taksit",
  "konut kredisi",
  "tasit kredisi",
  "ihtiyac kredisi",
  "kredi odeme",
  "faiz",
  "banka masrafi",
  "komisyon",
  "munzam aidat",
  "efthavale",
  "swift",
  "havale",
  "eft ",
  // Finansman borçlanma maliyetleri (faiz, vergi vb.)
  "kkdf",
  "bsmv",
  "gecikme faiz",
  "gecikme ucreti",
  "limit asim",
  "kart ucreti",
  "yillik ucret"
];
function detectCategory(description) {
  const n = normalizeTR(description);
  if (/\b\d+\s*\/\s*\d+\b/.test(n) || /\b\d+\s*tk\b/.test(n)) {
    return "installments";
  }
  if (CAT_INSTALLMENT.some((k) => n.includes(normalizeTR(k)))) return "installments";
  if (CAT_FINANCIAL.some((k) => n.includes(normalizeTR(k)))) return "financial";
  if (CAT_SUBSCRIPTIONS.some((k) => n.includes(normalizeTR(k)))) return "subscriptions";
  if (CAT_ESSENTIALS.some((k) => n.includes(normalizeTR(k)))) return "essentials";
  if (CAT_DISCRETIONARY.some((k) => n.includes(normalizeTR(k)))) return "discretionary";
  return "essentials";
}
function grab(normalizedText, patterns) {
  for (const p of patterns) {
    const idx = normalizedText.indexOf(normalizeTR(p));
    if (idx !== -1) {
      let chunk = normalizedText.substring(idx + p.length, idx + p.length + 150);
      chunk = chunk.replace(/\d{2}[./]\d{2}[./]\d{4}/g, "").replace(/\b202\d\b/g, "");
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
function parseIsbank(rawText, normText) {
  const totalDebt = grab(normText, [
    "hesap ozeti borcu",
    "donem borcu",
    "toplam ekstre borcu",
    "guncel ekstre borcu",
    "toplam borc",
    "hesap kesim tutari",
    "borc tutari"
  ]);
  const minimumPayment = grab(normText, [
    "odenmesi gereken asgari tutar",
    "asgari odeme tutari",
    "minimum odeme tutari",
    "asgari tutar",
    "asgari odeme(?!\\s*oran)"
  ]);
  let interestRate = 0;
  const aprMatch = normText.match(/yillik[^%\n]{0,50}%\s*([\d.,]+)/i) || normText.match(/alisveris[^%\n]{0,30}yillik[^%\n]{0,30}%\s*([\d.,]+)/i) || normText.match(/akdi faiz[^%\n]{0,30}%\s*([\d.,]+)/i);
  if (aprMatch) interestRate = parseTrNumber(aprMatch[1]);
  if (interestRate === 0) {
    const monthlyMatch = normText.match(/aylik[^%\n]{0,30}%\s*([\d.,]+)/i);
    if (monthlyMatch) interestRate = Math.round(parseTrNumber(monthlyMatch[1]) * 12 * 100) / 100;
  }
  const cardMatch = rawText.match(/\*{3,}\s*(\d{4})\b/) || rawText.match(/ending\s+in\s+(\d{4})/i);
  const cardNumberLast4 = cardMatch ? cardMatch[1] : "****";
  const cutoffMatch = rawText.match(/kesim tarihi[:\s]+(\d{2}[./]\d{2}[./]\d{4})/i) || rawText.match(/(\d{2}[./]\d{2}[./]\d{4})/);
  const cutoffDate = cutoffMatch ? cutoffMatch[1] : "";
  return { totalDebt, minimumPayment, interestRate, cardNumberLast4, cutoffDate };
}
function parseEnpara(rawText, normText) {
  const totalDebt = grab(normText, [
    "ekstre borcu",
    "hesap ozeti borcu",
    "toplam ekstre tutari",
    "odeme tutari",
    "kart borc tutari",
    "toplam borc",
    "guncel borc"
  ]);
  const minimumPayment = grab(normText, [
    "asgari odeme tutari",
    "minimum odeme",
    "odenmesi gereken asgari",
    "asgari odeme(?!\\s*oran)"
  ]);
  let interestRate = 0;
  const aprMatch = normText.match(/yillik[^%\n]{0,50}%\s*([\d.,]+)/i) || normText.match(/akdi[^%\n]{0,30}faiz[^%\n]{0,30}%\s*([\d.,]+)/i) || normText.match(/faiz oran[i][^%\n]{0,30}%\s*([\d.,]+)/i);
  if (aprMatch) interestRate = parseTrNumber(aprMatch[1]);
  if (interestRate === 0) {
    const monthlyMatch = normText.match(/aylik[^%\n]{0,30}%\s*([\d.,]+)/i);
    if (monthlyMatch) interestRate = Math.round(parseTrNumber(monthlyMatch[1]) * 12 * 100) / 100;
  }
  const cardMatch = rawText.match(/\*{3,}\s*(\d{4})\b/) || rawText.match(/kart no[:\s.]+\d{4}\s*\d{4}\s*\d{4}\s*(\d{4})/i);
  const cardNumberLast4 = cardMatch ? cardMatch[1] : "****";
  const cutoffMatch = rawText.match(/hesap\s+kesim\s+tarihi[:\s]+(\d{2}[./]\d{2}[./]\d{4})/i) || rawText.match(/ekstre\s+tarihi[:\s]+(\d{2}[./]\d{2}[./]\d{4})/i) || rawText.match(/(\d{2}[./]\d{2}[./]\d{4})/);
  const cutoffDate = cutoffMatch ? cutoffMatch[1] : "";
  return { totalDebt, minimumPayment, interestRate, cardNumberLast4, cutoffDate };
}
function extractTransactions(rawText) {
  const lines = rawText.split(/\r?\n/);
  const txns = [];
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (line.length < 8) continue;
    const dateMatch = line.match(/^(\d{1,2}[./]\d{1,2}[./]\d{4})\s*(.*)/);
    if (!dateMatch) continue;
    const dateStr = dateMatch[1].replace(/\//g, ".");
    let rest = dateMatch[2];
    rest = rest.replace(/KAZANILAN\s+MAXİPUAN\s*:?\s*[\d.,]+/gi, " ").replace(/VR\/FN\s*:?\s*[\d.,]+/gi, " ").replace(/FZ\s*:?\s*[\d.,]+/gi, " ").replace(/KL\s*:?\s*[\d.,]+/gi, " ").replace(/KUR\s*:?\s*[\d.,]+/gi, " ");
    const endAmountMatch = rest.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*([+-])?\s*$/);
    if (!endAmountMatch) continue;
    const rawAmountStr = endAmountMatch[1];
    const sign = endAmountMatch[2] || "-";
    const amount = parseTrNumber(rawAmountStr);
    if (amount <= 0 || amount > 1e6) continue;
    let descRaw = rest.substring(0, endAmountMatch.index).trim();
    descRaw = descRaw.replace(/\b\d{4}-\d{7}\b/g, "").replace(/\b\d{4,}\b/g, "").replace(/[,:.-]+$/g, "").replace(/\s{2,}/g, " ").trim();
    const normDesc = normalizeTR(descRaw);
    const isPayment = sign === "+" || normDesc.includes("hesaptan aktarim") || normDesc.startsWith("odeme");
    if (isPayment) {
      continue;
    }
    const category = detectCategory(descRaw);
    txns.push({
      date: dateStr,
      description: descRaw || "Banka Harcamas\u0131",
      amount: Math.round(amount * 100) / 100,
      category
    });
  }
  return txns;
}
function parseBankStatement(rawText) {
  const normText = normalizeTR(rawText.replace(/\r/g, ""));
  let bankName = "unknown";
  if (normText.includes("is bank") || normText.includes("isbank") || normText.includes("turkiye is") || normText.includes("maximum") || normText.includes("maxipuan") || normText.includes("is bankasi")) {
    bankName = "isbank";
  } else if (normText.includes("enpara") || normText.includes("qnb") || normText.includes("finansbank") || normText.includes("qnb finansbank")) {
    bankName = "enpara";
  }
  let bankFields = {};
  if (bankName === "isbank") {
    bankFields = parseIsbank(rawText, normText);
  } else if (bankName === "enpara") {
    bankFields = parseEnpara(rawText, normText);
  } else {
    bankFields = {
      totalDebt: grab(normText, ["toplam borc", "hesap ozeti borcu", "ekstre borcu", "borc tutari"]),
      minimumPayment: grab(normText, ["asgari odeme", "minimum odeme"]),
      interestRate: (() => {
        const m = normText.match(/yillik[^%\n]{0,50}%\s*([\d.,]+)/i);
        return m ? parseTrNumber(m[1]) : 0;
      })(),
      cardNumberLast4: "****",
      cutoffDate: ""
    };
  }
  const transactions = extractTransactions(rawText);
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
  for (const key of Object.keys(categoryTotals)) {
    categoryTotals[key] = Math.round(categoryTotals[key] * 100) / 100;
  }
  return {
    bankName,
    cardNumberLast4: bankFields.cardNumberLast4 || "****",
    totalDebt: Math.round((bankFields.totalDebt || 0) * 100) / 100,
    interestRate: Math.round((bankFields.interestRate || 0) * 100) / 100,
    minimumPayment: Math.round((bankFields.minimumPayment || 0) * 100) / 100,
    cutoffDate: bankFields.cutoffDate || "",
    transactions,
    categoryTotals
  };
}

// server/controllers/import.ts
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
var pdfParse = require2("pdf-parse");
async function processApprovedIds(userId, approvedIds, now) {
  if (approvedIds.length === 0) return;
  const placeholders = approvedIds.map(() => "?").join(",");
  const approvedDrafts = await db_default.prepare(`SELECT * FROM draft_transactions WHERE user_id = ? AND id IN (${placeholders}) AND status = 'approved'`).all(userId, ...approvedIds);
  for (const draft of approvedDrafts) {
    const match = draft.id.match(/^draft_(card_.*?)_([^_]+)_([^_]+)$/);
    const cardId = match ? match[1] : `unknown_${draft.id}`;
    const parts = (draft.import_source || "").split("|");
    if (parts.length >= 4) {
      const bankName = parts[0].replace("pdf_", "");
      const totalDebt = parseFloat(parts[1]);
      const interestRate = parseFloat(parts[2]);
      const minimumPayment = parseFloat(parts[3]);
      const last4 = cardId.split("_").pop();
      const existingCard = await db_default.prepare("SELECT id FROM credit_cards WHERE id = ?").get(cardId);
      if (existingCard) {
        await db_default.prepare(`UPDATE credit_cards SET total_debt = ?, interest_rate = ?, minimum_payment = ? WHERE id = ?`).run(toCents(totalDebt), toCents(interestRate), toCents(minimumPayment), cardId);
      } else {
        await db_default.prepare(`INSERT INTO credit_cards (id, user_id, bank_name, card_number_last4, total_debt, interest_rate, minimum_payment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(cardId, userId, bankName, last4, toCents(totalDebt), toCents(interestRate), toCents(minimumPayment), now);
      }
      const existingAccount = await db_default.prepare("SELECT id FROM accounts WHERE id = ?").get(cardId);
      if (!existingAccount) {
        await db_default.prepare(`INSERT INTO accounts (id, user_id, name, type, balance, currency, created_at) VALUES (?, ?, ?, 'credit_card', ?, 'TRY', ?)`).run(cardId, userId, bankName === "isbank" ? "\u0130\u015F Bankas\u0131 Kredi Kart\u0131" : "Enpara Kredi Kart\u0131", -toCents(totalDebt), now);
      } else {
        await db_default.prepare(`UPDATE accounts SET balance = ? WHERE id = ?`).run(-toCents(totalDebt), cardId);
      }
    }
    const exists = await db_default.prepare(`SELECT id FROM transactions WHERE card_id = ? AND transaction_date = ? AND description = ? AND amount = ?`).get(cardId, draft.transaction_date, draft.description, draft.amount);
    if (!exists) {
      const txId = `tx_${cardId}_${draft.transaction_date}_${Math.random().toString(36).slice(2, 8)}`;
      await db_default.prepare(`
        INSERT INTO transactions
          (id, card_id, transaction_date, description, amount, category, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(txId, cardId, draft.transaction_date, draft.description, draft.amount, draft.category, now);
      const ledgerId = `ledger_${Math.random().toString(36).slice(2, 10)}`;
      await db_default.prepare(`
        INSERT INTO ledger_transactions
          (id, user_id, account_id, transaction_date, amount, type, description, created_at)
        VALUES (?, ?, ?, ?, ?, 'expense', ?, ?)
      `).run(ledgerId, userId, cardId, draft.transaction_date, draft.amount, draft.description, now);
    }
  }
  const allTx = await db_default.prepare(
    "SELECT category, SUM(amount) as total FROM transactions WHERE card_id IN (SELECT id FROM credit_cards WHERE user_id = ?) GROUP BY category"
  ).all(userId);
  const expMap = {
    essentials: 0,
    financial: 0,
    discretionary: 0,
    subscriptions: 0,
    installments: 0
  };
  for (const row of allTx) {
    if (expMap[row.category] !== void 0) {
      expMap[row.category] = Math.round(row.total);
    }
  }
  await db_default.prepare(`
    UPDATE expenses SET
      essentials = ?,
      financial = ?,
      discretionary = ?,
      subscriptions = ?,
      installments = ?
    WHERE user_id = ?
  `).run(
    expMap.essentials,
    expMap.financial,
    expMap.discretionary,
    expMap.subscriptions,
    expMap.installments,
    userId
  );
  const allCards = await db_default.prepare("SELECT * FROM credit_cards WHERE user_id = ?").all(userId);
  const totalAllDebt = allCards.reduce((s, c) => s + (c.total_debt || 0), 0);
  const avgInterest = allCards.length ? allCards.reduce((s, c) => s + (c.interest_rate || 0), 0) / allCards.length : 0;
  const minIsbank = allCards.filter((c) => c.bank_name === "isbank").reduce((s, c) => s + (c.minimum_payment || 0), 0);
  const minEnpara = allCards.filter((c) => c.bank_name === "enpara").reduce((s, c) => s + (c.minimum_payment || 0), 0);
  const profile = await db_default.prepare("SELECT debts_list FROM financial_profiles WHERE user_id = ?").get(userId);
  const existingDebtsList = profile?.debts_list ? JSON.parse(profile.debts_list) : [];
  const archivedEntries = existingDebtsList.filter((d) => d.archived === true);
  const manualDebts = existingDebtsList.filter((d) => !d.id.startsWith("card_") && !d.archived);
  const cardDebtsList = allCards.map((c) => {
    const cardName = c.bank_name === "isbank" ? "\u0130\u015F Bankas\u0131 Kredi Kart\u0131" : "Enpara Kredi Kart\u0131";
    const existingActive = existingDebtsList.find(
      (d) => d.id === c.id && !d.archived
    );
    return {
      id: c.id,
      name: cardName,
      balance: toLira(c.total_debt),
      apr: c.interest_rate || 51,
      minimumPayment: toLira(c.minimum_payment),
      bankName: c.bank_name,
      type: "debt",
      // Preserve rollover metadata if it exists
      ...existingActive?.carriedOverAmount !== void 0 && { carriedOverAmount: existingActive.carriedOverAmount },
      ...existingActive?.statementDate !== void 0 && { statementDate: existingActive.statementDate }
    };
  });
  const updatedDebtsList = [...manualDebts, ...cardDebtsList, ...archivedEntries];
  await db_default.prepare(`
    UPDATE financial_profiles SET
      total_debt = ?,
      interest_rate = ?,
      min_payment_isbank = ?,
      min_payment_enpara = ?,
      debts_list = ?
    WHERE user_id = ?
  `).run(totalAllDebt, avgInterest, minIsbank, minEnpara, JSON.stringify(updatedDebtsList), userId);
}
var uploadStatement = async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Dosya y\xFCklenmedi." });
    return;
  }
  try {
    const pdfData = await pdfParse(req.file.buffer);
    const pdfText = pdfData.text;
    if (!pdfText || pdfText.trim().length < 20) {
      throw new Error("PDF i\xE7eri\u011Fi okunamad\u0131. Taray\u0131c\u0131dan PDF (g\xF6r\xFCnt\xFC de\u011Fil metin tabanl\u0131) y\xFCkledi\u011Finizden emin olun.");
    }
    try {
      const fs5 = await import("fs");
      fs5.writeFileSync("pdf_debug.txt", pdfText, "utf-8");
      console.log("Logged uploaded PDF text to pdf_debug.txt");
    } catch (fsErr) {
      console.error("Failed to write pdf_debug.txt:", fsErr);
    }
    const parsed = parseBankStatement(pdfText);
    const cardId = `card_${req.user?.id}_${parsed.bankName}_${parsed.cardNumberLast4}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const importSource = `pdf_${parsed.bankName}|${parsed.totalDebt}|${parsed.interestRate}|${parsed.minimumPayment}`;
    const draftIds = [];
    for (const tx of parsed.transactions) {
      const draftId = `draft_${cardId}_${tx.date}_${Math.random().toString(36).slice(2, 8)}`;
      draftIds.push(draftId);
      await db_default.prepare(`
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
    await processApprovedIds(req.user?.id, draftIds, now);
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
  } catch (err) {
    console.error("PDF Ekstre hatas\u0131:", err);
    res.status(500).json({ error: err.message || "PDF ekstresi i\u015Flenirken hata olu\u015Ftu." });
  }
};
var getDrafts = async (req, res) => {
  try {
    const drafts = await db_default.prepare("SELECT * FROM draft_transactions WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC").all(req.user?.id);
    res.json({ drafts });
  } catch (err) {
    res.status(500).json({ error: "Taslaklar al\u0131namad\u0131." });
  }
};
var finalizeDrafts = async (req, res) => {
  const { approvedIds, rejectedIds } = req.body || {};
  const userId = req.user?.id;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    if (approvedIds && Array.isArray(approvedIds) && approvedIds.length > 0) {
      const placeholders = approvedIds.map(() => "?").join(",");
      await db_default.prepare(`UPDATE draft_transactions SET status = 'approved' WHERE user_id = ? AND id IN (${placeholders}) AND status = 'pending'`).run(userId, ...approvedIds);
      await processApprovedIds(userId, approvedIds, now);
    }
    if (rejectedIds && Array.isArray(rejectedIds) && rejectedIds.length > 0) {
      const placeholders = rejectedIds.map(() => "?").join(",");
      await db_default.prepare(`UPDATE draft_transactions SET status = 'rejected' WHERE user_id = ? AND id IN (${placeholders}) AND status = 'pending'`).run(userId, ...rejectedIds);
    }
    res.json({ success: true, message: "Taslaklar ba\u015Far\u0131yla deftere i\u015Flendi." });
  } catch (err) {
    console.error("Finalize error:", err);
    res.status(500).json({ error: "Taslaklar g\xFCncellenemedi." });
  }
};

// server/controllers/profile.ts
var getProfile = async (req, res) => {
  const userId = req.user?.id;
  try {
    const pendingDrafts = await db_default.prepare("SELECT id FROM draft_transactions WHERE user_id = ? AND status = 'pending'").all(userId);
    if (pendingDrafts.length > 0) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const approvedIds = pendingDrafts.map((d) => d.id);
      const placeholders = approvedIds.map(() => "?").join(",");
      await db_default.prepare(`UPDATE draft_transactions SET status = 'approved' WHERE user_id = ? AND id IN (${placeholders}) AND status = 'pending'`).run(userId, ...approvedIds);
      await processApprovedIds(userId, approvedIds, now);
    }
    const profile = await db_default.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(userId);
    const userExpenses = await db_default.prepare("SELECT * FROM expenses WHERE user_id = ?").get(req.user?.id);
    const user = await db_default.prepare("SELECT * FROM users WHERE id = ?").get(req.user?.id);
    const rentLira = toLira(profile?.rent);
    const rentIncomeLira = profile?.rent_income ? toLira(profile.rent_income) : 0;
    let debtsList = profile?.debts_list ? JSON.parse(profile.debts_list) : [];
    let listModified = false;
    const rentDebtId = "manual_rent_expense";
    const rentDebtIdx = debtsList.findIndex((d) => d.id === rentDebtId);
    if (rentDebtIdx !== -1) {
      if (debtsList[rentDebtIdx].minimumPayment !== 0) {
        debtsList[rentDebtIdx].minimumPayment = 0;
        listModified = true;
      }
    } else if (rentLira > 0) {
      debtsList.push({
        id: rentDebtId,
        name: "Ayl\u0131k Kira \xD6demesi",
        balance: rentLira,
        apr: 0,
        minimumPayment: 0,
        type: "debt"
      });
      listModified = true;
    }
    const rentIncomeId = "manual_rent_income";
    const rentIncomeIdx = debtsList.findIndex((d) => d.id === rentIncomeId);
    if (rentIncomeIdx !== -1) {
      if (debtsList[rentIncomeIdx].minimumPayment !== 0) {
        debtsList[rentIncomeIdx].minimumPayment = 0;
        listModified = true;
      }
    } else if (rentIncomeLira > 0) {
      debtsList.push({
        id: rentIncomeId,
        name: "Ayl\u0131k Kira Geliri",
        balance: rentIncomeLira,
        apr: 0,
        minimumPayment: 0,
        type: "receivable"
      });
      listModified = true;
    }
    const originalDebts = profile?.debts_list ? JSON.parse(profile.debts_list) : [];
    if (listModified || debtsList.length !== originalDebts.length) {
      await db_default.prepare("UPDATE financial_profiles SET debts_list = ? WHERE user_id = ?").run(JSON.stringify(debtsList), userId);
    }
    res.json({
      financialData: {
        monthlyIncome: toLira(profile?.monthly_income),
        rent: rentLira,
        rentIncome: rentIncomeLira,
        readyCash: profile?.ready_cash !== void 0 && profile?.ready_cash !== null ? toLira(profile.ready_cash) : 0,
        totalDebt: toLira(profile?.total_debt),
        interestRate: toLira(profile?.interest_rate),
        minimumPaymentIsBankasi: toLira(profile?.min_payment_isbank),
        minimumPaymentEnpara: toLira(profile?.min_payment_enpara),
        debtsList
      },
      expenses: {
        essentials: toLira(userExpenses?.essentials),
        financial: toLira(userExpenses?.financial),
        discretionary: toLira(userExpenses?.discretionary),
        subscriptions: toLira(userExpenses?.subscriptions),
        installments: toLira(userExpenses?.installments)
      },
      modelProvider: user?.model_provider || "gemini",
      localEndpoint: user?.local_endpoint || "http://localhost:1234/v1",
      modelName: user?.model_name || "",
      hasApiKey: !!user?.api_key,
      hasCurrencyApiKey: !!user?.currency_api_key,
      hasDriveConfig: !!(user?.gdrive_api_key && user?.gdrive_folder_id)
    });
  } catch (err) {
    console.error("getProfile error:", err);
    res.status(500).json({ error: "Profil verileri al\u0131namad\u0131." });
  }
};
var updateProfile = async (req, res) => {
  const { financialData, expenses } = req.body;
  try {
    const oldProfile = await db_default.prepare("SELECT rent, rent_income, debts_list FROM financial_profiles WHERE user_id = ?").get(req.user?.id);
    const oldRent = oldProfile ? toLira(oldProfile.rent) : 0;
    const oldRentIncome = oldProfile?.rent_income ? toLira(oldProfile.rent_income) : 0;
    const oldDebts = oldProfile?.debts_list ? JSON.parse(oldProfile.debts_list) : [];
    let newDebts = financialData.debtsList || [];
    const newRent = financialData.rent || 0;
    const newRentIncome = financialData.rentIncome || 0;
    const rentDebtId = "manual_rent_expense";
    const existingRentDebtIndex = newDebts.findIndex((d) => d.id === rentDebtId);
    if (newRent > 0) {
      const rentDebtObj = {
        id: rentDebtId,
        name: "Ayl\u0131k Kira \xD6demesi",
        balance: existingRentDebtIndex !== -1 && newRent === oldRent ? newDebts[existingRentDebtIndex].balance : newRent,
        apr: 0,
        minimumPayment: 0,
        type: "debt"
      };
      if (existingRentDebtIndex !== -1) {
        newDebts[existingRentDebtIndex] = rentDebtObj;
      } else {
        newDebts.push(rentDebtObj);
      }
    } else {
      newDebts = newDebts.filter((d) => d.id !== rentDebtId);
    }
    const rentIncomeId = "manual_rent_income";
    const existingRentIncomeIndex = newDebts.findIndex((d) => d.id === rentIncomeId);
    if (newRentIncome > 0) {
      const rentIncomeObj = {
        id: rentIncomeId,
        name: "Ayl\u0131k Kira Geliri",
        balance: existingRentIncomeIndex !== -1 && newRentIncome === oldRentIncome ? newDebts[existingRentIncomeIndex].balance : newRentIncome,
        apr: 0,
        minimumPayment: 0,
        type: "receivable"
      };
      if (existingRentIncomeIndex !== -1) {
        newDebts[existingRentIncomeIndex] = rentIncomeObj;
      } else {
        newDebts.push(rentIncomeObj);
      }
    } else {
      newDebts = newDebts.filter((d) => d.id !== rentIncomeId);
    }
    for (const newD of newDebts) {
      const oldD = oldDebts.find((o) => o.id === newD.id);
      if (oldD && newD.balance < oldD.balance) {
        const payAmount = oldD.balance - newD.balance;
        if (payAmount > 0.01) {
          const ledgerId = `ledger_pay_${Math.random().toString(36).slice(2, 10)}`;
          const now = (/* @__PURE__ */ new Date()).toISOString();
          await db_default.prepare(`
            INSERT OR IGNORE INTO accounts (id, user_id, name, type, balance)
            VALUES (?, ?, ?, 'credit_card', ?)
          `).run(newD.id, req.user?.id, newD.name, toCents(newD.balance));
          await db_default.prepare(`
            INSERT INTO ledger_transactions (id, user_id, account_id, transaction_date, amount, type, description, created_at)
            VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)
          `).run(
            ledgerId,
            req.user?.id,
            newD.id,
            now.substring(0, 10),
            toCents(payAmount),
            `${newD.name} Bor\xE7 \xD6demesi`,
            now
          );
        }
      }
    }
    await db_default.prepare(`
      UPDATE financial_profiles SET 
        monthly_income = ?, rent = ?, rent_income = ?, total_debt = ?, interest_rate = ?, 
        min_payment_isbank = ?, min_payment_enpara = ?, debts_list = ?, ready_cash = ?
      WHERE user_id = ?
    `).run(
      toCents(financialData.monthlyIncome),
      toCents(financialData.rent),
      toCents(financialData.rentIncome),
      toCents(financialData.totalDebt),
      toCents(financialData.interestRate),
      toCents(financialData.minimumPaymentIsBankasi),
      toCents(financialData.minimumPaymentEnpara),
      JSON.stringify(newDebts),
      toCents(financialData.readyCash || 0),
      req.user?.id
    );
    await db_default.prepare(`
      UPDATE expenses SET 
        essentials = ?, financial = ?, discretionary = ?, subscriptions = ?, installments = ?
      WHERE user_id = ?
    `).run(
      toCents(expenses.essentials),
      toCents(expenses.financial),
      toCents(expenses.discretionary),
      toCents(expenses.subscriptions),
      toCents(expenses.installments),
      req.user?.id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Profil g\xFCncellenemedi." });
  }
};
var getCurrencyRates = async (req, res) => {
  const userId = req.user?.id;
  try {
    const user = userId ? await db_default.prepare("SELECT currency_api_key FROM users WHERE id = ?").get(userId) : null;
    const apiKey = user?.currency_api_key || process.env.CURRENCY_API_KEY || "fca_live_StZ6kUwnUPsDaGDr0FGiDgRRi3we9D9gH95zWGI3";
    if (apiKey) {
      try {
        const response = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&currencies=TRY,EUR,GBP`);
        if (response.ok) {
          const json = await response.json();
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
    try {
      const openRes = await fetch("https://open.er-api.com/v6/latest/USD");
      if (openRes.ok) {
        const openData = await openRes.json();
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
var saveDriveConfig = async (req, res) => {
  const { gdriveApiKey, gdriveFolderId } = req.body;
  try {
    await db_default.prepare("UPDATE users SET gdrive_api_key = ?, gdrive_folder_id = ? WHERE id = ?").run(gdriveApiKey || null, gdriveFolderId || null, req.user?.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Drive ayarlar\u0131 kaydedilemedi." });
  }
};
var backupToDrive = async (req, res) => {
  try {
    const user = await db_default.prepare("SELECT gdrive_api_key, gdrive_folder_id FROM users WHERE id = ?").get(req.user?.id);
    if (!user?.gdrive_api_key || !user?.gdrive_folder_id) {
      res.status(400).json({ error: "Google Drive API Key ve Folder ID girilmemi\u015F." });
      return;
    }
    const profile = await db_default.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(req.user?.id);
    const expenses = await db_default.prepare("SELECT * FROM expenses WHERE user_id = ?").get(req.user?.id);
    const dbUser = await db_default.prepare("SELECT username FROM users WHERE id = ?").get(req.user?.id);
    const backup = {
      version: 1,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
        installments: expenses?.installments / 100 || 0
      }
    };
    const fileName = `cfos_backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    const content = JSON.stringify(backup, null, 2);
    const contentB64 = Buffer.from(content).toString("base64");
    const boundary = "-------cfos_boundary";
    const metadata = JSON.stringify({ name: fileName, parents: [user.gdrive_folder_id] });
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      metadata,
      `--${boundary}`,
      "Content-Type: application/json",
      "Content-Transfer-Encoding: base64",
      "",
      contentB64,
      `--${boundary}--`
    ].join("\r\n");
    const driveRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user.gdrive_api_key}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body
      }
    );
    if (!driveRes.ok) {
      const errText = await driveRes.text();
      res.status(400).json({ error: `Drive y\xFCkleme hatas\u0131: ${errText}` });
      return;
    }
    const driveJson = await driveRes.ok ? await driveRes.json() : {};
    res.json({ success: true, fileId: driveJson.id, fileName });
  } catch (err) {
    res.status(500).json({ error: `Drive yedekleme hatas\u0131: ${err.message}` });
  }
};
var getTransactions = async (req, res) => {
  const userId = req.user?.id;
  const { cardId } = req.query;
  try {
    let query = "SELECT * FROM transactions WHERE card_id IN (SELECT id FROM credit_cards WHERE user_id = ?) ORDER BY transaction_date DESC";
    let params = [userId];
    if (cardId) {
      query = "SELECT id, card_id, transaction_date, description, amount, category, created_at FROM transactions WHERE card_id = ? AND card_id IN (SELECT id FROM credit_cards WHERE user_id = ?) ORDER BY transaction_date DESC";
      params = [cardId, userId];
    }
    const rawTransactions = await db_default.prepare(query).all(...params);
    const transactions = rawTransactions.map((t) => ({
      ...t,
      amount: toLira(t.amount)
    }));
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: "\u0130\u015Flemler al\u0131namad\u0131." });
  }
};
var resetProfile = async (req, res) => {
  const userId = req.user?.id;
  try {
    const runInTransaction = db_default.transaction(() => {
      db_default.prepare("DELETE FROM transactions WHERE card_id IN (SELECT id FROM credit_cards WHERE user_id = ?)").run(userId);
      db_default.prepare("DELETE FROM ledger_transactions WHERE user_id = ?").run(userId);
      db_default.prepare("DELETE FROM draft_transactions WHERE user_id = ?").run(userId);
      db_default.prepare("DELETE FROM credit_cards WHERE user_id = ?").run(userId);
      db_default.prepare("DELETE FROM accounts WHERE user_id = ?").run(userId);
      db_default.prepare("UPDATE expenses SET essentials = 0, financial = 0, discretionary = 0, subscriptions = 0, installments = 0 WHERE user_id = ?").run(userId);
      db_default.prepare("UPDATE financial_profiles SET monthly_income = 0, rent = 0, total_debt = 0, interest_rate = 0, min_payment_isbank = 0, min_payment_enpara = 0, debts_list = '[]' WHERE user_id = ?").run(userId);
    });
    await runInTransaction();
    res.json({ success: true, message: "Sistem ba\u015Far\u0131yla s\u0131f\u0131rland\u0131." });
  } catch (err) {
    console.error("Reset profile error:", err);
    res.status(500).json({ error: "Sistem s\u0131f\u0131rlan\u0131rken bir hata olu\u015Ftu." });
  }
};

// server/routes/profile.ts
var router2 = Router2();
router2.get("/", authenticateToken, getProfile);
router2.post("/", authenticateToken, updateProfile);
router2.get("/rates", authenticateToken, getCurrencyRates);
router2.get("/transactions", authenticateToken, getTransactions);
router2.post("/reset", authenticateToken, resetProfile);
router2.post("/drive-config", authenticateToken, saveDriveConfig);
router2.post("/drive-backup", authenticateToken, backupToDrive);
var profile_default = router2;

// server/routes/import.ts
import { Router as Router3 } from "express";

// server/middleware/upload.ts
import multer from "multer";
var upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Yaln\u0131zca PDF dosyalar\u0131 y\xFCklenebilir."));
    }
  }
});

// server/routes/import.ts
var router3 = Router3();
router3.post(
  "/",
  authenticateToken,
  (req, res, next) => {
    const activeDb = dbContext.getStore();
    upload.single("statement")(req, res, (err) => {
      if (err) return next(err);
      if (activeDb) {
        dbContext.run(activeDb, () => {
          next();
        });
      } else {
        next();
      }
    });
  },
  uploadStatement
);
router3.get("/drafts", authenticateToken, getDrafts);
router3.post("/finalize", authenticateToken, finalizeDrafts);
var import_default = router3;

// server/routes/chat.ts
import { Router as Router4 } from "express";

// shared/financialEngine.ts
function calculateDebtTotals(debtsList) {
  const filteredList = debtsList.filter((d) => d.type !== "receivable" && !d.archived);
  const totalDebt = filteredList.reduce((s, d) => s + d.balance, 0);
  const minimumPaymentIsBankasi = filteredList.filter((d) => d.bankName === "isbank" || d.name.includes("\u0130\u015F Bankas\u0131")).reduce((s, d) => s + d.minimumPayment, 0);
  const minimumPaymentEnpara = filteredList.filter((d) => d.bankName === "enpara" || d.name.includes("Enpara")).reduce((s, d) => s + d.minimumPayment, 0);
  return { totalDebt, minimumPaymentIsBankasi, minimumPaymentEnpara };
}
function applyPaymentToDebt(debtsList, selectedDebtId, amount) {
  return debtsList.map((d) => {
    if (d.id !== selectedDebtId && !((d.bankName || "").toLowerCase().includes(selectedDebtId.toLowerCase()) || (d.name || "").toLowerCase().includes(selectedDebtId.toLowerCase()))) {
      return d;
    }
    const newBalance = Math.max(0, d.balance - amount);
    const newMin = Math.max(0, d.minimumPayment - amount);
    return { ...d, balance: newBalance, minimumPayment: Math.min(newMin, newBalance) };
  });
}
function calculateChatPromptVariables(monthlyIncome, rent, totalDebt, interestRate, minPaymentIsBankasi, minPaymentEnpara, expenses) {
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  const debtPaymentCapacity = monthlyIncome - rent - totalExpenses;
  const monthlyInterest = totalDebt * interestRate / 100;
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

// server/controllers/chat.ts
import fs4 from "fs";
import path3 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
function safeParseFloat(val) {
  if (val === void 0 || val === null) return 0;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  const commaCount = (str.match(/,/g) || []).length;
  const dotCount = (str.match(/\./g) || []).length;
  if (commaCount === 1 && dotCount === 0) {
    return parseFloat(str.replace(",", ".")) || 0;
  }
  if (commaCount === 0 && dotCount === 1) {
    const parts = str.split(".");
    if (parts[1] && parts[1].length === 3) {
      return parseFloat(str.replace(".", "")) || 0;
    }
    return parseFloat(str) || 0;
  }
  if (commaCount > 0 && dotCount > 0) {
    const lastCommaIndex = str.lastIndexOf(",");
    const lastDotIndex = str.lastIndexOf(".");
    if (lastCommaIndex > lastDotIndex) {
      return parseFloat(str.replace(/\./g, "").replace(",", ".")) || 0;
    } else {
      return parseFloat(str.replace(/,/g, "")) || 0;
    }
  }
  if (dotCount > 1) {
    return parseFloat(str.replace(/\./g, "")) || 0;
  }
  if (commaCount > 1) {
    return parseFloat(str.replace(/,/g, "")) || 0;
  }
  return parseFloat(str) || 0;
}
var getHistory = async (req, res) => {
  try {
    const history = await db_default.prepare("SELECT role, text FROM chat_history WHERE user_id = ? ORDER BY timestamp ASC").all(req.user?.id);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: "Sohbet ge\xE7mi\u015Fi al\u0131namad\u0131." });
  }
};
var clearHistory = async (req, res) => {
  try {
    await db_default.prepare("DELETE FROM chat_history WHERE user_id = ?").run(req.user?.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Sohbet ge\xE7mi\u015Fi silinemedi." });
  }
};
var postChat = async (req, res) => {
  const { message } = req.body;
  if (!message) {
    res.status(400).json({ error: "Mesaj alan\u0131 bo\u015F olamaz." });
    return;
  }
  try {
    const user = await db_default.prepare("SELECT * FROM users WHERE id = ?").get(req.user?.id);
    if (user.model_provider === "gemini" && !user.api_key) {
      res.status(400).json({ error: "L\xFCtfen \xF6nce ayarlardan Gemini API Anahtar\u0131n\u0131z\u0131 girin." });
      return;
    }
    if (user.model_provider === "groq" && !user.api_key) {
      res.status(400).json({ error: "L\xFCtfen \xF6nce ayarlardan Groq API Anahtar\u0131n\u0131z\u0131 girin." });
      return;
    }
    if (user.model_provider === "nvidia" && !user.api_key) {
      res.status(400).json({ error: "L\xFCtfen \xF6nce ayarlardan NVIDIA API Anahtar\u0131n\u0131z\u0131 girin." });
      return;
    }
    const profile = await db_default.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(req.user?.id);
    const userExpenses = await db_default.prepare("SELECT * FROM expenses WHERE user_id = ?").get(req.user?.id);
    let rates = { usd: 47.42, eur: 54.16, gbp: 63.17 };
    try {
      const dbUser = req.user?.id ? await db_default.prepare("SELECT currency_api_key FROM users WHERE id = ?").get(req.user?.id) : null;
      const curKey = dbUser?.currency_api_key || process.env.CURRENCY_API_KEY || "fca_live_StZ6kUwnUPsDaGDr0FGiDgRRi3we9D9gH95zWGI3";
      let fetched = false;
      if (curKey) {
        try {
          const resCur = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${curKey}&currencies=TRY,EUR,GBP`);
          if (resCur.ok) {
            const jsonCur = await resCur.json();
            const rData = jsonCur.data;
            if (rData && rData.TRY) {
              rates.usd = rData.TRY;
              rates.eur = rData.EUR ? rData.TRY / rData.EUR : rates.usd * 1.08;
              rates.gbp = rData.GBP ? rData.TRY / rData.GBP : rates.usd * 1.28;
              fetched = true;
            }
          }
        } catch (e) {
        }
      }
      if (!fetched) {
        const openRes = await fetch("https://open.er-api.com/v6/latest/USD");
        if (openRes.ok) {
          const openData = await openRes.json();
          if (openData.rates && openData.rates.TRY) {
            rates.usd = openData.rates.TRY;
            rates.eur = openData.rates.EUR ? openData.rates.TRY / openData.rates.EUR : rates.usd * 1.08;
            rates.gbp = openData.rates.GBP ? openData.rates.TRY / openData.rates.GBP : rates.usd * 1.28;
          }
        }
      }
    } catch (e) {
    }
    const convertToTry = (amount, currency = "TRY") => {
      if (!currency || currency === "TRY") return amount;
      const key = currency.toLowerCase();
      const rate = rates[key] || 1;
      return amount * rate;
    };
    const debtsList = profile?.debts_list ? JSON.parse(profile.debts_list) : [];
    const convertedDebts = debtsList.map((d) => ({
      ...d,
      balance: convertToTry(d.balance, d.currency),
      minimumPayment: convertToTry(d.minimumPayment, d.currency)
    }));
    const totals = calculateDebtTotals(convertedDebts);
    const monthlyIncome = toLira(profile?.monthly_income);
    const rent = toLira(profile?.rent);
    const rentIncome = profile?.rent_income ? toLira(profile.rent_income) : 0;
    const readyCash = profile?.ready_cash !== void 0 && profile?.ready_cash !== null ? toLira(profile.ready_cash) : 0;
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
    const recentLedger = await db_default.prepare(`
      SELECT transaction_date, amount, type, description 
      FROM ledger_transactions 
      WHERE user_id = ? 
      ORDER BY transaction_date DESC 
      LIMIT 20
    `).all(req.user?.id);
    const ledgerSummary = recentLedger.map(
      (l) => `- [${l.transaction_date}] ${l.type === "expense" ? "Gider" : l.type === "payment" ? "\xD6deme" : "Gelir"}: ${l.description} | ${toLira(l.amount)} \u20BA`
    ).join("\n") || "- Hen\xFCz finansal i\u015Flem hareketi kaydedilmemi\u015F.";
    const recentDrafts = await db_default.prepare(`
      SELECT transaction_date, description, amount, category 
      FROM draft_transactions 
      WHERE user_id = ? 
      ORDER BY transaction_date DESC 
      LIMIT 25
    `).all(req.user?.id);
    const draftsSummary = recentDrafts.map(
      (d) => `- [${d.transaction_date}] ${d.description}: ${toLira(d.amount)} \u20BA (${d.category || "Genel"})`
    ).join("\n") || "- Ekstre y\xFCkleme hareketi bulunmuyor.";
    const confirmedTxns = await db_default.prepare(`
      SELECT transaction_date, description, amount, category 
      FROM transactions 
      WHERE card_id IN (SELECT id FROM credit_cards WHERE user_id = ?) 
      ORDER BY transaction_date DESC 
      LIMIT 25
    `).all(req.user?.id);
    const confirmedTxnsSummary = confirmedTxns.map(
      (t) => `- [${t.transaction_date}] ${t.description}: ${toLira(t.amount)} \u20BA (${t.category || "Genel"})`
    ).join("\n") || "";
    const allStatementTxns = [draftsSummary, confirmedTxnsSummary].filter(Boolean).join("\n") || "- Ekstre harcama hareketi bulunmuyor.";
    const actualDebtsOnly = debtsList.filter((d) => d.type !== "receivable");
    const receivablesOnly = debtsList.filter((d) => d.type === "receivable");
    const debtsSummary = actualDebtsOnly.map(
      (d) => `- ${d.name}: ${d.balance} ${d.currency} (Asgari: ${d.minimumPayment} ${d.currency}, Faiz: %${d.apr})`
    ).join("\n") || "- Aktif bor\xE7 kayd\u0131 bulunmamaktad\u0131r.";
    const receivablesSummary = receivablesOnly.map(
      (r) => `- ${r.name}: ${r.balance} ${r.currency}`
    ).join("\n") || "- Kay\u0131tl\u0131 alacak bulunmamaktad\u0131r.";
    const __filename4 = fileURLToPath3(import.meta.url);
    const __dirname4 = path3.dirname(__filename4);
    const cfoAgentKnowledgeDir = path3.resolve(__dirname4, "..", "knowledge", "cfo-agent");
    let knowledgeBaseText = "";
    try {
      const masterProtocol = fs4.readFileSync(path3.join(cfoAgentKnowledgeDir, "cfo-ai-agent-master-protocol-v3.md"), "utf-8");
      const guardrails = fs4.readFileSync(path3.join(cfoAgentKnowledgeDir, "cfo-ai-agent-rag-guardrails.md"), "utf-8");
      const errorHandling = fs4.readFileSync(path3.join(cfoAgentKnowledgeDir, "cfo-ai-agent-error-handling.md"), "utf-8");
      const fewShotTemplates = fs4.readFileSync(path3.join(cfoAgentKnowledgeDir, "cfo-ai-agent-few-shot-templates.md"), "utf-8");
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
    } catch (err) {
      console.error("Error reading CFO knowledge files:", err.message);
    }
    const systemInstructionText = `Sen kullan\u0131c\u0131n\u0131n ki\u015Fisel yapay zeka finans dan\u0131\u015Fman\u0131s\u0131n (Ki\u015Fisel CFO). Kullan\u0131c\u0131n\u0131n t\xFCm gelir, gider, haz\u0131r nakit (kasa), bor\xE7, alacak ve ekstre bilgilerine %100 TAM HAK\u0130MS\u0130N.

KR\u0130T\u0130K \u0130LET\u0130\u015E\u0130M VE PERSONA KURALLARI (ZORUNLU):
1. **DO\u011ERUDAN \u0130LET\u0130\u015E\u0130M D\u0130L\u0130**: Kullan\u0131c\u0131ya her zaman do\u011Frudan "sen / siz" diliyle hitap et (\xD6rn: "73.000 TL \xF6demenizi ald\u0131m ve sisteme i\u015Fliyorum"). KES\u0130NL\u0130KLE 3. \u015Fah\u0131s dili KULLANMA ("Kullan\u0131c\u0131n\u0131n \xF6deme talebini al\u0131yorum", "Kullan\u0131c\u0131ya sunulur" gibi ifadeler TAMAMEN YASAKTIR)!
2. **AKS\u0130YON BLO\u011EU OLU\u015ETURMA ZORUNLULU\u011EU**: Kullan\u0131c\u0131 \xF6deme yapt\u0131\u011F\u0131n\u0131 veya bor\xE7 ekleyece\u011Fini s\xF6yledi\u011Finde (\xD6rn: "73000 TL \xF6deme yapt\u0131m"), yan\u0131t\u0131n\u0131n en sonuna KES\u0130NL\u0130KLE \u015Fu formatta bir JSON blo\u011Fu ekle:
[ACTION_START]
{
  "type": "MAKE_PAYMENT",
  "payload": {
    "cardNameOrBank": "isbank",
    "amount": 73000
  }
}
[ACTION_END]
Sadece metin yaz\u0131p aksiyon blo\u011Funu koymazsan \xF6deme veritaban\u0131na YAZILMAZ ve YALAN S\xD6YLEM\u0130\u015E olursun!
3. **KISA, \xD6Z VE TEKRARSIZ YANIT**: Yan\u0131tlar\u0131n\u0131 sade tut. Asla 8-10 tane alt \xFCste "Kredi Kart\u0131 Bor\xE7 Plan\u0131 Raporu" gibi ayn\u0131 \u015Feyleri tekrarlayan robotik ba\u015Fl\u0131k dizileri KULLANMA! Tek ve net bir \xF6zet sun.
4. **GEL\u0130R = 0 \u0130SE DTI KONTROL\xDC**: E\u011Fer kullan\u0131c\u0131n\u0131n geliri 0 \u20BA ise DTI (Bor\xE7/Gelir) oran\u0131n\u0131 eksi (-100%) veya mant\u0131ks\u0131z hesaplama. "Ayl\u0131k geliriniz hen\xFCz sisteme girilmedi\u011Fi i\xE7in DTI oran\u0131 hesaplanam\u0131yor. L\xFCtfen \xF6nce gelirinizi belirtin" uyar\u0131s\u0131 ver.

${knowledgeBaseText}

Kullan\u0131c\u0131n\u0131n Anl\u0131k Canl\u0131 Finansal Bilgileri:
- Canl\u0131 D\xF6viz Kurlar\u0131: 1 USD = ${rates.usd.toFixed(2)} \u20BA | 1 EUR = ${rates.eur.toFixed(2)} \u20BA | 1 GBP = ${rates.gbp.toFixed(2)} \u20BA
- Elimdeki Haz\u0131r Nakit (Kasa): ${readyCash.toLocaleString("tr-TR")} \u20BA
- Ayl\u0131k Maa\u015F/Ana Gelir: ${monthlyIncome.toLocaleString("tr-TR")} \u20BA
- Ayl\u0131k Ekstra Gelir (Kira Geliri vb.): ${rentIncome.toLocaleString("tr-TR")} \u20BA
- Toplam Gelir: ${(monthlyIncome + rentIncome).toLocaleString("tr-TR")} \u20BA
- Ayl\u0131k Kira/Konut Gideri: ${rent.toLocaleString("tr-TR")} \u20BA
- Di\u011Fer Ayl\u0131k Giderler Toplam\u0131: ${totalExpenses.toLocaleString("tr-TR")} \u20BA (Temel: ${essentials} \u20BA, Finansal: ${financial} \u20BA, Serbest Harcama: ${discretionary} \u20BA, Abonelikler: ${subscriptions} \u20BA, Taksitler: ${installments} \u20BA)
- Ayl\u0131k Bor\xE7 \xD6deme Kapasitesi (Net Nakit Ak\u0131\u015F\u0131): ${debtPaymentCapacity.toLocaleString("tr-TR")} \u20BA
- Toplam Bor\xE7 (TL cinsinden): ${totalDebt.toLocaleString("tr-TR")} \u20BA
- Ortalama Bor\xE7 Faiz Oran\u0131 (Y\u0131ll\u0131k): %${interestRate * 100}
- Ayl\u0131k Biriken Tahmini Faiz Y\xFCk\xFC: ${monthlyInterest.toLocaleString("tr-TR")} \u20BA
- Toplam Bor\xE7 Asgari \xD6demeleri: ${totalMinimumPayments.toLocaleString("tr-TR")} \u20BA (\u0130\u015F Bankas\u0131: ${minPaymentIsBankasi} \u20BA, Enpara: ${minPaymentEnpara} \u20BA)
- Mevcut Bor\xE7 Yap\u0131land\u0131rmas\u0131na G\xF6re Ayl\u0131k Toplam Yap\u0131lan \xD6deme: ${totalPayment.toLocaleString("tr-TR")} \u20BA
- Tahmini Bor\xE7 Kapanma S\xFCresi: ${monthsToPayOff === Infinity ? "Hesaplanam\u0131yor (\xD6deme kapasitesi yetersiz)" : `${monthsToPayOff} ay`}

Mevcut Bor\xE7lar\u0131n ve Kredi Kartlar\u0131n\u0131n Detayl\u0131 Listesi:
${debtsSummary}

Gelecek Alacaklar (Nakit Giri\u015Fleri):
${receivablesSummary}

Ekstrelerden Ve Kredi Kartlar\u0131ndan Kay\u0131tl\u0131 T\xFCm Harcamalar:
${allStatementTxns}

Kullan\u0131c\u0131n\u0131n Son Kasa/Banka Muhasebe Hareketleri (Ledger):
${ledgerSummary}

Kurallar ve Parametreler (Referans \u0130lkeler):
- Tasarruf Oran\u0131 Hedefi: >= %20 Sa\u011Fl\u0131kl\u0131.
- Kart Limit Kullan\u0131m\u0131: <= %30 Sa\u011Fl\u0131kl\u0131, >= %80 Kritik (kredi notu hasar\u0131).
- DTI (Bor\xE7 Servisi / Gelir): <= %36 Sa\u011Fl\u0131kl\u0131, > %50 Kritik.
- Likidite: Kasa en az 3 ay (riskli), hedef 6 ay (g\xFCvenli) zorunlu \xE7\u0131k\u0131\u015F\u0131 kapsamal\u0131d\u0131r.
- Baby Step 1: 1 ayl\u0131k nakit rezerv tamponu biriktirilir.
- \xD6demeleri De\u011Ferlendirme: E\u011Fer yukar\u0131daki son \xF6demeler listesinde kullan\u0131c\u0131n\u0131n kartlar i\xE7in asgariden fazla \xF6deme yapt\u0131\u011F\u0131 g\xF6r\xFCn\xFCyorsa, bunu takdir et ve kalan bor\xE7 \xFCzerinden plan yap.
- Veri G\xFCncelleme Yetkisi (Kritik Yetki): E\u011Fer kullan\u0131c\u0131 senden herhangi bir veriyi g\xFCncellemeni, bor\xE7 eklemeni, \xF6deme kaydetmeni veya gelir/kira/harcama tutarlar\u0131n\u0131 de\u011Fi\u015Ftirmesini istiyorsa, bu i\u015Flemi ger\xE7ekle\u015Ftirmek i\xE7in yan\u0131t\u0131n\u0131n en sonuna MUTLAKA a\u015Fa\u011F\u0131daki formatta bir JSON aksiyon blo\u011Fu eklemelisin. Format d\u0131\u015F\u0131ndaki metinlerin aras\u0131nda kesinlikle yer almal\u0131d\u0131r:
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

Veyahut bor\xE7/kredi kart\u0131 veya herhangi bir bor\xE7 (USD, EUR, GBP dahil) ekleme talebi i\xE7in (e\u011Fer bor\xE7 yabanc\u0131 para birimindeyse "currency" alan\u0131na "USD", "EUR", "GBP" vb. yaz\u0131lmal\u0131d\u0131r, varsay\u0131lan "TRY" dir; kullan\u0131c\u0131 \xF6zellikle belirtmedik\xE7e y\u0131ll\u0131k faiz oran\u0131 "apr" varsay\u0131lan olarak 0 girilmelidir):
[ACTION_START]
{
  "type": "ADD_DEBT",
  "payload": {
    "name": "Nuratc Bor\xE7",
    "balance": 1000,
    "apr": 0,
    "minimumPayment": 50,
    "currency": "USD",
    "bankName": "other"
  }
}
[ACTION_END]

Veyahut kart \xF6demesi yapma talebi i\xE7in:
[ACTION_START]
{
  "type": "MAKE_PAYMENT",
  "payload": {
    "cardNameOrBank": "isbank",
    "amount": 73000
  }
}
[ACTION_END]

Kullan\u0131c\u0131 sadece sohbet ediyorsa veya bilgi soruyorsa asla bu aksiyon blo\u011Funu ekleme. Yaln\u0131zca veri ekleme/g\xFCncelleme taleplerinde bu aksiyon blo\u011Funu ekle.
- Hal\xFCsinasyon veya uydurma veri kullanma. Verilmeyen bilgileri tahmin etme.`;
    await db_default.prepare("INSERT INTO chat_history (user_id, role, text) VALUES (?, ?, ?)").run(req.user?.id, "user", message);
    const historyRows = await db_default.prepare("SELECT role, text FROM chat_history WHERE user_id = ? ORDER BY timestamp ASC").all(req.user?.id);
    let botText = "";
    if (user.model_provider === "local") {
      const localMessages = historyRows.map((r) => ({
        role: r.role === "model" ? "assistant" : "user",
        content: r.text
      }));
      localMessages.unshift({ role: "system", content: systemInstructionText });
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
        throw new Error("Yerel Sunucu (LM Studio) hatas\u0131. Sunucunun \xE7al\u0131\u015Ft\u0131\u011F\u0131ndan ve HTTP Server ayar\u0131n\u0131n a\xE7\u0131k oldu\u011Fundan emin olun.");
      }
      const responseData = await response.json();
      botText = responseData.choices?.[0]?.message?.content || "Yerel modelden yan\u0131t al\u0131namad\u0131.";
    } else if (user.model_provider === "groq") {
      const groqMessages = historyRows.map((r) => ({
        role: r.role === "model" ? "assistant" : "user",
        content: r.text
      }));
      groqMessages.unshift({ role: "system", content: systemInstructionText });
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
        throw new Error("Groq API hatas\u0131. API anahtar\u0131n\u0131 veya kotan\u0131z\u0131 kontrol edin.");
      }
      const responseData = await response.json();
      botText = responseData.choices?.[0]?.message?.content || "Groq modelinden yan\u0131t al\u0131namad\u0131.";
    } else if (user.model_provider === "nvidia") {
      const nvidiaMessages = historyRows.map((r) => ({
        role: r.role === "model" ? "assistant" : "user",
        content: r.text
      }));
      nvidiaMessages.unshift({ role: "system", content: systemInstructionText });
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
        throw new Error(`NVIDIA API hatas\u0131 (${response.status}): ${errText}`);
      }
      const responseData = await response.json();
      botText = responseData.choices?.[0]?.message?.content || "NVIDIA modelinden yan\u0131t al\u0131namad\u0131.";
    } else {
      const contents = historyRows.map((r) => ({
        role: r.role === "model" ? "model" : "user",
        parts: [{ text: r.text }]
      }));
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
        throw new Error("Gemini API hatas\u0131. API anahtar\u0131n\u0131 veya kotan\u0131z\u0131 kontrol edin.");
      }
      const responseData = await response.json();
      botText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || "\xDCzg\xFCn\xFCm, \u015Fu an yan\u0131t olu\u015Fturam\u0131yorum.";
    }
    if (!botText.includes("[ACTION_START]")) {
      const payMatch = message.match(/(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:tl|₺)?\s*.*?(?:ödeme|ödedim|yatırdım)/i) || message.match(/(?:ödeme|ödedim|yatırdım)\s*.*?:?\s*(\d{1,3}(?:\.\d{3})*|\d+)/i);
      if (payMatch) {
        const rawAmt = payMatch[1].replace(/\./g, "");
        const amt = parseFloat(rawAmt);
        if (!isNaN(amt) && amt > 0) {
          const bankName = message.toLowerCase().includes("enpara") ? "enpara" : "isbank";
          const fallbackAction = {
            type: "MAKE_PAYMENT",
            payload: {
              cardNameOrBank: bankName,
              amount: amt
            }
          };
          botText += `

[ACTION_START]
${JSON.stringify(fallbackAction, null, 2)}
[ACTION_END]`;
        }
      }
    }
    let refreshUI = false;
    const actionMatch = botText.match(/\[ACTION_START\]\s*(\{[\s\S]+?\})\s*\[ACTION_END\]/);
    if (actionMatch) {
      try {
        const action = JSON.parse(actionMatch[1]);
        const userId = req.user?.id;
        if (action.type === "UPDATE_PROFILE") {
          const payload = action.payload;
          const currentProfile = await db_default.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(userId);
          const currentExpenses = await db_default.prepare("SELECT * FROM expenses WHERE user_id = ?").get(userId);
          const incomeVal = payload.monthlyIncome !== void 0 ? toCents(payload.monthlyIncome) : currentProfile.monthly_income;
          const rentVal = payload.rent !== void 0 ? toCents(payload.rent) : currentProfile.rent;
          await db_default.prepare(`
            UPDATE financial_profiles SET monthly_income = ?, rent = ? WHERE user_id = ?
          `).run(incomeVal, rentVal, userId);
          if (payload.expenses) {
            const essentialsVal = payload.expenses.essentials !== void 0 ? toCents(payload.expenses.essentials) : currentExpenses.essentials;
            const financialVal = payload.expenses.financial !== void 0 ? toCents(payload.expenses.financial) : currentExpenses.financial;
            const discretionaryVal = payload.expenses.discretionary !== void 0 ? toCents(payload.expenses.discretionary) : currentExpenses.discretionary;
            const subscriptionsVal = payload.expenses.subscriptions !== void 0 ? toCents(payload.expenses.subscriptions) : currentExpenses.subscriptions;
            const installmentsVal = payload.expenses.installments !== void 0 ? toCents(payload.expenses.installments) : currentExpenses.installments;
            await db_default.prepare(`
              UPDATE expenses SET essentials = ?, financial = ?, discretionary = ?, subscriptions = ?, installments = ? WHERE user_id = ?
            `).run(essentialsVal, financialVal, discretionaryVal, subscriptionsVal, installmentsVal, userId);
          }
          refreshUI = true;
        }
        if (action.type === "ADD_DEBT") {
          const payload = action.payload;
          const currentProfile = await db_default.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(userId);
          const debtsList2 = currentProfile?.debts_list ? JSON.parse(currentProfile.debts_list) : [];
          const newDebt = {
            id: "d-" + Date.now(),
            name: payload.name || "Yeni Kart",
            balance: safeParseFloat(payload.balance),
            apr: payload.apr !== void 0 ? safeParseFloat(payload.apr) : 0,
            minimumPayment: safeParseFloat(payload.minimumPayment),
            currency: payload.currency || "TRY",
            bankName: payload.bankName || "other"
          };
          debtsList2.push(newDebt);
          const convertedList = debtsList2.map((d) => ({
            ...d,
            balance: convertToTry(d.balance, d.currency),
            minimumPayment: convertToTry(d.minimumPayment, d.currency)
          }));
          const totals2 = calculateDebtTotals(convertedList);
          await db_default.prepare(`
            UPDATE financial_profiles SET 
              total_debt = ?,
              min_payment_isbank = ?,
              min_payment_enpara = ?,
              debts_list = ?
            WHERE user_id = ?
          `).run(
            toCents(totals2.totalDebt),
            toCents(totals2.minimumPaymentIsBankasi),
            toCents(totals2.minimumPaymentEnpara),
            JSON.stringify(debtsList2),
            userId
          );
          const cardId = `card_${userId}_${newDebt.bankName}_${Math.floor(1e3 + Math.random() * 9e3)}`;
          await db_default.prepare(`
            INSERT OR IGNORE INTO credit_cards (id, user_id, bank_name, card_number_last4, total_debt, interest_rate, minimum_payment, currency, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            cardId,
            userId,
            newDebt.bankName,
            "0000",
            toCents(newDebt.balance),
            newDebt.apr,
            toCents(newDebt.minimumPayment),
            newDebt.currency,
            (/* @__PURE__ */ new Date()).toISOString()
          );
          refreshUI = true;
        }
        if (action.type === "MAKE_PAYMENT") {
          const payload = action.payload;
          const currentProfile = await db_default.prepare("SELECT * FROM financial_profiles WHERE user_id = ?").get(userId);
          const debtsList2 = currentProfile?.debts_list ? JSON.parse(currentProfile.debts_list) : [];
          const searchStr = (payload.cardNameOrBank || "").toLowerCase();
          const debt = debtsList2.find(
            (d) => (d.name || "").toLowerCase().includes(searchStr) || (d.bankName || "").toLowerCase().includes(searchStr)
          );
          if (debt) {
            const payAmount = safeParseFloat(payload.amount);
            if (payAmount > 0) {
              const updatedList = applyPaymentToDebt(debtsList2, debt.id, payAmount);
              const totals2 = calculateDebtTotals(updatedList);
              await db_default.prepare(`
                UPDATE financial_profiles SET 
                  total_debt = ?,
                  min_payment_isbank = ?,
                  min_payment_enpara = ?,
                  debts_list = ?
                WHERE user_id = ?
              `).run(
                toCents(totals2.totalDebt),
                toCents(totals2.minimumPaymentIsBankasi),
                toCents(totals2.minimumPaymentEnpara),
                JSON.stringify(updatedList),
                userId
              );
              const ledgerId = `ledger_pay_${Math.random().toString(36).slice(2, 10)}`;
              const now = (/* @__PURE__ */ new Date()).toISOString();
              await db_default.prepare(`
                INSERT OR IGNORE INTO accounts (id, user_id, name, type, balance)
                VALUES (?, ?, ?, 'credit_card', ?)
              `).run(debt.id, userId, debt.name, toCents(debt.balance - payAmount));
              await db_default.prepare(`
                INSERT INTO ledger_transactions (id, user_id, account_id, transaction_date, amount, type, description, created_at)
                VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)
              `).run(
                ledgerId,
                userId,
                debt.id,
                now.substring(0, 10),
                toCents(payAmount),
                `${debt.name} Bor\xE7 \xD6demesi`,
                now
              );
            }
          }
          refreshUI = true;
        }
        botText = botText.replace(/\[ACTION_START\][\s\S]+?\[ACTION_END\]/, "").trim();
      } catch (jsonErr) {
        console.error("Action JSON parsing error:", jsonErr);
      }
    }
    await db_default.prepare("INSERT INTO chat_history (user_id, role, text) VALUES (?, ?, ?)").run(req.user?.id, "model", botText);
    res.json({ text: botText, refreshUI });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Yapay zeka ile ileti\u015Fim kurulamad\u0131." });
  }
};

// server/routes/chat.ts
var router4 = Router4();
router4.get("/history", authenticateToken, getHistory);
router4.delete("/history", authenticateToken, clearHistory);
router4.post("/", authenticateToken, postChat);
var chat_default = router4;

// server/app.ts
var app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json());
app.use(gdriveSyncMiddleware);
app.use("/api/auth", auth_default);
app.use("/api/profile", profile_default);
app.use("/api/upload", import_default);
app.use("/api/chat", chat_default);
var app_default = app;

// server/index.ts
import { createServer } from "http";
import path4 from "path";
import { fileURLToPath as fileURLToPath4 } from "url";
import express2 from "express";
var __filename3 = fileURLToPath4(import.meta.url);
var __dirname3 = path4.dirname(__filename3);
var server = createServer(app_default);
var staticPath = process.env.NODE_ENV === "production" ? path4.resolve(__dirname3, "public") : path4.resolve(__dirname3, "..", "dist", "public");
app_default.use(express2.static(staticPath));
app_default.get("*", (_req, res) => {
  res.sendFile(path4.join(staticPath, "index.html"));
});
var defaultPort = parseInt(process.env.PORT || "5000", 10);
function startServer(p) {
  server.listen(p, () => {
    console.log(`CfOS Server running on http://localhost:${p}/`);
  }).on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${p} is in use, trying port ${p + 1}...`);
      startServer(p + 1);
    } else {
      console.error("Server error:", err);
    }
  });
}
startServer(defaultPort);
