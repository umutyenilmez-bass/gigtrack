# CFO AI Agent - JSON Şeması ve Yapılandırılmış Çıktı (Structured Outputs) Protokolü

Bu belge, yapay zeka ajanınızın (AI Agent) analiz ettiği ham ekstre, borç-alacak ve nakit akışı verilerini, uygulamanızın arayüzündeki (React, HTML/JS) görsel bileşenleri, butonları ve grafikleri sıfır hata ile tetikleyebilecek **kesin, değişmez ve yapılandırılmış bir JSON şemasına (Structured Outputs)** dönüştürmek için hazırlanmıştır.

Yapay zekanın kendi kafasına göre serbest metin üretmesini engelleyerek, yazılım kodunuzun bozulmasının önüne geçer ve uygulamanızın otopilotta çalışmasını sağlar.

---

## 1. JSON Şeması Tasarım Felsefesi

Bu şema, defterinizdeki finansal ve psikolojik bilimsel araştırmaların çıktısı olarak tasarlanmıştır:
- **Kişisel Bilanço Uyumu (Plante Moran)**: Tüm harcamalar ve alacaklar, doğrudan "Kişisel Bilanço" (Personal Balance Sheet) mantığına hizmet eden `assets` (gelecek paralar) ve `liabilities` (ödeyeceğim paralar) hanelerini besler [24, 151, 152].
- **Karmaşıklık Yanılgısı Filtresi (Morningstar)**: Ham ekstredeki yüzlerce satırlık veri karmaşası arka planda süzülür, arayüze sadece sadeleştirilmiş ve gruplanmış JSON verisi aktarılır [29, 117].
- **Davranışsal Finans Parametreleri (McCracken Alliance)**: Şema içinde, kullanıcının kayıptan kaçınma (loss aversion) stresini yöneten ve aşırı güven (overconfidence) yanılgısını süzmek için kullanılan psikolojik tetikleyici değişkenler (`celebration_triggered`, `certainty_score` vb.) yer alır [28, 109].

---

## 2. OpenAI & Anthropic Uyumlu JSON Şeması (JSON Schema Draft-07)

Aşağıdaki JSON Şemasını, yapay zeka API çağrılarınızda (örneğin OpenAI API'sindeki `response_format: { type: "json_schema", json_schema: ... }` parametresinde) doğrudan kullanabilirsiniz.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CFO_Financial_Analysis_Response",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["success", "needs_clarification", "error"],
      "description": "Analizin genel başarı durumu. Eğer veri okunamadıysa 'error', belirsizlik varsa 'needs_clarification' döner."
    },
    "requires_human_verification": {
      "type": "boolean",
      "description": "Negatif senaryo kontrolü. Eğer yapay zeka veriden %100 emin değilse bu 'true' olur ve arayüzde kullanıcı onay ekranı açılır."
    },
    "balance_sheet_impact": {
      "type": "object",
      "description": "Plante Moran Kişisel Bilanço modeline göre hesaplanan finansal etkiler.",
      "properties": {
        "net_worth_change": {
          "type": "number",
          "description": "Kullanıcının net durumundaki anlık veya gelecekteki pozitif/negatif değişim miktarı."
        },
        "total_future_receivables": {
          "type": "number",
          "description": "Gelecek Paralarım (Varlıklar) hanesine eklenecek kesinleşmiş toplam tutar."
        },
        "total_future_liabilities": {
          "type": "number",
          "description": "Ödeyeceğim Paralar (Borçlar) hanesine eklenecek toplam yükümlülük tutarı."
        }
      },
      "required": ["net_worth_change", "total_future_receivables", "total_future_liabilities"]
    },
    "detected_items": {
      "type": "array",
      "description": "Ekstreden veya girdiden ayrıştırılan her bir borç, alacak, taksit veya abonelik kalemi.",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Yazılımın takip edebilmesi için ajan tarafından üretilen benzersiz ID."
          },
          "type": {
            "type": "string",
            "enum": ["subscription", "installment", "daily_expense", "receivable"],
            "description": "Kalemin finansal türü. Abonelik, taksit, tek seferlik günlük gider veya alacak."
          },
          "name": {
            "type": "string",
            "description": "Harcamanın veya alacağın temizlenmiş, anlaşılır adı (Örn: Netflix, Garanti Bankası Taksiti)."
          },
          "amount": {
            "type": "number",
            "description": "İşlem tutarı (TL cinsinden)."
          },
          "installment_details": {
            "type": "object",
            "description": "Eğer tür 'installment' ise doldurulması zorunlu olan taksit detayları.",
            "properties": {
              "current_installment": { "type": "integer" },
              "total_installments": { "type": "integer" },
              "remaining_amount": { "type": "number" }
            },
            "required": ["current_installment", "total_installments", "remaining_amount"]
          },
          "certainty_score": {
            "type": "number",
            "minimum": 0.0,
            "maximum": 1.0,
            "description": "Aşırı Güven (Overconfidence) filtresi. Yapay zekanın bu işlemin doğruluğuna ve kesinliğine verdiği güven skoru (0-1 arası)."
          },
          "is_predicted_only": {
            "type": "boolean",
            "description": "Eğer alacak kesin değilse (tahminiyse) 'true' olur ve Net Durum hesaplamasından hariç tutulur."
          }
        },
        "required": ["id", "type", "name", "amount", "certainty_score", "is_predicted_only"]
      }
    },
    "behavioral_feedback": {
      "type": "object",
      "description": "Kayıptan Kaçınma ve psikolojik rahatlama sağlayan, arayüzde gösterilecek bildirim katmanı.",
      "properties": {
        "user_message": {
          "type": "string",
          "description": "Kullanıcıya gösterilecek, finansal jargon barındırmayan, rasyonel ve rahatlatıcı açıklama metni."
        },
        "celebration_triggered": {
          "type": "boolean",
          "description": "Borç ödendiğinde veya bir taksit bittiğinde yeşil konfeti efektini tetikleyen bayrak."
        },
        "actionable_advice": {
          "type": "string",
          "description": "Nakit akışını optimize edecek, yatırım tavsiyesi içermeyen otopilot (Rule 10b5-1) tavsiyesi [3, 26]."
        }
      },
      "required": ["user_message", "celebration_triggered", "actionable_advice"]
    }
  },
  "required": ["status", "requires_human_verification", "balance_sheet_impact", "detected_items", "behavioral_feedback"]
}
```

---

## 3. Yazılımcınız İçin TypeScript Arabirimi (TypeScript Interfaces)

Uygulamanızın frontend (React/React Native/HTML) veya backend (Node.js) tarafında bu veriyi tip güvenliği ile karşılamak için kullanacağınız TypeScript arayüz tanımları:

```typescript
export interface BalanceSheetImpact {
  net_worth_change: number;          // Net Durum Değişimi (TL)
  total_future_receivables: number;  // Toplam Gelecek Para (Varlık)
  total_future_liabilities: number;  // Toplam Ödeyeceğim Para (Yükümlülük)
}

export interface InstallmentDetails {
  current_installment: number;       // Mevcut taksit (Örn: 3)
  total_installments: number;        // Toplam taksit sayısı (Örn: 12)
  remaining_amount: number;          // Kalan toplam taksit borcu (TL)
}

export interface DetectedItem {
  id: string;
  type: 'subscription' | 'installment' | 'daily_expense' | 'receivable';
  name: string;
  amount: number;
  installment_details?: InstallmentDetails;
  certainty_score: number;           // 0.0 - 1.0 arası yapay zeka güven skoru
  is_predicted_only: boolean;        // Aşırı güven engelleme filtresi (Tahmini veri bayrağı)
}

export interface BehavioralFeedback {
  user_message: string;              // Kayıptan kaçınma stresini azaltan mesaj
  celebration_triggered: boolean;    // Konfeti tetikleyici (Başarı pekiştirici)
  actionable_advice: string;         // Yatırım tavsiyesi olmayan pratik otopilot önerisi
}

export interface CFOAgentResponse {
  status: 'success' | 'needs_clarification' | 'error';
  requires_human_verification: boolean; // Hata kontrolü (Negatif senaryo koruması)
  balance_sheet_impact: BalanceSheetImpact;
  detected_items: DetectedItem[];
  behavioral_feedback: BehavioralFeedback;
}
```

---

## 4. Örnek Çıktı Senaryoları (Yapay Zekanın Üreteceği Çıktılar)

### Senaryo A: Kredi Kartı Ekstresi Başarıyla Okunduğunda (Abonelik ve Taksit Tespit Edildi)
Yapay zeka, ham verileri aldıktan sonra sisteme sadece şu temiz JSON paketini iletir. Yazılımınız bu paketi okuyarak tek hamlede ekranı günceller:

```json
{
  "status": "success",
  "requires_human_verification": false,
  "balance_sheet_impact": {
    "net_worth_change": -3789.90,
    "total_future_receivables": 0.00,
    "total_future_liabilities": 3789.90
  },
  "detected_items": [
    {
      "id": "item_sub_netflix",
      "type": "subscription",
      "name": "Netflix Aylık Üyelik",
      "amount": 189.90,
      "certainty_score": 0.99,
      "is_predicted_only": false
    },
    {
      "id": "item_inst_refrigerator",
      "type": "installment",
      "name": "Buzdolabı Alışverişi (Arçelik)",
      "amount": 1200.00,
      "installment_details": {
        "current_installment": 3,
        "total_installments": 12,
        "remaining_amount": 10800.00
      },
      "certainty_score": 0.95,
      "is_predicted_only": false
    },
    {
      "id": "item_daily_grocery",
      "type": "daily_expense",
      "name": "Market ve Günlük Yaşam Harcamaları",
      "amount": 2400.00,
      "certainty_score": 0.90,
      "is_predicted_only": false
    }
  ],
  "behavioral_feedback": {
    "user_message": "Ekstreni tamamen inceledim ve senin için sadeleştirdim! Netflix aboneliğini otopilota aldım. Buzdolabı taksitinin ise bu ay 3. taksitini ödedin, kalan borç haneni güncelledim.",
    "celebration_triggered": false,
    "actionable_advice": "Buzdolabı dışındaki tüm taksitlerin bitmiş görünüyor. Gelecek 2 ay boyunca yeni bir taksitli harcama yapmazsan, aylık nakit akışını %30 daha rahatlatabiliriz."
  }
}
```

### Senaryo B: Belirsiz Bir Alacak Girişi Yapıldığında (Aşırı Güven - Overconfidence Engelleme)
Kullanıcı *"Arkadaşım Ahmet bana 15.000 TL ödeyecek ama tarih henüz belli değil"* dediğinde, yapay zekanın "Net Durum" hesaplamasını yanıltmaması için üreteceği çıktı:

```json
{
  "status": "needs_clarification",
  "requires_human_verification": true,
  "balance_sheet_impact": {
    "net_worth_change": 0.00,
    "total_future_receivables": 15000.00,
    "total_future_liabilities": 0.00
  },
  "detected_items": [
    {
      "id": "item_rec_ahmet",
      "type": "receivable",
      "name": "Ahmet Borç İadesi",
      "amount": 15000.00,
      "certainty_score": 0.50,
      "is_predicted_only": true
    }
  ],
  "behavioral_feedback": {
    "user_message": "Ahmet'ten beklediğin 15.000 TL'yi alacaklar listene ekledim. Ancak ödeme tarihi belirsiz olduğu için, seni güvenceye almak adına bu parayı 'Net Durum' hesaplamana hemen eklemiyorum. Para eline geçtiğinde tek tıkla kesinleştirebiliriz.",
    "celebration_triggered": false,
    "actionable_advice": "Planlanmamış paraları henüz cebine girmeden bütçeye dahil etmemek, seni nakit sıkışıklığından korur. Ahmet ile tahmini bir ay belirlemeye çalışabilirsin."
  }
}
```

---

Bu şema, uygulamanızın yazılım mimarisi ile yapay zeka ajanınızın entegrasyonunu kusursuz hale getirecektir.
