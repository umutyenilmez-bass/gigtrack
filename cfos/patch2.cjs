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

// Inject activeTab state
const stateInjection = `
  const [activeTab, setActiveTab] = useState('dashboard');
  const [exportFormat, setExportFormat] = useState('json');
`;
content = content.replace("  const [exportFormat, setExportFormat] = useState('json');", stateInjection);

// Make Tabs controlled
content = content.replace('<Tabs defaultValue="dashboard"', '<Tabs value={activeTab} onValueChange={setActiveTab}');

// Make Ekstreler row clickable
const dashboardTableRow = `<td className="py-5 px-6 flex items-center gap-3">
                        <CreditCard className="w-6 h-6 text-blue-400" /> 
                        <span className="font-medium">Ekstreler</span>
                      </td>`;

const newDashboardTableRow = `<td className="py-5 px-6 flex items-center gap-3 cursor-pointer hover:bg-white/5" onClick={() => setActiveTab('ekstreler')}>
                        <CreditCard className="w-6 h-6 text-blue-400" /> 
                        <span className="font-medium text-blue-400 underline decoration-blue-400/30 underline-offset-4">Ekstreler</span>
                      </td>`;
content = content.replace(dashboardTableRow, newDashboardTableRow);

// Create the new TabsContent for Ekstreler
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
              {renderDebtsTable(debts.filter(d => d.id.startsWith('card_') || d.bankName))}
            </div>
          </TabsContent>
`;

const dashboardIdx = content.indexOf('value="dashboard"');
const nextEndIdx = content.indexOf('          </TabsContent>', dashboardIdx);
content = content.substring(0, nextEndIdx) + '          </TabsContent>\n' + ekstrelerTabContent + content.substring(nextEndIdx + '          </TabsContent>'.length);

fs.writeFileSync('client/src/pages/Home.tsx', content, 'utf-8');
console.log('Patch2 applied successfully');
