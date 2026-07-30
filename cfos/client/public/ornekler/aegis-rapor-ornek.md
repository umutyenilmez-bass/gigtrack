# Aegis CFO — Aylık Finans Raporu

_Oluşturulma: 03.07.2026 (örnek veriden üretilmiştir)_

## Özet

| Gösterge | Değer |
| --- | --- |
| Tarih | 03.07.2026 |
| Aylık net gelir | ₺45.000,00 |
| Zorunlu giderler (asgariler hariç) | ₺24.000,00 |
| Toplam asgari ödeme | ₺17.100,00 |
| Toplam borç | ₺576.000,00 |
| Önerilen acil durum tamponu (1 aylık zorunlu gider) | ₺24.000,00 |
| Bu ay borca ayrılabilir ek tutar | ₺9.900,00 |
| Seçilen strateji | Snowball (küçük bakiye önce) |

## Bütçe hesabı (adım adım)

```
Önerilen acil durum tamponu = 1 aylık zorunlu gider = ₺24.000,00 (ayrı bir hesapta tutulması önerilir)
Toplam asgari ödeme = Σ min ödemeler = ₺17.100,00
Kesin tahsilat (temkinli kural: yalnızca "kesin" işaretliler) = ₺6.000,00
Aylık havuz = gelir ₺45.000,00 + kesin tahsilat ₺6.000,00 + ek gelir ₺0,00 = ₺51.000,00
Kalan = havuz ₺51.000,00 − zorunlu gider ₺24.000,00 − asgari ödemeler ₺17.100,00 = ₺9.900,00
Available_for_debt = ₺9.900,00
```

## Borç listesi

| Ad | Bakiye | APR % | Asgari | Vade günü | Erken ödeme cezası |
| --- | --- | --- | --- | --- | --- |
| Kredi Kartı A | ₺32.000,00 | 54 | ₺1.600,00 | 26 | Hayır |
| İhtiyaç Kredisi | ₺85.000,00 | 42 | ₺4.200,00 | 5 | Hayır |
| Telefon Taksidi | ₺9.000,00 | 0 | ₺1.500,00 | 15 | Hayır |
| Konut Kredisi | ₺450.000,00 | 21 | ₺9.800,00 | 1 | Evet |

## Strateji karşılaştırması

En küçük borç 1 ayda kapanır ve faiz farkı (₺915,80) toplam borcun %1'inin (₺5.760,00) altındadır. Hızlı kazanım + serbest kalan asgari ödeme, ihmal edilebilir faiz maliyetiyle elde edilir.

| Plan | Kapanış süresi | Toplam faiz | Toplam ödeme |
| --- | --- | --- | --- |
| Yalnızca asgari | 57 ay | ₺387.545,15 | ₺963.545,15 |
| Snowball (küçük bakiye önce) | 28 ay | ₺169.182,94 | ₺745.182,94 |
| Avalanche (yüksek APR önce) | 28 ay | ₺168.267,14 | ₺744.267,14 |
| Cash-Flow (aylık yükü hızla azalt) | 28 ay | ₺169.182,94 | ₺745.182,94 |

```
Faiz farkı (Snowball − Avalanche) = ₺169.182,94 − ₺168.267,14 = ₺915,80
Eşik: toplam borcun %1'i = ₺5.760,00
En küçük borç "Telefon Taksidi" Snowball ile 1 ayda kapanıyor (eşik: 3 ay)
K1 sağlandı → SNOWBALL.
```

## Seçili plan — borç bazında kapanış (Snowball)

Ödeme sırası: Telefon Taksidi → Kredi Kartı A → İhtiyaç Kredisi → Konut Kredisi. Aylık ek ödeme: ₺9.900,00. Kapanan borcun asgarisi sonraki hedefe devreder (kartopu devri).

| Borç | Kapanış (ay) | Ödenen faiz | Toplam ödenen |
| --- | --- | --- | --- |
| Telefon Taksidi | 1. ay (Ağustos 2026) | ₺0,00 | ₺9.000,00 |
| Kredi Kartı A | 4. ay (Kasım 2026) | ₺3.814,61 | ₺35.814,61 |
| İhtiyaç Kredisi | 9. ay (Nisan 2027) | ₺19.037,94 | ₺104.037,94 |
| Konut Kredisi | 28. ay (Kasım 2028) | ₺146.330,39 | ₺596.330,39 |

## Kullanılan kurallar ve formüller

```
Aylık faiz oranı = APR / 12 (nominal); faiz = round2(bakiye × oran), her ay tahakkuk.
Tüm ara değerler kuruşa (2 ondalık) yuvarlanır: round2(x) = round(x×100)/100.
Önerilen acil durum tamponu = 1 aylık zorunlu gider (sistem önerisi; ayrı hesapta tutulmalı).
Available_for_debt = max(0, gelir + kesin tahsilat + ek gelir − zorunlu giderler − Σ asgari).
Önce TÜM asgari ödemeler karşılanır, sonra borca ek ödeme yapılır.
APR bilinmiyorsa ekstre faiz tutarından türetilir: APR% = (aylık faiz / bakiye) × 12 × 100.
Snowball sırası: bakiye artan (eşitse APR azalan, sonra ad).
Avalanche sırası: APR azalan (eşitse aylık faiz maliyeti azalan, sonra ad).
Cash-Flow sırası: skor = asgari/bakiye azalan (eşitse APR azalan, sonra ad).
Erken ödeme cezalı borçlar ek ödeme önceliğinde sona alınır.
Strateji seçimi: K1 en küçük borç ≤3 ayda kapanıyor VE faiz farkı ≤ borcun %1'i → Snowball; K2 ek tutar < gelirin %10'u → Cash-Flow; K3 aksi halde Avalanche.
Simülasyon tavanı: 600 ay; aşarsa 'kapanmıyor' olarak raporlanır.
```

---

## Makine tarafından okunabilir veri (JSON)

```json
{
  "income": 45000,
  "essentials": 24000,
  "extraIncome": 0,
  "alertWindowDays": 5,
  "currency": "TRY",
  "debts": [
    { "id": "d-1", "name": "Kredi Kartı A", "type": "card", "balance": 32000, "apr": 54, "monthlyInterest": 1440, "minPayment": 1600, "dueDay": 26, "limit": 40000, "stmtDay": 16, "prepayPenalty": false },
    { "id": "d-2", "name": "İhtiyaç Kredisi", "type": "loan", "balance": 85000, "apr": 42, "monthlyInterest": 0, "minPayment": 4200, "dueDay": 5, "limit": 0, "stmtDay": null, "prepayPenalty": false },
    { "id": "d-3", "name": "Telefon Taksidi", "type": "loan", "balance": 9000, "apr": 0, "monthlyInterest": 0, "minPayment": 1500, "dueDay": 15, "limit": 0, "stmtDay": null, "prepayPenalty": false },
    { "id": "d-4", "name": "Konut Kredisi", "type": "loan", "balance": 450000, "apr": 21, "monthlyInterest": 0, "minPayment": 9800, "dueDay": 1, "limit": 0, "stmtDay": null, "prepayPenalty": true }
  ],
  "receivables": [
    { "id": "r-1", "name": "Serbest iş ödemesi", "amount": 6000, "certain": true },
    { "id": "r-2", "name": "Arkadaşa verilen borç", "amount": 3000, "certain": false }
  ]
}
```
