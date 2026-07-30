import { Card } from '@/components/ui/card';

interface ExpenseCategory {
  name: string;
  amount: number;
  color: string;
}

interface ExpenseTableProps {
  categories: ExpenseCategory[];
  totalExpenses: number;
}

export function ExpenseTable({ categories, totalExpenses }: ExpenseTableProps) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Harcama Kategorileri</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-slate-900">Kategori</th>
              <th className="px-4 py-2 text-right font-semibold text-slate-900">Tutar (₺)</th>
              <th className="px-4 py-2 text-right font-semibold text-slate-900">% Toplam</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="px-4 py-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  {(item.amount as number).toLocaleString('tr-TR')} ₺
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {(((item.amount as number) / totalExpenses) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-semibold">
              <td className="px-4 py-3">Toplam Giderler</td>
              <td className="px-4 py-3 text-right text-slate-900">
                {totalExpenses.toLocaleString('tr-TR')} ₺
              </td>
              <td className="px-4 py-3 text-right text-slate-900">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
