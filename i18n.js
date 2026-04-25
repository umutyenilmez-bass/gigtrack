const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Insert Scripts
const i18nScript = `// ===== i18n =====
const userLang = (navigator.language || navigator.userLanguage || "en").substring(0,2) === "tr" ? "tr" : "en";
const T = {
  en: {
    addGigBtn: "<span style=\\"font-size:16px;line-height:1\\">＋</span> Add Gig", exportData: "⬆ Export", importData: "⬇ Import",
    tabGigs: "Gigs", tabUnpaid: "Unpaid", tabPaid: "Paid", tabAnalysis: "Analysis",
    modalTitle: "New Gig",
    lblVenue: "Venue", plcVenue: "Venue Name",
    lblArtist: "Artist", plcArtist: "Artist/Band Name",
    lblDate: "Date", lblTime: "Time (opt)",
    lblFee: "Fee", plcFee: "1500 · ? · TBD · ~2000",
    hintFee: "Enter number, text, or ?. Only numeric values will show up in Analysis.",
    lblRepeat: "Repeat", optRepeatNone: "No repeat",
    optRepeatWeekly: "Weekly", optRepeatBiweekly: "Bi-weekly", optRepeatMonthly: "Monthly",
    lblUntil: "Until", lblNotes: "Notes (opt)", plcNotes: "Any notes...",
    lblPaid: "Paid?", btnSave: "Save",
    confirmTitle: "Are you sure?", confirmText: "This action cannot be undone.",
    btnCancel: "Cancel", btnDelete: "Delete",
    all: "All", noGigs: "No gigs yet",
    noGigsAdd: "Add your first gig using<br>the button on the top right.",
    noUnpaid: "All settled", noUnpaidYet: "Looks like all payments are done.",
    noPaid: "No paid gigs", noPaidYet: "No payments received yet.",
    monthsFull: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    monthsShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    days: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
    unpaidWait: "○ Pending", paidDone: "✓ Paid",
    gigEdit: "✏️ Edit", gigCalendar: "📅 Cal", gigDelete: "🗑 Delete",
    sumMonthly: "Monthly Earnings", sumYearly: "Yearly Totals",
    toastPaid: "✓ Marked as paid", toastUnpaid: "○ Marked as unpaid",
    toastClear: "✓ Name cleared from {count} gigs",
    valNoVenue: "No venue", valNoArtist: "No artist",
    filterClearTitle: "Clear Name",
    filterClearText: "Are you sure you want to remove '{val}' from your list and all related gigs? (Gigs won't be deleted, only this name will be cleared)",
    chipFeeNone: "No fee",
    lblExpenseName: "Expense Name (opt)", lblExpenseAmount: "Expense Amount",
    plcExpenseName: "e.g. Taxi", plcExpenseAmount: "Amount",
    lblAutoFuel: "Auto Fuel Calculation", lblDistance: "Distance (KM)", plcDistance: "e.g. 50",
    lblFuelRate: "Fuel Price/L", plcFuelRate: "e.g. 43.5",
    lblFuelCons: "Consumption (L/100km) - Default: 7", plcFuelCons: "7",
    calcTitle: "Calculator"
  },
  tr: {
    addGigBtn: "<span style=\\"font-size:16px;line-height:1\\">＋</span> İş Ekle", exportData: "⬇ Dışa Aktar", importData: "⬆ İçe Aktar",
    tabGigs: "İşlerim", tabUnpaid: "Ödenmemiş", tabPaid: "Ödenmiş", tabAnalysis: "Analiz",
    modalTitle: "Yeni İş",
    lblVenue: "Mekan", plcVenue: "Mekan Adı",
    lblArtist: "Sanatçı", plcArtist: "Sahne adı",
    lblDate: "Tarih", lblTime: "Saat (opsiyonel)",
    lblFee: "Ücret", plcFee: "1500 · ? · TBD · ~2000",
    hintFee: "Sayı, soru işareti veya metin girebilirsiniz. Yalnızca sayısal değer girildiğinde Analiz sekmesinde görünür.",
    lblRepeat: "Tekrar", optRepeatNone: "Tekrar yok",
    optRepeatWeekly: "Her hafta", optRepeatBiweekly: "2 haftada bir", optRepeatMonthly: "Her ay",
    lblUntil: "Son tarih", lblNotes: "Notlar (opsiyonel)", plcNotes: "Eklemek istediğin notlar...",
    lblPaid: "Ödendi mi?", btnSave: "Kaydet",
    confirmTitle: "Emin misin?", confirmText: "Bu işlemi geri alamazsın.",
    btnCancel: "İptal", btnDelete: "Sil",
    all: "Tümü", noGigs: "Henüz iş yok",
    noGigsAdd: "Sağ üstteki \\"İş Ekle\\" butonuyla<br>ilk işini ekle.",
    noUnpaid: "Bekleyen alacak yok", noUnpaidYet: "Tüm ödemeler tamamlanmış görünüyor.",
    noPaid: "Ödenmiş iş yok", noPaidYet: "Henüz ödemesi alınan bir iş yok.",
    monthsFull: ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'],
    monthsShort: ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'],
    days: ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'],
    unpaidWait: "○ Bekliyor", paidDone: "✓ Ödendi",
    gigEdit: "✏️ Düzenle", gigCalendar: "📅 Takvim", gigDelete: "🗑 Sil",
    sumMonthly: "Aylık Kazançlar", sumYearly: "Yıllık Toplamlar",
    toastPaid: "✓ Ödendi olarak işaretlendi", toastUnpaid: "○ Ödenmemiş olarak işaretlendi",
    toastClear: "✓ İsmi {count} kayıttan temizlendi",
    valNoVenue: "Mekan yok", valNoArtist: "Sanatçı yok",
    filterClearTitle: "İsmi Temizle",
    filterClearText: "'{val}' isimli {lbl} listenden ve ilgili tüm iş kayıtlarından silmek istediğine emin misin? (İşler silinmez, sadece bu isim temizlenir)",
    chipFeeNone: "Ücret yok",
    lblExpenseName: "Masraf Adı (opsiyonel)", lblExpenseAmount: "Masraf Tutarı",
    plcExpenseName: "örn. Taksi", plcExpenseAmount: "Tutar",
    lblAutoFuel: "Otomatik Yakıt Hesaplama", lblDistance: "Gidilen Mesafe (KM)", plcDistance: "Örn. 50",
    lblFuelRate: "Litre Fiyatı (TL)", plcFuelRate: "Örn. 43.5",
    lblFuelCons: "Tüketim (L/100km) - Varsayılan: 7", plcFuelCons: "7",
    calcTitle: "Hesap Makinesi"
  }
}[userLang];

function localizeDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (!T[k]) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.hasAttribute('placeholder')) el.placeholder = T[k];
      else el.value = T[k];
    } else {
      el.innerHTML = T[k];
    }
  });
}
`;

html = html.replace('// ===== STATE =====', i18nScript + '\\n// ===== STATE =====');

// 2. Add localizer call to load
html = html.replace('function load() {', 'function load() {\\n  localizeDOM();');

// 3. Replace Static Arrays
html = html.replace("const MONTHS      = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];", "const MONTHS = T.monthsShort;");
html = html.replace("const MONTHS_FULL = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];", "const MONTHS_FULL = T.monthsFull;");
html = html.replace("const DAYS        = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];", "const DAYS = T.days;");

// 4. HTML Data Attributes
html = html.replace('<button class="btn-add" onclick="openAddModal()">', '<button class="btn-add" onclick="openAddModal()" data-i18n="addGigBtn">');
html = html.replace('<span style="font-size:16px;line-height:1">＋</span> İş Ekle', '');
html = html.replace('</button>', '</button>'); // It cleans up the tag if possible, let's just do exact replace

const replacements = [
  // Header / Top
  {from: '<button class="btn-add" onclick="openAddModal()">\\n      <span style="font-size:16px;line-height:1">＋</span> İş Ekle\\n    </button>', to: '<button class="btn-add" onclick="openAddModal()" data-i18n="addGigBtn"><span style="font-size:16px;line-height:1">＋</span> İş Ekle</button>'},
  {from: '<button class="btn-data" onclick="exportData()">⬇ Dışa Aktar</button>', to: '<button class="btn-data" onclick="exportData()" data-i18n="exportData">⬇ Dışa Aktar</button>'},
  {from: '<button class="btn-data" onclick="document.getElementById(\\\'importFile\\\').click()">⬆ İçe Aktar</button>', to: '<button class="btn-data" onclick="document.getElementById(\\\'importFile\\\').click()" data-i18n="importData">⬆ İçe Aktar</button>'},
  
  // Tabs
  {from: '<span>İşlerim</span>', to: '<span data-i18n="tabGigs">İşlerim</span>'},
  {from: '<span>Ödenmemiş</span>', to: '<span data-i18n="tabUnpaid">Ödenmemiş</span>'},
  {from: '<span>Ödenmiş</span>', to: '<span data-i18n="tabPaid">Ödenmiş</span>'},
  {from: '<span>Analiz</span>', to: '<span data-i18n="tabAnalysis">Analiz</span>'},

  // Modal
  {from: '<h2 class="modal-title" id="modalTitle">Yeni İş</h2>', to: '<h2 class="modal-title" id="modalTitle" data-i18n="modalTitle">Yeni İş</h2>'},
  {from: '<label class="form-label">Mekan</label>', to: '<label class="form-label" data-i18n="lblVenue">Mekan</label>'},
  {from: 'placeholder="Mekan Adı"', to: 'placeholder="Mekan Adı" data-i18n="plcVenue"'},
  {from: '<label class="form-label">Sanatçı</label>', to: '<label class="form-label" data-i18n="lblArtist">Sanatçı</label>'},
  {from: 'placeholder="Sahne adı"', to: 'placeholder="Sahne adı" data-i18n="plcArtist"'},
  {from: '<label class="form-label">Tarih</label>', to: '<label class="form-label" data-i18n="lblDate">Tarih</label>'},
  {from: '<label class="form-label">Saat (opsiyonel)</label>', to: '<label class="form-label" data-i18n="lblTime">Saat (opsiyonel)</label>'},
  {from: '<label class="form-label">Ücret</label>', to: '<label class="form-label" data-i18n="lblFee">Ücret</label>'},
  {from: 'placeholder="1500 · ? · TBD · ~2000"', to: 'placeholder="1500 · ? · TBD · ~2000" data-i18n="plcFee"'},
  {from: 'Sayı, soru işareti veya metin girebilirsiniz. Yalnızca sayısal değer girildiğinde Analiz sekmesinde görünür.', to: '<span data-i18n="hintFee">Sayı, soru işareti veya metin girebilirsiniz. Yalnızca sayısal değer girildiğinde Analiz sekmesinde görünür.</span>'},
  
  {from: '<label class="form-label">Tekrar</label>', to: '<label class="form-label" data-i18n="lblRepeat">Tekrar</label>'},
  {from: '<option value="none">Tekrar yok</option>', to: '<option value="none" data-i18n="optRepeatNone">Tekrar yok</option>'},
  {from: '<option value="weekly">Her hafta</option>', to: '<option value="weekly" data-i18n="optRepeatWeekly">Her hafta</option>'},
  {from: '<option value="biweekly">2 haftada bir</option>', to: '<option value="biweekly" data-i18n="optRepeatBiweekly">2 haftada bir</option>'},
  {from: '<option value="monthly">Her ay</option>', to: '<option value="monthly" data-i18n="optRepeatMonthly">Her ay</option>'},
  
  {from: '<label class="form-label">Son tarih</label>', to: '<label class="form-label" data-i18n="lblUntil">Son tarih</label>'},
  {from: '<label class="form-label">Notlar (opsiyonel)</label>', to: '<label class="form-label" data-i18n="lblNotes">Notlar (opsiyonel)</label>'},
  {from: 'placeholder="Eklemek istediğin notlar..."', to: 'placeholder="Eklemek istediğin notlar..." data-i18n="plcNotes"'},
  
  {from: '<span class="paid-toggle-label">Ödendi mi?</span>', to: '<span class="paid-toggle-label" data-i18n="lblPaid">Ödendi mi?</span>'},
  {from: '<button class="btn-submit" id="submitBtn" onclick="saveGig()">Kaydet</button>', to: '<button class="btn-submit" id="submitBtn" onclick="saveGig()" data-i18n="btnSave">Kaydet</button>'},

  // Confirm
  {from: '<div class="confirm-title" id="confirmTitle">Emin misin?</div>', to: '<div class="confirm-title" id="confirmTitle" data-i18n="confirmTitle">Emin misin?</div>'},
  {from: '<div class="confirm-text"  id="confirmText">Bu işlemi geri alamazsın.</div>', to: '<div class="confirm-text"  id="confirmText" data-i18n="confirmText">Bu işlemi geri alamazsın.</div>'},
  {from: '<button class="btn-confirm cancel" onclick="closeConfirm()">İptal</button>', to: '<button class="btn-confirm cancel" onclick="closeConfirm()" data-i18n="btnCancel">İptal</button>'},
  {from: '<button class="btn-confirm danger"  id="confirmOkBtn">Sil</button>', to: '<button class="btn-confirm danger"  id="confirmOkBtn" data-i18n="btnDelete">Sil</button>'}
];

replacements.forEach(r => {
  html = html.replace(r.from, r.to);
});

// Javascript Replacements
const jsReplacements = [
  {
    from: `document.getElementById('modalTitle').textContent = 'Yeni İş';`,
    to: `document.getElementById('modalTitle').textContent = T.modalTitle;`
  },
  {
    from: `document.getElementById('submitBtn').textContent  = 'Kaydet';`,
    to: `document.getElementById('submitBtn').textContent  = T.btnSave;`
  },
  {
    from: `const feeTxt = t.fee ? \`\${SYM[t.currency]||''}\${t.fee}\` : 'Ücret yok';`,
    to: `const feeTxt = t.fee ? \`\${SYM[t.currency]||''}\${t.fee}\` : T.chipFeeNone;`
  },
  {
    from: `onclick="setFilter('all')">Tümü</div>`,
    to: `onclick="setFilter('all')">\${T.all}</div>`
  },
  {
    from: '<div class="empty-state"><div class="empty-icon">🎵</div><div class="empty-title">Henüz iş yok</div><div class="empty-text">Sağ üstteki "İş Ekle" butonuyla<br>ilk işini ekle.</div></div>',
    to: '<div class="empty-state"><div class="empty-icon">🎵</div><div class="empty-title">${T.noGigs}</div><div class="empty-text">${T.noGigsAdd}</div></div>'
  },
  {
    from: '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Bekleyen alacak yok</div><div class="empty-text">Tüm ödemeler tamamlanmış görünüyor.</div></div>',
    to: '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">${T.noUnpaid}</div><div class="empty-text">${T.noUnpaidYet}</div></div>'
  },
  {
    from: '<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">Ödenmiş iş yok</div><div class="empty-text">Henüz ödemesi alınan bir iş yok.</div></div>',
    to: '<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">${T.noPaid}</div><div class="empty-text">${T.noPaidYet}</div></div>'
  },
  {
    from: '<div class="section-label">Aylık Kazançlar</div>',
    to: '<div class="section-label">${T.sumMonthly}</div>'
  },
  {
    from: '<div class="section-label">Yıllık Toplamlar</div>',
    to: '<div class="section-label">${T.sumYearly}</div>'
  },
  {
    from: `showToast(gig.paid ? '✓ Ödendi olarak işaretlendi' : '○ Ödenmemiş olarak işaretlendi');`,
    to: `showToast(gig.paid ? T.toastPaid : T.toastUnpaid);`
  },
  {
    from: `'<span style="color:var(--text-3);font-style:italic;font-weight:500;">Mekan yok</span>'`,
    to: `\`<span style="color:var(--text-3);font-style:italic;font-weight:500;">\${T.valNoVenue}</span>\``
  },
  {
    from: `'<span style="color:var(--text-3);font-weight:400;font-style:italic">Sanatçı yok</span>'`,
    to: `\`<span style="color:var(--text-3);font-weight:400;font-style:italic">\${T.valNoArtist}</span>\``
  },
  {
    from: `\${gig.paid ? '✓ Ödendi' : '○ Bekliyor'}`,
    to: `\${gig.paid ? T.paidDone : T.unpaidWait}`
  },
  {
    from: "✏️ Düzenle",
    to: "${T.gigEdit}"
  },
  {
    from: "📅 Takvim",
    to: "${T.gigCalendar}"
  },
  {
    from: "🗑 Sil",
    to: "${T.gigDelete}"
  },
  {
    from: `showConfirm('İsmi Temizle', \`'\${value}' isimli \${lbl} listenden ve ilgili tüm iş kayıtlarından silmek istediğine emin misin? (İşler silinmez, sadece bu isim temizlenir)\`, () => {`,
    to: `showConfirm(T.filterClearTitle, T.filterClearText.replace('{val}', value).replace('{lbl}', lbl), () => {`
  },
  {
    from: `showToast(\`✓ İsmi \${count} kayıttan temizlendi\`);`,
    to: `showToast(T.toastClear.replace('{count}', count));`
  }
];

jsReplacements.forEach(r => {
  html = html.replace(r.from, r.to);
});

// Fix string literal quotes for valNoVenue & valNoArtist replacement
html = html.replace(/gig\.venue \? escHtml\(gig\.venue\) \: '<span style=\"color:var\(--text-3\);font-style:italic;font-weight:500;\">Mekan yok<\/span>'/, 'gig.venue ? escHtml(gig.venue) : `<span style="color:var(--text-3);font-style:italic;font-weight:500;">${T.valNoVenue}</span>`');
html = html.replace(/gig\.artist \? escHtml\(gig\.artist\) \: '<span style=\"color:var\(--text-3\);font-weight:400;font-style:italic\">Sanatçı yok<\/span>'/, 'gig.artist ? escHtml(gig.artist) : `<span style="color:var(--text-3);font-weight:400;font-style:italic">${T.valNoArtist}</span>`');

fs.writeFileSync('index.html', html, 'utf8');
console.log('I18N injected successfully.');
