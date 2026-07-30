# 🤖 Kişisel Finans Yönetim ve Borç Optimizasyon Sistemi (AI Agent)

Bu proje, bireysel kullanıcıların finansal verilerini (kredi kartı ekstreleri, gelir bilgileri, sabit giderler) analiz ederek, kişiselleştirilmiş bir harcama raporu ve stratejik borç ödeme planı oluşturan yapay zeka tabanlı bir finansal danışmanlık sistemidir.

## 📌 Proje Amacı

Sistem, karmaşık banka ekstrelerini anlamlandırarak kullanıcının nakit akışını optimize etmeyi, yüksek faizli borçlardan kurtulma stratejileri geliştirmeyi ve finansal sağlığı korumak için proaktif uyarılar sunmayı hedefler.

---

## 🚀 Temel Özellikler

### 1. Çoklu Veri Kaynağı Entegrasyonu
*   **PDF Ekstre Analizi:** İş Bankası, Enpara ve diğer bankaların PDF formatındaki ekstrelerini okuyup veriye dönüştürür.
*   **Gelir ve Sabit Gider Takibi:** Maaş, kira ve diğer düzenli ödemeleri sisteme dahil eder.

### 2. Akıllı Harcama Kategorizasyonu
Harcamaları sadece isimlerine göre değil, finansal önceliklerine göre sınıflandırır:
*   **Mecburi Giderler:** Kira, Market, Sağlık, Ulaşım.
*   **Finansal Giderler:** Faizler, BSMV, KKDF ve banka komisyonları.
*   **Keyfi / Sosyal Giderler:** Dışarıda yemek, eğlence, tatil.
*   **Abonelik Yönetimi:** Dijital platform (Netflix, Spotify, Cloud vb.) ödemelerinin tespiti.
*   **Taksit Takibi:** Gelecek aylara sarkan taksitli alışverişlerin analizi.

### 3. Stratejik Borç Ödeme Planlayıcısı
*   **Kritik Durum Analizi:** Asgari ödemesi yapılmayan veya gecikmeye düşen kartları tespit ederek "bloke riskini" önceliklendirir.
*   **Nakit Akışı Optimizasyonu:** Aylık gelirden mecburi giderler çıktıktan sonra kalan tutarı, faiz yükü en yüksek olan borca yönlendirir.
*   **Adım Adım Eylem Planı:** Kullanıcıya hangi gün, hangi karta, ne kadar ödeme yapması gerektiğini net bir şekilde söyler.

### 4. Finansal Sağlık Uyarıları
*   Kredi notunu etkileyebilecek asgari ödeme ihlalleri için erken uyarı sistemi.
*   Abonelik giderleri üzerinden tasarruf önerileri.
*   Acil durum fonu (Emergency Fund) oluşturma hedefleri.

---

## 🛠 Teknik Yapı (Önerilen)

| Bileşen | Teknoloji / Yöntem |
| :--- | :--- |
| **Veri İşleme** | Python (Pandas, PDFPlumber/PyMuPDF) |
| **Zeka Katmanı** | LLM (Large Language Model) Entegrasyonu |
| **Analiz Metodu** | Borç Çığı (Debt Avalanche) veya Borç Kartopu (Debt Snowball) |
| **Raporlama** | Markdown tabanlı finansal özet ve strateji belgeleri |

---

## 📊 Örnek Sistem Çıktısı

Sistem, analiz sonucunda aşağıdaki yapıda bir tablo ve eylem planı üretir:

### Finansal Durum Tablosu
| Kalem | Tutar (TL) | Açıklama |
| :--- | :--- | :--- |
| **Aylık Net Gelir** | 209.500,00 | Toplam Nakit Girişi |
| **Sabit Giderler** | 35.000,00 | Kira vb. |
| **Toplam Borç** | 226.173,85 | Tüm Kredi Kartları |
| **Ödeme Kapasitesi** | ~141.000,00 | Borca Yönlendirilebilir Tutar |

### Stratejik Eylem Planı
1.  **Öncelik:** İş Bankası asgari tutarını öde (Bloke riskini durdur).
2.  **Ara Adım:** Enpara asgari tutarını tamamla.
3.  **Saldırı:** Kalan tüm bakiyeyi en yüksek faizli/riskli borca yatır.

---

## 💡 Kullanım Senaryosu

1.  Kullanıcı ekstrelerini (PDF) sisteme yükler.
2.  Gelir ve kira bilgisini mesaj olarak iletir.
3.  AI Ajanı verileri parse eder ve kategorize eder.
4.  Sistem, mevcut faiz oranlarını ve gecikme durumlarını kontrol ederek **Kişiselleştirilmiş Borç Ödeme Protokolü** hazırlar.
5.  Kullanıcıya tasarruf edebileceği alanları (gereksiz abonelikler vb.) raporlar.

---

## ⚠️ Önemli Notlar
*   Bu sistem bir yatırım tavsiyesi vermez; mevcut veriler ışığında matematiksel bir borç yönetimi simülasyonu sunar.
*   Veri gizliliği için ekstrelerdeki kişisel bilgilerin maskelenmesi önerilir.

---
*Bu README dosyası, yapay zeka ajanı ile gerçekleştirilen finansal analiz görüşmeleri temel alınarak oluşturulmuştur.*
