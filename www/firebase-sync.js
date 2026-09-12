/**
 * GigTrack Firebase Sync Engine
 * Realtime Database integration for continuous cloud backup and multi-device sync.
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDa4wjQRzkPMrxokXQ8CuxhW6OHnmTYFCA",
  authDomain: "finans-71ae5.firebaseapp.com",
  databaseURL: "https://finans-71ae5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "finans-71ae5",
  storageBucket: "finans-71ae5.firebasestorage.app",
  messagingSenderId: "464286067971",
  appId: "1:464286067971:web:e973ce759fb9396144da6e"
};

const FirebaseSync = {
  dbUrl: FIREBASE_CONFIG.databaseURL,
  endpoint: `${FIREBASE_CONFIG.databaseURL}/gigtrack_backup.json`,
  status: 'connecting', // 'connected' | 'syncing' | 'offline' | 'error'
  lastSyncTime: localStorage.getItem('gigtrack_last_cloud_sync') || null,
  debounceTimer: null,
  isSyncing: false,
  eventSource: null,
  clientId: (function() {
    let id = localStorage.getItem('gigtrack_client_id');
    if (!id) {
      id = 'client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('gigtrack_client_id', id);
    }
    return id;
  })(),

  heartbeatTimer: null,

  init() {
    this.updateStatusBadge();

    // Online / Offline listeners
    window.addEventListener('online', () => {
      this.status = 'connecting';
      this.updateStatusBadge();
      this.syncInitial();
      this.startRealtimeStream();
    });

    window.addEventListener('offline', () => {
      this.status = 'offline';
      this.updateStatusBadge();
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    });

    if (navigator.onLine) {
      this.syncInitial();
      this.startRealtimeStream();
    } else {
      this.status = 'offline';
      this.updateStatusBadge();
    }

    // Canlı bağlantı nabzı (25 saniyede bir gerçek durum kontrolü)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (navigator.onLine) {
        this.checkConnection();
      } else {
        this.status = 'offline';
        this.updateStatusBadge();
      }
    }, 25000);
  },

  async checkConnection() {
    if (!navigator.onLine) {
      this.status = 'offline';
      this.updateStatusBadge();
      return false;
    }
    try {
      const res = await fetch(`${this.endpoint}?shallow=true`, { cache: 'no-store' });
      if (res && res.ok) {
        this.status = 'connected';
      } else {
        this.status = 'error';
      }
    } catch (e) {
      this.status = navigator.onLine ? 'error' : 'offline';
    }
    this.updateStatusBadge();
    return this.status === 'connected';
  },

  updateStatusBadge() {
    const badge = document.getElementById('cloudSyncStatusBadge');
    const timeText = document.getElementById('cloudSyncLastTime');
    const dot = document.getElementById('cloudSyncDot');

    if (!badge && !dot) return;

    let text = 'Bağlanıyor...';
    let color = '#FFA000'; // Amber

    if (this.status === 'connected') {
      text = 'Bağlı';
      color = '#30D158'; // Green
    } else if (this.status === 'syncing') {
      text = 'Eşitleniyor...';
      color = '#0A84FF'; // Blue
    } else if (this.status === 'offline') {
      text = 'Çevrimdışı';
      color = '#8E8E93'; // Gray
    } else if (this.status === 'error') {
      text = 'Bağlantı Kesildi';
      color = '#FF453A'; // Red
    }

    if (badge) {
      badge.innerText = text;
      badge.style.color = color;
    }
    if (dot) dot.style.backgroundColor = color;
    if (timeText) {
      if (this.lastSyncTime) {
        const d = new Date(this.lastSyncTime);
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const dateStr = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} ${hours}:${mins}`;
        timeText.innerText = `Son yedekleme: ${dateStr}`;
      } else {
        timeText.innerText = 'Henüz bulut yedeklemesi yapılmadı';
      }
    }
  },

  async syncInitial() {
    if (!navigator.onLine) return;
    try {
      this.status = 'syncing';
      this.updateStatusBadge();

      const res = await fetch(this.endpoint, { method: 'GET' });
      if (!res.ok) throw new Error('Cloud fetch failed');
      const cloudData = await res.json();

      const localGigs = typeof gigs !== 'undefined' ? gigs : [];
      const hasLocalData = localGigs && localGigs.length > 0;

      if (!cloudData || !cloudData.lastUpdated) {
        if (hasLocalData) {
          console.log('[FirebaseSync] Cloud is empty, uploading local data...');
          await this.pushToCloud(true);
        } else {
          this.status = 'connected';
          this.updateStatusBadge();
        }
        return;
      }

      const localLastUpdated = parseInt(localStorage.getItem('gigtrack_last_local_update') || '0', 10);
      const cloudLastUpdated = parseInt(cloudData.lastUpdated || '0', 10);

      if (!hasLocalData && cloudData.gigs && cloudData.gigs.length > 0) {
        console.log('[FirebaseSync] Local storage empty, restoring from cloud...');
        this.applyCloudData(cloudData);
        if (typeof showToast === 'function') {
          showToast('☁️ Verileriniz buluttan yüklendi');
        }
      } else if (cloudLastUpdated > localLastUpdated && cloudData.clientId !== this.clientId) {
        console.log('[FirebaseSync] Cloud has newer data, updating local...');
        this.applyCloudData(cloudData);
        if (typeof showToast === 'function') {
          showToast('☁️ Diğer cihazdaki güncellemeler eşitlendi');
        }
      } else if (localLastUpdated > cloudLastUpdated) {
        console.log('[FirebaseSync] Local is newer, pushing to cloud...');
        await this.pushToCloud(true);
      }

      this.status = 'connected';
      this.lastSyncTime = new Date().toISOString();
      localStorage.setItem('gigtrack_last_cloud_sync', this.lastSyncTime);
      this.updateStatusBadge();
    } catch (err) {
      console.warn('[FirebaseSync] Initial sync warning:', err);
      this.status = navigator.onLine ? 'error' : 'offline';
      this.updateStatusBadge();
    }
  },

  triggerSave() {
    localStorage.setItem('gigtrack_last_local_update', Date.now().toString());
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.pushToCloud();
    }, 1200);
  },

  async pushToCloud(immediate = false) {
    if (!navigator.onLine) {
      this.status = 'offline';
      this.updateStatusBadge();
      return;
    }

    try {
      this.status = 'syncing';
      this.updateStatusBadge();

      const payload = {
        version: 3,
        clientId: this.clientId,
        lastUpdated: Date.now(),
        gigs: typeof gigs !== 'undefined' ? gigs : [],
        dayNotes: typeof dayNotes !== 'undefined' ? dayNotes : {},
        hiddenTemplates: typeof hiddenTemplates !== 'undefined' ? hiddenTemplates : [],
        activeYear: typeof activeYear !== 'undefined' ? activeYear : new Date().getFullYear().toString(),
        manualYears: typeof manualYears !== 'undefined' ? manualYears : []
      };

      const res = await fetch(this.endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Cloud save failed HTTP ' + res.status);

      this.status = 'connected';
      this.lastSyncTime = new Date().toISOString();
      localStorage.setItem('gigtrack_last_cloud_sync', this.lastSyncTime);
      this.updateStatusBadge();
      console.log('[FirebaseSync] Successfully synced to cloud at', this.lastSyncTime);
    } catch (err) {
      console.error('[FirebaseSync] Push error:', err);
      this.status = 'error';
      this.updateStatusBadge();
    }
  },

  async pullFromCloudManual() {
    if (!navigator.onLine) {
      if (typeof showToast === 'function') showToast('⚠️ İnternet bağlantısı yok');
      return;
    }

    try {
      this.status = 'syncing';
      this.updateStatusBadge();
      if (typeof showToast === 'function') showToast('☁️ Buluttan yükleniyor...');

      const res = await fetch(this.endpoint, { method: 'GET' });
      if (!res.ok) throw new Error('Fetch failed');
      const cloudData = await res.json();

      if (!cloudData || !cloudData.gigs) {
        if (typeof showToast === 'function') showToast('⚠️ Bulutta henüz yedek veri yok');
        this.status = 'connected';
        this.updateStatusBadge();
        return;
      }

      this.applyCloudData(cloudData);
      this.status = 'connected';
      this.lastSyncTime = new Date().toISOString();
      localStorage.setItem('gigtrack_last_cloud_sync', this.lastSyncTime);
      this.updateStatusBadge();
      if (typeof showToast === 'function') showToast(`✓ ${cloudData.gigs.length} iş buluttan geri yüklendi!`);
    } catch (err) {
      console.error('[FirebaseSync] Manual pull error:', err);
      this.status = 'error';
      this.updateStatusBadge();
      if (typeof showToast === 'function') showToast('⚠️ Buluttan çekilirken hata oluştu');
    }
  },

  async pushToCloudManual() {
    if (!navigator.onLine) {
      if (typeof showToast === 'function') showToast('⚠️ İnternet bağlantısı yok');
      return;
    }
    if (typeof showToast === 'function') showToast('☁️ Buluta yükleniyor...');
    await this.pushToCloud(true);
    if (this.status === 'connected') {
      const gigCount = typeof gigs !== 'undefined' ? gigs.length : 0;
      if (typeof showToast === 'function') showToast(`✓ ${gigCount} iş buluta yedeklendi!`);
    } else {
      if (typeof showToast === 'function') showToast('⚠️ Buluta yükleme başarısız oldu');
    }
  },

  applyCloudData(data) {
    if (!data) return;

    if (Array.isArray(data.gigs)) {
      gigs = data.gigs;
      localStorage.setItem('gigtrack_v3', JSON.stringify(gigs));
    }
    if (data.dayNotes && typeof data.dayNotes === 'object') {
      dayNotes = data.dayNotes;
      localStorage.setItem('gigtrack_day_notes', JSON.stringify(dayNotes));
    }
    if (Array.isArray(data.hiddenTemplates)) {
      hiddenTemplates = data.hiddenTemplates;
      localStorage.setItem('gigtrack_hidden_tpl', JSON.stringify(hiddenTemplates));
    }
    if (data.activeYear) {
      activeYear = String(data.activeYear);
      localStorage.setItem('gigtrack_active_year', activeYear);
    }
    if (Array.isArray(data.manualYears)) {
      manualYears = data.manualYears;
      localStorage.setItem('gigtrack_manual_years', JSON.stringify(manualYears));
    }

    if (data.lastUpdated) {
      localStorage.setItem('gigtrack_last_local_update', data.lastUpdated.toString());
    }

    if (typeof render === 'function') {
      render();
    }
  },

  startRealtimeStream() {
    if (typeof EventSource === 'undefined') return;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    try {
      this.eventSource = new EventSource(this.endpoint);

      this.eventSource.onopen = () => {
        this.status = 'connected';
        this.updateStatusBadge();
      };

      this.eventSource.addEventListener('put', (e) => {
        try {
          this.status = 'connected';
          this.updateStatusBadge();
          const parsed = JSON.parse(e.data);
          if (parsed && parsed.data && parsed.path === '/') {
            const incoming = parsed.data;
            if (incoming.clientId && incoming.clientId !== this.clientId) {
              const localLast = parseInt(localStorage.getItem('gigtrack_last_local_update') || '0', 10);
              if (incoming.lastUpdated && incoming.lastUpdated > localLast) {
                console.log('[FirebaseSync] Received realtime update from another client');
                this.applyCloudData(incoming);
                this.lastSyncTime = new Date().toISOString();
                localStorage.setItem('gigtrack_last_cloud_sync', this.lastSyncTime);
                this.updateStatusBadge();
              }
            }
          }
        } catch (err) {
          // ignore subpath updates
        }
      });

      this.eventSource.onerror = () => {
        this.status = navigator.onLine ? 'error' : 'offline';
        this.updateStatusBadge();
      };
    } catch (err) {
      console.warn('[FirebaseSync] EventSource not available or blocked:', err);
      this.status = navigator.onLine ? 'error' : 'offline';
      this.updateStatusBadge();
    }
  }
};

if (typeof window !== 'undefined') {
  window.FirebaseSync = FirebaseSync;
}

