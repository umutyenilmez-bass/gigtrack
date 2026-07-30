# CFO Bilgi Tabanı — Kaynak Kitaplar

Bu klasör, uygulamanın uzman bilgisinin **ham kaynağını** içerir (denetim için):

| Dosya | Kitap |
|---|---|
| `cfo_guidebook.json` | Steven M. Bragg, **CFO Guidebook**, 4th Edition, AccountingTools Inc., 2020 — 334 sayfa, tam metin |
| `cfo_manual.json` | Steven M. Bragg, **The New CFO Financial Leadership Manual**, 3rd Edition, Wiley, 2011 — 486 sayfa, tam metin |
| `total_money_makeover.json` | Dave Ramsey, **The Total Money Makeover**, Revised 3rd Edition, Thomas Nelson — 229 sayfa, yapılandırılmış özet + Baby Steps |

## Bilgi nasıl kullanılıyor?

Uygulama AI kullanmadığı için kitaplar çalışma anında okunmaz. Bunun yerine
kitaplardaki ilkeler **[../cfo-knowledge.js](../cfo-knowledge.js)** dosyasına
deterministik kural ve parametre olarak damıtılmıştır; motor (engine.js) tüm
eşik ve kararları oradan okur. Her kural, buradaki kitapların bölüm/sayfa
atfını taşır — böylece herhangi bir öneri "hangi uzman bilgisine dayanıyor?"
sorusuna kadar izlenebilir.

Kullanılan başlıca bölümler:
- **GB Ch.3** Risk Management · **Ch.7** Budgeting & Forecasting ·
  **Ch.10** Cash Management · **Ch.11** Investment Management ·
  **Ch.12** Fund Raising with Debt
- **MN Ch.10** Financial Analysis · **Ch.11** Cash Management ·
  **Ch.12** Investing Excess Funds · **Ch.13** Obtaining Debt Financing ·
  **Ch.19** Risk Management

Kural değiştirmek için `cfo-knowledge.js` düzenlenir; kitap JSON'ları salt
referanstır.
