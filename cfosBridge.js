/**
 * GigTrack -> CfOS Gelir Senkronizasyon Köprü Scripti
 * GigTrack üzerinde "Ödendi" olarak işaretlenmiş tüm işlerin tutarını hesaplar
 * ve CfOS sisteminin erişebileceği global bir API sağlar.
 */

(function () {
  window.getGigTrackPaidEarnings = function (yearFilter = null, monthFilter = null) {
    try {
      const raw = localStorage.getItem('gigtrack_v3') || '[]';
      const gigs = JSON.parse(raw);

      let totalTRY = 0;
      const totalsByCurrency = { TRY: 0, USD: 0, EUR: 0, GBP: 0 };
      let paidCount = 0;

      // Döviz Kurları (Canlı Güncellenen Oranlar)
      const RATES = window.liveRates || {
        TRY: 1,
        USD: 47.42,
        EUR: 54.16,
        GBP: 63.17
      };

      gigs.forEach((gig) => {
        if (gig && gig.paid) {
          if (yearFilter && !gig.date.startsWith(String(yearFilter))) return;
          if (monthFilter && !gig.date.startsWith(`${yearFilter}-${String(monthFilter).padStart(2, '0')}`)) return;

          let feeNum = 0;
          if (typeof gig.fee === 'number') {
            feeNum = gig.fee;
          } else if (typeof gig.fee === 'string') {
            const match = gig.fee.replace(/,/g, '.').match(/(\d+\.?\d*)/);
            feeNum = match ? parseFloat(match[1]) : 0;
          }

          const curr = (gig.currency || 'TRY').toUpperCase();
          if (totalsByCurrency[curr] !== undefined) {
            totalsByCurrency[curr] += feeNum;
          } else {
            totalsByCurrency.TRY += feeNum;
          }

          const rate = RATES[curr] || 1;
          totalTRY += feeNum * rate;
          paidCount++;
        }
      });

      return {
        totalTRY: Math.round(totalTRY * 100) / 100,
        totalsByCurrency,
        paidCount
      };
    } catch (err) {
      console.error('[cfosBridge] Gelir hesaplama hatası:', err);
      return { totalTRY: 0, totalsByCurrency: { TRY: 0, USD: 0, EUR: 0, GBP: 0 }, paidCount: 0 };
    }
  };

  console.log('[cfosBridge] GigTrack Gelir Köprüsü Aktif.');
})();
