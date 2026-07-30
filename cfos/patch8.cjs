const fs = require('fs');

let content = fs.readFileSync('client/src/pages/Home.tsx', 'utf-8');

// 1. Make Tabs controlled
content = content.replace('<Tabs defaultValue="dashboard"', '<Tabs value={activeTab} onValueChange={setActiveTab}');

// 2. Make Ekstreler row clickable
const dashboardTableRow = `<td className="py-5 px-6 flex items-center gap-3">
                        <CreditCard className="w-6 h-6 text-blue-400" /> 
                        <span className="font-medium">Ekstreler</span>
                      </td>`;

const newDashboardTableRow = `<td className="py-5 px-6 flex items-center gap-3 cursor-pointer hover:bg-white/5" onClick={() => setActiveTab('ekstreler')}>
                        <CreditCard className="w-6 h-6 text-blue-400" /> 
                        <span className="font-medium text-blue-400 underline decoration-blue-400/30 underline-offset-4">Ekstreler</span>
                      </td>`;
if (content.indexOf(dashboardTableRow) !== -1) {
    content = content.replace(dashboardTableRow, newDashboardTableRow);
} else {
    // try with \r\n
    content = content.replace(dashboardTableRow.replace(/\n/g, '\r\n'), newDashboardTableRow);
}

// 3. Create the new TabsContent for Ekstreler
const ekstrelerTabContent = `
            <TabsContent value="ekstreler" className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('dashboard')} className="text-slate-400 hover:text-white px-2">
                  ← Geri
                </Button>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-6 h-6 text-blue-400" /> Ekstreler Detayı
                </h2>
              </div>
              <div className="rounded-2xl border border-white/10 p-0 overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                {renderDebtsTable((financialData.debtsList || []).filter(d => d.id.startsWith('card_') || d.bankName))}
              </div>
            </TabsContent>
`;

const dashboardIdx = content.indexOf('value="dashboard"');
const nextEndIdxStr = '            </TabsContent>';
const nextEndIdx = content.indexOf(nextEndIdxStr, dashboardIdx);
if (nextEndIdx !== -1) {
    content = content.substring(0, nextEndIdx) + nextEndIdxStr + '\n' + ekstrelerTabContent + content.substring(nextEndIdx + nextEndIdxStr.length);
}

// 4. Change renderDebtsTable where it's used inside the "debts" tab to use renderDebtsTable(debts)
// Wait! `patch7.cjs` did NOT extract `renderDebtsTable` to a function that could be called outside its current spot?
// Let me look at what `patch7.cjs` did!
// Ah, `patch7.cjs` replaced `const renderDebtsTable = (items: Debt[]) => (` but DID NOT extract it to the top!
// It's just sitting in the middle of `TabsContent value="debts"`!
// If it's sitting inside `TabsContent value="debts"`, then `renderDebtsTable` is NOT available in `TabsContent value="ekstreler"` because it's defined INSIDE the JSX of `value="debts"`!
// Actually, `renderDebtsTable` was already a local function before `return (` of the `Home` component!
// Let me verify if `renderDebtsTable` is defined BEFORE the `return (` of `Home` component!
// If it is, then `TabsContent value="ekstreler"` can just call it!

fs.writeFileSync('client/src/pages/Home.tsx', content, 'utf-8');
console.log('Patch8 applied successfully');
