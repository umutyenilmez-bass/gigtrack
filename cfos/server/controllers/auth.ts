import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db, { initDbFile } from "../db.js";
import { AuthRequest } from "../types/index.js";
import { 
  findOrCreateFolder, 
  findDbFile, 
  downloadDbFile, 
  uploadNewDbFile, 
  updateDbFile 
} from "../services/gdrive.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'cfos-dev-secret-change-in-production';

export const register = async (req: Request, res: Response) => {
  const { username, password, gdriveApiKey, gdriveFolderId } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Kullanıcı adı ve şifre gereklidir." });
    return;
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare("INSERT INTO users (username, password_hash, gdrive_api_key, gdrive_folder_id) VALUES (?, ?, ?, ?)");
    const result = await stmt.run(username, passwordHash, gdriveApiKey || null, gdriveFolderId || null);
    const userId = result.lastInsertRowid;

    // Initialize empty financial profiles & expenses
    await db.prepare("INSERT INTO financial_profiles (user_id) VALUES (?)").run(userId);
    await db.prepare("INSERT INTO expenses (user_id) VALUES (?)").run(userId);

    const token = jwt.sign(
      { id: userId, username, gdriveApiKey: gdriveApiKey || '', gdriveFolderId: gdriveFolderId || '' },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.json({ token, username });
  } catch (err: any) {
    if (err.message && err.message.includes("UNIQUE")) {
      res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış." });
      return;
    }
    res.status(500).json({ error: "Kayıt sırasında bir hata oluştu." });
  }
};

export const login = async (req: Request, res: Response) => {
  const { username, password, gdriveApiKey, gdriveFolderId } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Kullanıcı adı ve şifre gereklidir." });
    return;
  }

  try {
    const user = await db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(400).json({ error: "Hatalı kullanıcı adı veya şifre." });
      return;
    }

    // Google Drive bilgileri giriş sırasında güncellenebilir
    if (gdriveApiKey || gdriveFolderId) {
      await db.prepare("UPDATE users SET gdrive_api_key = ?, gdrive_folder_id = ? WHERE id = ?")
        .run(gdriveApiKey || user.gdrive_api_key, gdriveFolderId || user.gdrive_folder_id, user.id);
    }

    const finalApiKey = gdriveApiKey || user.gdrive_api_key || '';
    const finalFolderId = gdriveFolderId || user.gdrive_folder_id || '';

    const token = jwt.sign(
      { id: user.id, username: user.username, gdriveApiKey: finalApiKey, gdriveFolderId: finalFolderId },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.json({ token, username: user.username, hasApiKey: !!user.api_key });
  } catch (err) {
    res.status(500).json({ error: "Giriş sırasında bir hata oluştu." });
  }
};

export const saveKey = async (req: AuthRequest, res: Response) => {
  const { modelProvider, localEndpoint, modelName, apiKey, currencyApiKey } = req.body;
  const userId = req.user?.id;
  try {
    const existingUser = await db.prepare("SELECT api_key, currency_api_key FROM users WHERE id = ?").get(userId) as any;
    let finalApiKey = apiKey !== undefined && apiKey !== '' ? apiKey : (existingUser?.api_key || '');
    let finalCurrencyApiKey = currencyApiKey !== undefined && currencyApiKey !== '' ? currencyApiKey : (existingUser?.currency_api_key || '');

    // Temizleme: Baştaki/sondaki boşlukları ve gizli unicode karakterleri temizle
    finalApiKey = finalApiKey.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
    finalCurrencyApiKey = finalCurrencyApiKey.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');

    if (finalApiKey && /[^\x00-\x7F]/.test(finalApiKey)) {
      res.status(400).json({ error: "Yapay zeka API anahtarı geçersiz karakterler içeriyor." });
      return;
    }

    if (finalCurrencyApiKey && /[^\x00-\x7F]/.test(finalCurrencyApiKey)) {
      res.status(400).json({ error: "Döviz API anahtarı geçersiz karakterler içeriyor." });
      return;
    }

    await db.prepare(`
      UPDATE users SET 
        model_provider = ?, local_endpoint = ?, model_name = ?, api_key = ?, currency_api_key = ? 
      WHERE id = ?
    `).run(
      modelProvider || 'gemini', 
      localEndpoint || 'http://localhost:1234/v1', 
      modelName || '', 
      finalApiKey, 
      finalCurrencyApiKey, 
      userId
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Model ayarları kaydedilemedi." });
  }
};

// ── Google OAuth Redirect ─────────────────────────────────────
export const googleLogin = (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: clientId || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent'
  }).toString();
  
  res.redirect(googleAuthUrl);
};

// ── Google OAuth Callback ─────────────────────────────────────
export const googleCallback = async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) {
    res.status(400).send("Yetkilendirme kodu bulunamadı.");
    return;
  }
  
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  
  try {
    // Exchange auth code for access & refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    
    if (!tokenResponse.ok) {
      const errTxt = await tokenResponse.text();
      throw new Error(`Google token değişimi başarısız oldu: ${errTxt}`);
    }
    
    const tokenData = await tokenResponse.json() as any;
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    
    // Fetch Google user profile
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const userData = await userResponse.json() as any;
    const email = userData.email;
    const name = userData.name || email.split('@')[0];
    
    // Automatically find or create Google Drive folder named "CfOS_Data"
    const folderId = await findOrCreateFolder(accessToken, 'CfOS_Data');
    
    // Load, create or sync DB file
    const safeFolderId = folderId.replace(/[^a-zA-Z0-9-_]/g, '');
    const dbFilePath = path.join('/tmp', `cfos_db_${safeFolderId}.sqlite`);
    
    const fileId = await findDbFile(accessToken, folderId);
    let driveFileId = fileId;
    if (fileId) {
      await downloadDbFile(accessToken, fileId, dbFilePath);
    } else {
      if (fs.existsSync(dbFilePath)) {
        fs.unlinkSync(dbFilePath);
      }
      const tempDb = new Database(dbFilePath);
      initDbFile(tempDb);
      tempDb.close();
      
      driveFileId = await uploadNewDbFile(accessToken, folderId, dbFilePath);
    }
    
    // Connect to database to retrieve/insert Google user record
    const dbInstance = new Database(dbFilePath);
    let user: any;
    let userId: number;
    
    try {
      user = dbInstance.prepare("SELECT * FROM users WHERE username = ?").get(email);
      if (!user) {
        // Register Google user in their Drive SQLite
        const stmt = dbInstance.prepare("INSERT INTO users (username, password_hash, gdrive_folder_id) VALUES (?, ?, ?)");
        const result = stmt.run(email, 'google-oauth-dummy-password', folderId);
        userId = result.lastInsertRowid as number;
        
        dbInstance.prepare("INSERT INTO financial_profiles (user_id) VALUES (?)").run(userId);
        dbInstance.prepare("INSERT INTO expenses (user_id) VALUES (?)").run(userId);
      } else {
        userId = user.id;
        dbInstance.prepare("UPDATE users SET gdrive_folder_id = ? WHERE id = ?").run(folderId, userId);
      }
    } finally {
      dbInstance.close();
      // Sync changes back to Drive
      await updateDbFile(accessToken, driveFileId!, dbFilePath);
      try {
        fs.unlinkSync(dbFilePath);
      } catch (e) {}
    }
    
    // Generate JWT token containing the Refresh Token
    const token = jwt.sign(
      { 
        id: userId, 
        username: email, 
        googleRefreshToken: refreshToken || '', 
        gdriveFolderId: folderId 
      }, 
      JWT_SECRET, 
      { expiresIn: "30d" }
    );
    
    // Redirect to frontend auth screen with parameters
    res.redirect(`/auth?token=${token}&username=${encodeURIComponent(name)}`);
    
  } catch (err: any) {
    console.error("Google login error:", err);
    res.status(500).send(`Google ile Giriş Hatası: ${err.message}`);
  }
};
