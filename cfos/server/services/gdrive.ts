import crypto from 'crypto';
import fs from 'fs';

// Helper to get access token from either a raw token or a Service Account JSON string
export async function getAccessToken(gdriveApiKey: string): Promise<string> {
  const trimmed = gdriveApiKey.trim();
  
  // If it's a JSON string, treat it as a Google Service Account key
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const key = JSON.parse(trimmed);
      const privateKey = key.private_key;
      const clientEmail = key.client_email;
      
      if (!privateKey || !clientEmail) {
        throw new Error('Geçersiz Service Account JSON formatı. private_key ve client_email bulunamadı.');
      }
      
      const header = {
        alg: 'RS256',
        typ: 'JWT'
      };
      
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };
      
      const base64UrlEncode = (obj: any) => {
        return Buffer.from(JSON.stringify(obj))
          .toString('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      };
      
      const tokenParts = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
      
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(tokenParts);
      const signature = sign.sign(privateKey, 'base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      
      const assertion = `${tokenParts}.${signature}`;
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google OAuth hatası: ${errText}`);
      }
      
      const data = await response.json() as any;
      return data.access_token;
    } catch (e: any) {
      throw new Error(`Google Service Account token alma hatası: ${e.message}`);
    }
  }
  
  // Otherwise, treat it as a direct Access Token (temporary OAuth token)
  return trimmed;
}

// Search for cfos_db.sqlite inside the target folder
export async function findDbFile(accessToken: string, folderId: string): Promise<string | null> {
  const query = encodeURIComponent(`name='cfos_db.sqlite' and '${folderId}' in parents and trashed=false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive listeleme hatası: ${errText}`);
  }
  
  const data = await response.json() as any;
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  
  return null;
}

// Download db file from Drive to local temporary path
export async function downloadDbFile(accessToken: string, fileId: string, destPath: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive indirme hatası: ${errText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

// Upload a new db file to Drive folder
export async function uploadNewDbFile(accessToken: string, folderId: string, srcPath: string): Promise<string> {
  const metadata = {
    name: 'cfos_db.sqlite',
    parents: [folderId]
  };
  
  const fileContent = fs.readFileSync(srcPath);
  const boundary = '-------cfos_multipart_boundary';
  
  const bodyBuffer = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: bodyBuffer
    }
  );
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive yükleme hatası: ${errText}`);
  }
  
  const data = await response.json() as any;
  return data.id;
}

// Update existing db file on Drive
export async function updateDbFile(accessToken: string, fileId: string, srcPath: string): Promise<void> {
  const fileContent = fs.readFileSync(srcPath);
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream'
      },
      body: fileContent
    }
  );
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive güncelleme hatası: ${errText}`);
  }
}

// Find or automatically create a folder named CfOS_Data
export async function findOrCreateFolder(accessToken: string, folderName: string): Promise<string> {
  const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&spaces=drive`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive klasör sorgulama hatası: ${errText}`);
  }

  const data = await response.json() as any;
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Not found, create it
  const createResponse = await fetch(
    'https://www.googleapis.com/drive/v3/files',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    }
  );

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Drive klasör oluşturma hatası: ${errText}`);
  }

  const folderData = await createResponse.json() as any;
  return folderData.id;
}
