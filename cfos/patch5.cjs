const fs = require('fs');

let content = fs.readFileSync('client/src/pages/Home.tsx', 'utf-8');
content = content.replace(/\r\n/g, '\n');

// 1. Inject States
const stateInjection = `
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [rolloverDebt, setRolloverDebt] = useState<Debt | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', balance: '', apr: '', minimumPayment: '' });
  
  const handleEditSubmit = async () => {
    if (!editingDebt) return;
    const updatedDebts = (financialData.debtsList || []).map(d => {
      if (d.id === editingDebt.id) {
        return {
          ...d,
          name: editFormData.name,
          balance: parseFloat(editFormData.balance) || 0,
          apr: parseFloat(editFormData.apr) || 0,
          minimumPayment: parseFloat(editFormData.minimumPayment) || 0
        };
      }
      return d;
    });
    const newFd = { ...financialData, debtsList: updatedDebts };
    setFinancialData(newFd);
    await saveData(newFd, expenses);
    setEditingDebt(null);
  };

  const handleRollover = async () => {
    if (!rolloverDebt) return;
    
    let updatedDebts = [...(financialData.debtsList || [])];
    
    // Archive current debt
    updatedDebts = updatedDebts.map(d => {
      if (d.id === rolloverDebt.id) {
        return { ...d, archived: true };
      }
      return d;
    });
    
    // If there is remaining balance, create a new cycle debt
    if (rolloverDebt.balance > 0) {
      const newDebt = {
        ...rolloverDebt,
        id: 'card_' + Date.now(),
        archived: false,
        carriedOverAmount: rolloverDebt.balance,
        statementDate: new Date().toISOString()
      };
      updatedDebts.push(newDebt);
    }
    
    const newFd = { ...financialData, debtsList: updatedDebts };
    setFinancialData(newFd);
    await saveData(newFd, expenses);
    setRolloverDebt(null);
  };

  const [activeTab, setActiveTab] = useState('dashboard');`;

content = content.replace("  const [activeTab, setActiveTab] = useState('dashboard');", stateInjection);

// 2. Filter items in renderDebtsTable
content = content.replace("const renderDebtsTable = (items: Debt[]) => (", "const renderDebtsTable = (items: Debt[]) => {\n  const activeItems = items.filter(i => !i.archived);\n  return (");
content = content.replace(/{items\.length === 0/g, "{activeItems.length === 0");
content = content.replace(/\[\.\.\.items\]/g, "[...activeItems]");

// 3. Inject Edit / Rollover buttons
const payButtonStr = `<Button
                                            size="sm"
                                            className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPaymentAmount('');
                                              setPaymentCurrency('TRY');
                                              setSelectedDebt(debt);
                                              setPaymentModalOpen(true);
                                            }}
                                          >
                                            <TrendingUp className="w-4 h-4 mr-1" />
                                            Öde
                                          </Button>`;

const newButtonsHtml = payButtonStr + `
                                          <Button
                                            size="sm"
                                            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 ml-2"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditFormData({
                                                name: debt.name,
                                                balance: debt.balance.toString(),
                                                apr: debt.apr.toString(),
                                                minimumPayment: debt.minimumPayment.toString()
                                              });
                                              setEditingDebt(debt);
                                            }}
                                          >
                                            Düzenle
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 ml-2"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setRolloverDebt(debt);
                                            }}
                                          >
                                            Yeni Dönem
                                          </Button>`;
content = content.replace(payButtonStr, newButtonsHtml);

// 4. Update carried over amount text
const nameColumnHtml = `<div className="font-semibold text-white truncate max-w-[150px] sm:max-w-[200px]" title={debt.name}>
                                            {debt.name}
                                          </div>`;
const newNameColumnHtml = nameColumnHtml + `
                                          {debt.carriedOverAmount ? (
                                            <div className="text-[10px] text-purple-400 mt-0.5">
                                              Önceki Ekstreden Kalan: {formatCurrency(debt.carriedOverAmount)}
                                            </div>
                                          ) : null}`;
content = content.replace(nameColumnHtml, newNameColumnHtml);

// 5. Close renderDebtsTable curly brace
content = content.replace("                </div>\n              )}\n            </div>\n    </>\n  );", "                </div>\n              )}\n            </div>\n    </>\n  );\n}");

// 6. Inject modals at the end of the file
const modalsCode = `
      {/* Edit Debt Modal */}
      <Dialog open={!!editingDebt} onOpenChange={(open) => !open && setEditingDebt(null)}>
        <DialogContent className="bg-[#0f172a] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Ekstre Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-300">İsim</label>
              <Input value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Bakiye</label>
              <Input type="number" value={editFormData.balance} onChange={e => setEditFormData({...editFormData, balance: e.target.value})} className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Yıllık Faiz (%)</label>
              <Input type="number" value={editFormData.apr} onChange={e => setEditFormData({...editFormData, apr: e.target.value})} className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Asgari Ödeme</label>
              <Input type="number" value={editFormData.minimumPayment} onChange={e => setEditFormData({...editFormData, minimumPayment: e.target.value})} className="bg-white/5 border-white/10" />
            </div>
            <Button onClick={handleEditSubmit} className="w-full">Kaydet</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rollover Modal */}
      <Dialog open={!!rolloverDebt} onOpenChange={(open) => !open && setRolloverDebt(null)}>
        <DialogContent className="bg-[#0f172a] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Yeni Dönem Başlat</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-slate-300">
            <p className="mb-4">Bu ekstre için ayı kapatıp yeni döneme geçmek istiyor musunuz?</p>
            <p className="mb-4 text-sm text-slate-400">Ödenmemiş bakiye yeni aya <strong>Önceki Ekstreden Kalan Borç</strong> olarak devredilecek ve bu kayıt arşive kaldırılacaktır.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setRolloverDebt(null)}>İptal</Button>
              <Button onClick={handleRollover} className="bg-purple-600 hover:bg-purple-700">Yeni Dönemi Başlat</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}`;
const lastDiv = "    </div>\n  );\n}";
// Make sure to only replace the LAST occurrence
const lastIndex = content.lastIndexOf(lastDiv);
if (lastIndex !== -1) {
  content = content.substring(0, lastIndex) + modalsCode;
} else {
  console.error("Could not find the end of the file!");
}

fs.writeFileSync('client/src/pages/Home.tsx', content, 'utf-8');
console.log("Patch5 applied!");
