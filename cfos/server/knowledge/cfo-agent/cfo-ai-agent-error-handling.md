# CFO Yapay Zeka Ajanı Hata ve Negatif Senaryo Yönetim Protokolü (Stage 4)

Bu protokol; akıllı borç-alacak ve ekstre analiz sisteminizin arka planında çalışan yapay zeka ajanının (CFO AI Agent), gerçek hayatın belirsiz, bozuk ve eksik verileriyle karşılaştığında nasıl davranacağını belirleyen **Negatif Senaryo ve Hata Kontrolü** kılavuzudur.

Finansal yönetimde en kritik kural, hatalı ve varsayımsal verilerle bilanço oluşturmamaktır. Morningstar’ın **"Karmaşıklık Yanılgısı" (Complexity Bias)** araştırmasında da vurgulandığı üzere, sistemlerin hata anında karmaşık teknik terimler üretmesi kullanıcıda finansal kaygıyı artırır. Bu nedenle ajan, hata anında tamamen şeffaf, dürüst ve sadeleştirilmiş bir kurtarma (recovery) süreci işletmelidir.

---

## 1. TEMEL HATA YÖNETİMİ FELSEFESİ
- **Sıfır Varsayım (Zero Assumption)**: Yapay zeka, eksik veya okunamayan bir finansal veriyi asla kendi kafasından tamamlamaz (halüsinasyon görmez). Eksik bilgi varsa tahmin yürütmek yerine işlemi durdurur ve kullanıcıdan teyit ister.
- **Tehditkâr Olmayan Dil**: "Hata Kodu 500", "Sistem Çöktü", "Geçersiz Dosya" gibi stres yaratan teknik diller tamamen yasaktır. Hata bildirimleri kullanıcı dostu, çözüm odaklı ve sakindir.
- **Güvenli Park Etme (Safe Harbor)**: Şüpheli veya tam çözümlenemeyen işlemler sistemden silinmez; "Netleşmeyen İşlemler" adı verilen geçici bir alana park edilerek kullanıcının manuel onayına sunulur.

---

## 2. GERÇEK HAYAT NEGATİF SENARYOLARI VE AJAN AKSİYONLARI

### Senaryo A: Okunamayan / Bozuk Ekstre Görseli (OCR / Görsel Analiz Hatası)
*   **Hata Durumu**: Kullanıcı düşük çözünürlüklü, bulanık, kesilmiş veya karanlık bir kredi kartı ekstresi yüklediğinde oluşur.
*   **Ajan Analiz Mantığı**: Metin okuma kalitesi (confidence score) %70'in altındaysa, işlem listesini uydurmaya çalışmak yerine işlemi durdurmalıdır.
*   **Kullanıcıya Gösterilecek Mesaj**:
    > "Ekstreni aldım fakat görüntü biraz bulanık veya karanlık olduğu için verileri tam olarak netleştiremedim. Sana hatalı bilgi göstermek istemem. 
    > Ekstrenin daha net bir fotoğrafını yükleyebilir misin ya da istersen borç ve alacaklarını aşağıdaki butona basarak saniyeler içinde manuel ekleyebiliriz?"

---

### Senaryo B: Belirsiz / Tanımlanamayan İşlem Satırı
*   **Hata Durumu**: Ekstrede yer alan ama ajanın kime ait olduğunu (abonelik mi, taksit mi yoksa normal gider mi) çözemediği karmaşık işlem kodları (Örn: *12/07 IYZCO*PAY-382910 TL 450.00*).
*   **Ajan Analiz Mantığı**: İşlem kategorisi veya alıcı tam olarak netleşmediğinde, bu satırı görmezden gelmek yerine "Netleşmeyen İşlem" olarak şemaya kaydeder.
*   **Kullanıcıya Gösterilecek Mesaj**:
    > "Ekstrendeki diğer her şeyi düzenledim ancak **450 TL'lik** bir ödemenin hangi aboneliğe veya borca ait olduğunu tam olarak çözemedim. 
    > Bu harcamayı senin için listeye hangi adla eklememi istersin?"

---

### Senaryo C: Mükerrer (Tekrarlanan) Veri Çelişkisi
*   **Hata Durumu**: Kullanıcı aynı ekstre dosyasını üst üste iki kez yüklediğinde veya sistem daha önce kaydedilmiş bir taksiti yeni bir işlem gibi algıladığında oluşur.
*   **Ajan Analiz Mantığı**: Sistem, veri tabanındaki mevcut işlemlerle yeni gelen işlemleri (tarih, tutar ve alıcı bazında) karşılaştırır. Mükerrerlik şüphesi varsa kullanıcıya sormadan iki kez kaydetmez.
*   **Kullanıcıya Gösterilecek Mesaj**:
    > "Bu ekstreyi (veya harcamayı) daha önce listene güvenle eklemiştik. Bilançonu mükerrer harcamalarla şişirmemek için yeni bir kayıt eklemiyorum. Her şey zaten kontrolüm altında!"

---

## 3. TEKNİK HATA ÇIKTI FORMATI (JSON SCHEMA)

Yapay zeka ajanı bir hata ile karşılaştığında, uygulamanızın (React/HTML front-end) çökmesini engellemek ve kullanıcıyı doğru ekrana yönlendirmek için aşağıdaki yapılandırılmış `ErrorResponse` JSON çıktısını üretmek zorundadır:

```json
{
  "status": "error",
  "error_type": "READ_ERROR | UNCERTAIN_MERCHANT | DUPLICATE_ENTRY",
  "affected_area": "assets | liabilities | general",
  "stiffness": "medium", 
  "psychological_context": {
    "action_required": true,
    "stress_reduction_note": "Hatalı bilgiyle bütçeni bozmamak için işlemi durdurup güvenli moda geçtim."
  },
  "raw_unresolved_data": {
    "transaction_line": "12/07 IYZCO*PAY-382910 TL 450.00",
    "amount": 450.00,
    "suspected_issue": "Merchant name is dynamic or unidentifiable"
  },
  "ui_guidance": {
    "display_message": "Ekstrendeki 450 TL'lik bir ödemenin kime gittiğini tam çıkaramadım. Listene hangi adla ekleyeyim?",
    "suggested_inputs": ["Abonelik", "Market Harcaması", "Manuel Borç Ödemesi"],
    "primary_button": {
      "text": "Adını Sen Koy",
      "action": "trigger_manual_label"
    },
    "secondary_button": {
      "text": "Bu Harcamayı Atla",
      "action": "ignore_transaction"
    }
  }
}
```

---

## 4. SISTEM ENTEGRASYON TALIMATI (DEVELOPER INSTRUCTIONS)

Yazılım geliştirme ekibiniz, ajanın hata yönetim motorunu devreye alırken şu üç kuralı uygulamalıdır:

1.  **AI Gözetim Filtresi (Confidence Guard)**: Ekstre taramalarında yapay zekanın veri eşleştirme güven oranı %85'in altındaysa, doğrudan `status: "error"` şeması tetiklenmeli ve veri veri tabanına yazılmamalıdır.
2.  **Kayıptan Kaçınma (Loss Aversion) Dengelemesi**: Hata anlarında kesinlikle kırmızı renkte ünlemler veya uyarı sesleri kullanılmamalıdır. Hata pencerelerinde sakinleştirici renkler (örneğin soluk mavi veya gri tonları) ve çözüm butonları aktif olmalıdır.
3.  **Manuel override (Devre Dışı Bırakma)**: AI ne kadar akıllı olursa olsun, kullanıcı her zaman tek bir dokunuşla "Ben kendim yazacağım" diyerek ajan analizini kesip veriyi kendi eliyle düzeltebilmelidir.
