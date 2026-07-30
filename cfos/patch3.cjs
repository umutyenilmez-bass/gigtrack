const fs = require('fs');

function updateInterface(file) {
    let content = fs.readFileSync(file, 'utf-8');
    content = content.replace(/\r\n/g, '\n');
    const interfaceBody = `  isPredictedOnly?: boolean;
  archived?: boolean;
  statementDate?: string;
  carriedOverAmount?: number;
}`;
    content = content.replace(/  isPredictedOnly\?: boolean;\n\}/g, interfaceBody);
    fs.writeFileSync(file, content, 'utf-8');
}

updateInterface('shared/financialEngine.ts');
updateInterface('client/src/lib/financialCalculations.ts');
updateInterface('server/financialEngine.ts');

let homeContent = fs.readFileSync('client/src/pages/Home.tsx', 'utf-8');
homeContent = homeContent.replace(/\r\n/g, '\n');

// Add states for edit modal and rollover modal
const statesInjection = `
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
      const newDebt: Debt = {
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

`;

homeContent = homeContent.replace("const [activeTab, setActiveTab] = useState('dashboard');", statesInjection + "\n  const [activeTab, setActiveTab] = useState('dashboard');");

// Update renderDebtsTable to only show non-archived debts, and add Edit/Rollover buttons
const renderDebtsDef = "const renderDebtsTable = (items: Debt[]) => (";
const newRenderDebtsDef = `const renderDebtsTable = (items: Debt[]) => {
  const activeItems = items.filter(i => !i.archived);
  return (
`;
homeContent = homeContent.replace(renderDebtsDef, newRenderDebtsDef);

// Make items become activeItems in the table mapping
homeContent = homeContent.replace(/items\.length === 0/g, 'activeItems.length === 0');
homeContent = homeContent.replace(/\[\.\.\.items\]/g, '[...activeItems]');

// Find the Pay button in the table and add Edit/Rollover buttons next to it
const payButtonHtml = `<Button
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

const newButtonsHtml = payButtonHtml + `
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
homeContent = homeContent.replace(payButtonHtml, newButtonsHtml);

// Add carried over info to the name column
const nameColumn = `<div className="font-semibold text-white truncate max-w-[150px] sm:max-w-[200px]" title={debt.name}>
                                            {debt.name}
                                          </div>`;
const newNameColumn = nameColumn + `
                                          {debt.carriedOverAmount ? (
                                            <div className="text-[10px] text-purple-400 mt-0.5">
                                              Önceki Ekstreden Kalan: {formatCurrency(debt.carriedOverAmount)}
                                            </div>
                                          ) : null}`;
homeContent = homeContent.replace(nameColumn, newNameColumn);

// Close the renderDebtsTable function block
homeContent = homeContent.replace("                </div>\n              )}\n            </div>\n    </>\n  );", "                </div>\n              )}\n            </div>\n    </>\n  ); }");


// Add Modals to the end of the return statement
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
}
`;
homeContent = homeContent.replace("    </div>\n  );\n}", modalsCode);

fs.writeFileSync('client/src/pages/Home.tsx', homeContent, 'utf-8');
console.log("Patch3 applied successfully.");
