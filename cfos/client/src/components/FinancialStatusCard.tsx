import { Card } from '@/components/ui/card';
import { ReactNode } from 'react';

interface FinancialStatusCardProps {
  title: string;
  value: number;
  icon: ReactNode;
  color: 'blue' | 'orange' | 'green' | 'purple';
  format?: 'currency' | 'months' | 'percent';
  subtitle?: string;
}

const colorStyles = {
  blue: {
    border: 'border-l-blue-700',
    icon: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  orange: {
    border: 'border-l-orange-500',
    icon: 'text-orange-500',
    bg: 'bg-orange-50',
  },
  green: {
    border: 'border-l-green-600',
    icon: 'text-green-600',
    bg: 'bg-green-50',
  },
  purple: {
    border: 'border-l-purple-600',
    icon: 'text-purple-600',
    bg: 'bg-purple-50',
  },
};

export function FinancialStatusCard({
  title,
  value,
  icon,
  color,
  format = 'currency',
  subtitle,
}: FinancialStatusCardProps) {
  const styles = colorStyles[color];

  const formatValue = () => {
    switch (format) {
      case 'currency':
        return `${(value / 1000).toFixed(1)}K ₺`;
      case 'months':
        return `${Math.round(value)} ay`;
      case 'percent':
        return `${value.toFixed(1)}%`;
      default:
        return value.toFixed(0);
    }
  };

  return (
    <Card className={`p-6 border-l-4 ${styles.border} ${styles.bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{formatValue()}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-8 h-8 ${styles.icon}`}>{icon}</div>
      </div>
    </Card>
  );
}
