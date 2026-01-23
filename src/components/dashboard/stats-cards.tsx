'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  PhoneOff,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  DollarSign,
} from 'lucide-react';

interface StatsCardsProps {
  stats: {
    missedCalls: number;
    smsDelivered: number;
    responses: number;
    responseRate: number;
    emergencies: number;
    recoveredLeads: number;
    estimatedRevenue: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: 'Missed Calls',
      value: stats.missedCalls,
      icon: PhoneOff,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
    {
      title: 'SMS Sent',
      value: stats.smsDelivered,
      icon: MessageSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Response Rate',
      value: `${stats.responseRate}%`,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Emergencies',
      value: stats.emergencies,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    {
      title: 'Recovered',
      value: stats.recoveredLeads,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
    },
    {
      title: 'Est. Revenue',
      value: `$${stats.estimatedRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-violet-600',
      bgColor: 'bg-violet-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', card.bgColor)}>
                <card.icon className={cn('w-5 h-5', card.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs text-gray-500">{card.title}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
