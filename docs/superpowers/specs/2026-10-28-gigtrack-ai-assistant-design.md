# GigTrack AI Asistanı ve Eylem Hafızası (Audit Log) Tasarım Dokümanı

**Tarih:** 2026-10-28  
**Durum:** Onaylandı (Ready for Planning)  
**Yazar:** Antigravity & Umut Yenilmez  

---

## 1. Amaç ve Vizyon

GigTrack kullanıcılarının (özellikle müzisyen/sanatçı ve serbest çalışanların) yoğun ve karışık prova/konser takvimlerinde veri girerken, silerken veya düzenlerken yaptıkları hataları, unuttukları detayları ve geçmiş hareketleri tam doğrulukla hatırlayan, sisteme %100 hakim bir **Yapay Zeka Asistanı ve Eylem Hafızası Motoru** geliştirmektir.

### Temel Prensipler
1. **Mutlak Veri Hakimiyeti:** AI; güncel konserler, geçmiş konserler, takvim gün notları (`dayNotes`), ödeme durumları, döviz kurları/kazançlar ve geçmiş eylem günlüğüne (`gigtrack_action_log`) anlık erişebilir.
2. **Eylem Hafızası (Audit Log):** Sistemde yapılan her ekleme, silme, düzenleme (alan bazlı diff: önceki değer $\rightarrow$ sonraki değer), ödeme durumu değişimi ve takvim notu değişikliği milisaniyelik zaman damgasıyla saklanır.
3. **Sıfır Güvenlik Riski (GitHub Koruması):** API anahtarı hiçbir sunucuda veya kaynak kodda yer almaz. Yalnızca kullanıcının yerel tarayıcı/Electron hafızasında (`localStorage`) saklanır ve doğrudan istemciden Google Gemini REST API'ye istek atılır.
4. **Umut OS Tasarım Uyumu:** Sade, mat koyu renkler (`#0F0F10`, `#1A1A1C`, `#FFB300`), gereksiz süs veya laf kalabalığından arındırılmış doğrudan aksiyon odaklı arayüz.

---

## 2. Mimari ve Bileşenler

Sistem 4 ana bileşenden oluşur:

```
+-------------------------------------------------------------------------+
|                                GigTrack UI                              |
|   [Header Spark Icon ✨]                 [Settings -> Gemini API Key]   |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
|                      AI Drawer / Chat Interface                         |
|  - Mesajlaşma Akışı (Markdown Render, Kod/Liste desteği)                |
|  - Hızlı Soru Çipleri ("Dün ne sildim?", "Son düzenlemeler", vb.)       |
|  - API Key Durumu / Kurulum Ekranı                                     |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
|                         GigTrack Context Builder                        |
|  - Anlık Sistem Tarihi / Saati (Yerel Türkçe)                           |
|  - Konser Veritabanı (`gigs` - Tarih, Mekan, Sanatçı, Ücret, Ödendi)    |
|  - Takvim Notları (`dayNotes`)                                          |
|  - Finansal Özet (Toplam iş, Ödenen, Bekleyen, Para Birimleri)          |
|  - Eylem Hafızası (`gigtrack_action_log` - Son 150 hareket)             |
+------------------------------------+------------------------------------+
                   ^                 |
                   |                 v
+------------------+----+   +--------+------------------------------------+
|   ActionLogger Engine |   |        Gemini API Client (Direct REST)      |
|  - ADD_GIG            |   |  - gemini-2.5-flash                                  |
|  - EDIT_GIG (Diff)    |   |  - Client-side REST çağrısı                 |
|  - DELETE_GIG         |   |  - localStorage: gigtrack_gemini_api_key    |
|  - TOGGLE_PAID        |   +---------------------------------------------+
|  - NOTE_SAVE/DELETE   |
|  - UNDO               |
+-----------------------+
```

---

## 3. Detaylı Bileşen Tasarımları

### 3.1 Eylem Hafızası Motoru (`ActionLogger`)
Tüm veri mutasyon fonksiyonlarına kanca (hook) atar:

* **Depolama:** `localStorage.getItem('gigtrack_action_log')`
* **Kapasite Limiti:** Son 200 eylem (FIFO).
* **Kayıt Şeması:**
  ```typescript
  interface ActionLogEntry {
    id: string;              // Benzersiz işlem ID'si
    timestamp: string;       // ISO 8601 ve yerel saat (örn: 2026-10-28 20:15:32)
    type: 'ADD_GIG' | 'EDIT_GIG' | 'DELETE_GIG' | 'TOGGLE_PAID' | 'SAVE_NOTE' | 'DELETE_NOTE' | 'UNDO';
    summary: string;         // İnsan tarafından okunabilir özet (örn: "Dorock XL konseri silindi")
    details: {
      gig?: any;             // İlgili konser nesnesi (ekleme veya silmede tam kopya)
      diff?: Array<{         // Düzenlemede değişen alanlar
        field: string;
        from: any;
        to: any;
      }>;
      date?: string;         // Not tarihi
      oldNote?: string;
      newNote?: string;
      status?: boolean;      // Ödeme durumu
    };
  }
  ```

#### Mutasyon Noktaları:
1. `saveGig()`:
   * Yeni kayıt ise `ADD_GIG` (sanatçı, mekan, tarih, ücret, para birimi, notlar kaydedilir).
   * Düzenleme ise `EDIT_GIG` (önceki konser nesnesi ile form verisi karşılaştırılır, yalnızca değişen alanlar `diff` olarak kaydedilir).
2. `confirmDelete(id)`:
   * `DELETE_GIG` (silinmeden önceki tüm konser detayları hafızaya alınır).
3. `togglePaidStatus(id)`:
   * `TOGGLE_PAID` (konser bilgisi ve yeni ödendi durumu kaydedilir).
4. `saveDayNote(date, note)` / `deleteDayNote(date)`:
   * `SAVE_NOTE` veya `DELETE_NOTE` (tarih, eski not ve yeni not kaydedilir).
5. `undo()`:
   * `UNDO` (geri alma işlemi yapıldığı kaydedilir).

---

### 3.2 Bağlam Derleyici (`buildAiContext`)
AI'a gönderilecek sistem promptu oluşturulurken dinamik olarak çalışır:

1. **Zaman:** O anki yıl, ay, gün, gün adı ve saat.
2. **Konser Özeti:**
   * Toplam konser sayısı.
   * Aktif yıldaki toplam konserler.
   * Ödenen vs. bekleyen işler sayısı ve toplam tutarları (TRY, EUR, USD, GBP bazında).
3. **Konser Listesi (Tam):**
   * Kronolojik sıralı; ID, Tarih, Saat, Sanatçı, Mekan, Ücret, Para Birimi, Ödeme Durumu (`Ödendi` / `Bekliyor`), Varsa Notlar ve Masraflar.
4. **Takvim Notları (`dayNotes`):**
   * Not girilmiş tüm günlerin tarihleri ve içerikleri.
5. **Eylem Geçmişi (Son 150 Hareket):**
   * Yapılan işlemlerin kronolojik özeti ve detaylı diff'leri (örn: *"28.10.2026 19:40 - Dorock XL konserinin ücreti 10.000 TRY iken 12.000 TRY olarak güncellendi"*).
6. **Asistan Rolü ve Yönergeleri:**
   * Doğrudan, net, Türkçe, profesyonel müzisyen jargonu ve finans disipliniyle yanıt ver.
   * Silinen bir şey sorulduğunda eylem günlüğünden bul ve tam detaylarıyla bildir.
   * Tahmin veya varsayım yapma; sistemde ne varsa onu söyle.

---

### 3.3 Güvenli API Anahtarı Yönetimi
* **Depolama:** `localStorage.getItem('gigtrack_gemini_api_key')`
* **Giriş Noktaları:**
  1. **Ayarlar Modalı:** Yeni `Yapay Zeka (Gemini API)` kartı. Anahtar girme, kaydetme, test etme ve silme butonları.
  2. **AI Drawer İçi:** Eğer anahtar henüz girilmemişse, doğrudan sohbet kutusu yerine tek tıkla anahtar girme alanı görünür.
* **API Çağrısı:**
  ```javascript
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  ```
* **Hata Yönetimi:**
  * Geçersiz API anahtarı (`400/403`): Kullanıcıya anahtarın geçersiz olduğunu belirten net uyarı ve ayarları açma butonu.
  * Ağ bağlantısı hatası: Çevrimdışı uyarısı.
  * Hız sınırı (`429`): Kota sınırı bildirimi.

---

### 3.4 Kullanıcı Arayüzü (UI / UX)

#### 1. Header Butonu
* Header'daki ayarlar butonunun yanına ✨ simgeli minimalist bir buton eklenir:
  `<button class="btn-add" id="btnAiAssistant" onclick="toggleAiDrawer()">✨</button>`

#### 2. AI Drawer (Açılır Panel)
* Sayfanın sağından veya altından açılan pürüzsüz animasyonlu drawer (`#aiDrawer`).
* **Üst Bar:** "GigTrack Asistanı", "Temizle (Çöp Kutusu)" ve "Kapat (✕)" butonları.
* **Hızlı Öneri Çipleri (Quick Chips):**
  * *"Dün ne sildim?"*
  * *"Son düzenlemelerim"*
  * *"Bu ayki durumum"*
  * *"Bekleyen ödemelerim"*
* **Sohbet Alanı:**
  * Kullanıcı mesajı (sağda, koyu sarı/gri zemin).
  * Asistan mesajı (solda, mat antrasit kart, markdown biçimlendirme desteği).
  * Yazıyor animasyonu (`...`).
* **Alt Giriş Alanı:**
  * Metin kutusu (Enter ile gönderir, Shift+Enter ile yeni satır).
  * Gönder butonu.

---

## 4. Test ve Doğrulama Planı

1. **Audit Log Testi:**
   * Konser ekle $\rightarrow$ `gigtrack_action_log` kontrol et (`ADD_GIG` var mı).
   * Konser ücretini ve tarihini değiştir $\rightarrow$ `EDIT_GIG` diff alanlarını kontrol et (`fee` ve `date` eski/yeni doğru mu).
   * Konseri sil $\rightarrow$ `DELETE_GIG` içinde silinen konserin tüm verisinin korunduğunu doğrula.
   * Takvime gün notu ekle/sil $\rightarrow$ `SAVE_NOTE` / `DELETE_NOTE` kontrol et.
   * Geri al (`undo`) yap $\rightarrow$ `UNDO` kaydını doğrula.
2. **Gemini Entegrasyon Testi:**
   * Geçersiz API key girildiğinde hata mesajını doğrula.
   * Geçerli API key ile bağlan:
     * *"Dün hangi konseri sildim?"* sorusuna doğru yanıt.
     * *"En son neyi düzenledim?"* sorusuna diff detaylarıyla yanıt.
     * *"Kasım ayında kaç konserim var ve ne kadar bekleyen param var?"* sorusuna hesaplamayla doğru yanıt.
3. **Güvenlik Doğrulaması:**
   * `git status` ve `git diff` kontrol edilerek hiçbir API anahtarının veya gizli bilginin depoya girmediğinden emin olunması.

---

## 5. Uygulama Adımları

1. `ai-logger.js` (veya `index.html` içi bağımsız modül) oluşturularak mutasyon kancalarının bağlanması.
2. `buildAiContext()` fonksiyonunun yazılması.
3. Gemini REST API istemcisinin yazılması (`callGeminiApi`).
4. AI Drawer HTML & CSS bileşenlerinin eklenmesi (Umut OS standartlarında).
5. Ayarlar (Settings) modalına Gemini API Key yönetim arayüzünün entegre edilmesi.
6. Uçtan uca testlerin çalıştırılması ve doğrulanması.
