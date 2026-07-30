import { Card } from '@/components/ui/card';

interface PaymentStepCardProps {
  step: number;
  title: string;
  description: string;
  amount: number;
  color: string;
  icon: string;
}

export function PaymentStepCard({
  step,
  title,
  description,
  amount,
  color,
  icon,
}: PaymentStepCardProps) {
  return (
    <Card className="p-6 border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-start gap-4">
        <div className="text-3xl">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-lg font-semibold text-slate-900">
              Adım {step}: {title}
            </h4>
            <span className="text-2xl font-bold" style={{ color }}>
              {(amount / 1000).toFixed(1)}K ₺
            </span>
          </div>
          <p className="text-slate-600">{description}</p>
        </div>
      </div>
    </Card>
  );
}
