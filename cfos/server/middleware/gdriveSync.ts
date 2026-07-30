import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AuthRequest } from '../types/index.js';
import { dbContext, initDbFile } from '../db.js';
import { getAccessToken, findDbFile, downloadDbFile, uploadNewDbFile, updateDbFile } from '../services/gdrive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'cfos-dev-secret-change-in-production';
const LOCAL_DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'finans_db.sqlite')
  : path.resolve(__dirname, '..', 'finans_db.sqlite');

export const gdriveSyncMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // 1. Gelen isteğin path kontrolünü yap (yalnızca API rotalarını işle)
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // 2. Google Drive ayarlarını kontrol et (header, body veya JWT token'dan oku)
  let gdriveApiKey = (req.headers['x-gdrive-api-key'] || req.body?.gdriveApiKey) as string;
  let gdriveFolderId = (req.headers['x-gdrive-folder-id'] || req.body?.gdriveFolderId) as string;
  let googleRefreshToken = '';

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded.gdriveApiKey) gdriveApiKey = decoded.gdriveApiKey;
      if (decoded.gdriveFolderId) gdriveFolderId = decoded.gdriveFolderId;
      if (decoded.googleRefreshToken) googleRefreshToken = decoded.googleRefreshToken;
      req.user = decoded; // Auth middleware'inden önce biz de set edelim
    } catch (e) {
      // Geçersiz token hatasını burada yutuyoruz, auth middleware'i kendisi handle edecek
    }
  }

  const isDriveMode = !!((gdriveApiKey || googleRefreshToken) && gdriveFolderId);
  let dbInstance: any;
  let dbFilePath = LOCAL_DB_PATH;
  let driveAccessToken = '';
  let driveFileId = '';

  try {
    if (isDriveMode) {
      // Google Drive Modu
      if (googleRefreshToken) {
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            refresh_token: googleRefreshToken,
            grant_type: 'refresh_token'
          })
        });
        if (!refreshResponse.ok) {
          const errTxt = await refreshResponse.text();
          throw new Error(`Google Refresh Token yenileme hatası: ${errTxt}`);
        }
        const refreshData = await refreshResponse.json() as any;
        driveAccessToken = refreshData.access_token;
      } else {
        driveAccessToken = await getAccessToken(gdriveApiKey);
      }

      const safeFolderId = gdriveFolderId.replace(/[^a-zA-Z0-9-_]/g, '');
      dbFilePath = path.join('/tmp', `cfos_db_${safeFolderId}.sqlite`);

      // Drive'da cfos_db.sqlite dosyasını ara
      const fileId = await findDbFile(driveAccessToken, gdriveFolderId);
      if (fileId) {
        driveFileId = fileId;
        // Dosyayı yerele indir (/tmp altına)
        await downloadDbFile(driveAccessToken, fileId, dbFilePath);
      } else {
        // Dosya bulunamadı, sıfırdan oluşturup Drive'a ilk yüklemeyi yapacağız
        if (fs.existsSync(dbFilePath)) {
          fs.unlinkSync(dbFilePath);
        }
        const tempDb = new Database(dbFilePath);
        initDbFile(tempDb);
        tempDb.close();
        
        // Drive'a yükle
        driveFileId = await uploadNewDbFile(driveAccessToken, gdriveFolderId, dbFilePath);
      }
    } else {
      // Lokal SQLite Modu (Drive Ayarlanmamışsa)
      dbFilePath = LOCAL_DB_PATH;
      // Lokal dosya yoksa tabloları oluştur
      const fileExists = fs.existsSync(dbFilePath);
      if (!fileExists) {
        const tempDb = new Database(dbFilePath);
        initDbFile(tempDb);
        tempDb.close();
      }
    }

    // SQLite bağlantısını aç
    dbInstance = new Database(dbFilePath);
    initDbFile(dbInstance);
    
    // Override res.json to upload changes BEFORE returning to client (prevents race conditions)
    const originalJson = res.json;
    res.json = (async function (this: any, body: any) {
      if (dbInstance) {
        try {
          dbInstance.close();
          dbInstance = null;
        } catch (e) {}
      }
      
      if (isDriveMode && ['POST', 'PUT', 'DELETE'].includes(req.method!) && driveAccessToken && driveFileId && fs.existsSync(dbFilePath)) {
        try {
          console.log(`Auto-uploading changes to Google Drive for ${req.method} ${req.path}...`);
          await updateDbFile(driveAccessToken, driveFileId, dbFilePath);
          console.log('Google Drive upload successful.');
        } catch (e: any) {
          console.error("Google Drive upload failed:", e);
        }
        
        try {
          fs.unlinkSync(dbFilePath);
        } catch (e) {}
      } else if (isDriveMode && fs.existsSync(dbFilePath)) {
        // If it is a GET request (read-only), we still close and delete the tmp file to keep the disk clean
        try {
          fs.unlinkSync(dbFilePath);
        } catch (e) {}
      }
      
      return originalJson.call(this, body);
    } as any);

    // Bağlantıyı Context içine alarak isteği bir sonraki adıma geçir
    dbContext.run(dbInstance, () => {
      next();
    });

  } catch (err: any) {
    console.error('Veritabanı yükleme hatası:', err);
    if (dbInstance) {
      try { dbInstance.close(); } catch (e) {}
    }
    res.status(500).json({ error: `Veritabanı senkronizasyon hatası: ${err.message}` });
  }
};
