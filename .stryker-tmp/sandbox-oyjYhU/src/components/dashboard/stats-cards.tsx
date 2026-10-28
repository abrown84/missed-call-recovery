// @ts-nocheck
'use client';

import { useRouter } from 'next/navigation';
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
  isLoading?: boolean;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const router = useRouter();

  const cards = [
    {
      title: 'Response Rate',
      value: `${stats.responseRate}%`,
      subtitle: `${stats.responses} / ${stats.smsDelivered} replied`,
      icon: TrendingUp,
      color: 'text-success',
      size: 'col-span-2 row-span-2',
      href: '/stats?type=response-rate',
      hero: true,
    },
    {
      title: 'Missed Calls',
      value: stats.missedCalls,
      subtitle: 'Total inbound',
      icon: PhoneOff,
      color: 'text-foreground',
      size: 'col-span-1',
      href: '/stats?type=missed-calls',
    },
    {
      title: 'SMS Sent',
      value: stats.smsDelivered,
      subtitle: 'Recovery messages',
      icon: MessageSquare,
      color: 'text-primary',
      size: 'col-span-1',
      href: '/stats?type=sms-sent',
    },
    {
      title: 'Emergencies',
      value: stats.emergencies,
      subtitle: 'High priority',
      icon: AlertTriangle,
      color: 'text-danger',
      size: 'col-span-1',
      href: '/stats?type=emergencies',
    },
    {
      title: 'Recovered',
      value: stats.recoveredLeads,
      subtitle: 'Converted leads',
      icon: CheckCircle,
      color: 'text-success',
      size: 'col-span-1',
      href: '/stats?type=recovered',
    },
    {
      title: 'Est. Revenue',
      value: `$${stats.estimatedRevenue.toLocaleString()}`,
      subtitle: 'Potential value',
      icon: DollarSign,
      color: 'text-primary',
      size: 'col-span-2',
      href: '/stats?type=revenue',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in">
      {cards.map((card, index) => (
        <button
          key={card.title}
          type="button"
          onClick={() => router.push(card.href)}
          className={cn(
            'stat-card group text-left w-full',
            card.size
          )}
          style={{
            animationDelay: `${index * 0.06}s`,
            animationFillMode: 'both',
          }}
        >
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex items-start justify-between">
              <div
                className={cn(
                  'p-2.5 sm:p-3 rounded-xl bg-muted/70 border border-border/50',
                  'group-hover:scale-105 transition-transform duration-300'
                )}
              >
                <card.icon className={cn('w-5 h-5 sm:w-6 sm:h-6', card.color)} strokeWidth={2.25} aria-hidden />
              </div>

              {card.hero && (
                <span className="text-xs font-medium text-success bg-success/15 px-2 py-1 rounded-md border border-success/25">
                  +12%
                </span>
              )}
            </div>

            <div className={cn('stat-number', card.hero && 'text-5xl sm:text-6xl')}>
              {card.value}
            </div>

            <div>
              <div className="text-sm font-semibold text-foreground">{card.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</div>
            </div>

            {card.hero && (
              <div className="mt-1" aria-hidden>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-success to-primary rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min(stats.responseRate, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
