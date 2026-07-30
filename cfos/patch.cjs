const fs = require('fs');

let content = fs.readFileSync('client/src/pages/Home.tsx', 'utf-8');
content = content.replace(/\r\n/g, '\n');

const tableStart = '{debts.length === 0 ? (';
const tableIdx = content.indexOf(tableStart);
const tableEndStr = '              )}\n            </div>\n\n            {/* Butonlar';
const endIdx = content.indexOf(tableEndStr, tableIdx);

if (tableIdx === -1 || endIdx === -1) {
    console.error('Table bounds not found. tableIdx:', tableIdx, 'endIdx:', endIdx);
    process.exit(1);
}

// We want to capture up to and including `)}`
const actualEndIdx = endIdx + '              )}\n'.length - 1;

let tableCode = content.substring(tableIdx, actualEndIdx);
tableCode = tableCode.replace('debts.length === 0', 'items.length === 0');
tableCode = tableCode.replace(/\[\.\.\.debts\]/g, '[...items]');

const funcDef = `
  const renderDebtsTable = (items: Debt[]) => (
    <>
      ` + tableCode.trim() + `
    </>
  );

  return (
`;

// Replace original table with function call
content = content.substring(0, tableIdx) + '{renderDebtsTable(debts)}' + content.substring(actualEndIdx);
content = content.replace('  return (', funcDef);

// Inject state
const stateInjection = `
  const [ekstreModalOpen, setEkstreModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('json');
`;
content = content.replace("  const [exportFormat, setExportFormat] = useState('json');", stateInjection);

// Make row clickable
const dashboardTableRow = `<td className="py-5 px-6 flex items-center gap-3">
                        <CreditCard className="w-6 h-6 text-blue-400" /> 
                        <span className="font-medium">Ekstreler</span>
                      </td>`;

const newDashboardTableRow = `<td className="py-5 px-6 flex items-center gap-3 cursor-pointer hover:bg-white/5" onClick={() => setEkstreModalOpen(true)}>
                        <CreditCard className="w-6 h-6 text-blue-400" /> 
                        <span className="font-medium text-blue-400 underline decoration-blue-400/30 underline-offset-4">Ekstreler</span>
                      </td>`;
content = content.replace(dashboardTableRow, newDashboardTableRow);

// Inject Modal
const dialogCode = `
            <Dialog open={ekstreModalOpen} onOpenChange={setEkstreModalOpen}>
              <DialogContent className="max-w-5xl bg-[#0f172a] text-white border-white/10 max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-400" /> Ekstreler
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                  <div className="rounded-2xl border border-white/10 p-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {renderDebtsTable(debts.filter(d => d.id.startsWith('card_') || d.bankName))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>
`;

const dashboardIdx = content.indexOf('value="dashboard"');
const nextEndIdx = content.indexOf('          </TabsContent>', dashboardIdx);
content = content.substring(0, nextEndIdx) + dialogCode + content.substring(nextEndIdx + '          </TabsContent>'.length);

fs.writeFileSync('client/src/pages/Home.tsx', content, 'utf-8');
console.log('Patch applied successfully');
