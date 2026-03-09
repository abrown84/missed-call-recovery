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
}

export function StatsCards({ stats }: StatsCardsProps) {
  const router = useRouter();

  const cards = [
    {
      title: 'Response Rate',
      value: `${stats.responseRate}%`,
      subtitle: `${stats.responses} / ${stats.smsDelivered} replied`,
      icon: TrendingUp,
      color: 'text-emerald-400',
      glowColor: 'hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]',
      size: 'col-span-2 row-span-2', // Hero card
      href: '/stats?type=response-rate',
    },
    {
      title: 'Missed Calls',
      value: stats.missedCalls,
      subtitle: 'Total inbound',
      icon: PhoneOff,
      color: 'text-[#E5DADA]',
      glowColor: 'hover:shadow-[0_0_20px_rgba(229,218,218,0.2)]',
      size: 'col-span-1',
      href: '/stats?type=missed-calls',
    },
    {
      title: 'SMS Sent',
      value: stats.smsDelivered,
      subtitle: 'Recovery messages',
      icon: MessageSquare,
      color: 'text-[#E59500]',
      glowColor: 'hover:shadow-[0_0_20px_rgba(229,149,0,0.35)]',
      size: 'col-span-1',
      href: '/stats?type=sms-sent',
    },
    {
      title: 'Emergencies',
      value: stats.emergencies,
      subtitle: 'High priority',
      icon: AlertTriangle,
      color: 'text-[#e07090]',
      glowColor: 'hover:shadow-[0_0_20px_rgba(132,0,50,0.4)]',
      size: 'col-span-1',
      href: '/stats?type=emergencies',
    },
    {
      title: 'Recovered',
      value: stats.recoveredLeads,
      subtitle: 'Converted leads',
      icon: CheckCircle,
      color: 'text-emerald-400',
      glowColor: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]',
      size: 'col-span-1',
      href: '/stats?type=recovered',
    },
    {
      title: 'Est. Revenue',
      value: `$${stats.estimatedRevenue.toLocaleString()}`,
      subtitle: 'Potential value',
      icon: DollarSign,
      color: 'text-[#E59500]',
      glowColor: 'hover:shadow-[0_0_25px_rgba(229,149,0,0.4)]',
      size: 'col-span-2',
      href: '/stats?type=revenue',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
      {cards.map((card, index) => (
        <div
          key={card.title}
          onClick={() => router.push(card.href)}
          className={cn(
            'stat-card group cursor-pointer',
            card.glowColor,
            card.size
          )}
          style={{
            animationDelay: `${index * 0.1}s`,
            animationFillMode: 'both',
          }}
        >
          <div className="flex flex-col h-full justify-between">
            {/* Icon */}
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                'p-3 rounded-xl bg-white/5 backdrop-blur-sm',
                'border border-white/10',
                'group-hover:scale-110 transition-transform duration-300'
              )}>
                <card.icon className={cn('w-6 h-6', card.color)} strokeWidth={2.5} />
              </div>

              {/* Trend indicator (optional - can add later) */}
              {card.title === 'Response Rate' && (
                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/15 px-2 py-1 rounded-full border border-emerald-500/25">
                  +12%
                </span>
              )}
            </div>

            {/* Value */}
            <div className={cn(
              'stat-number',
              card.size.includes('row-span-2') && 'text-6xl'
            )}>
              {card.value}
            </div>

            {/* Title & Subtitle */}
            <div className="mt-3">
              <div className="text-sm font-semibold text-[#E5DADA]">
                {card.title}
              </div>
              <div className="text-xs text-[#E5DADA]/60 mt-0.5">
                {card.subtitle}
              </div>
            </div>

            {/* Progress bar for hero card */}
            {card.size.includes('row-span-2') && (
              <div className="mt-4">
                <div className="h-2 bg-[#002642]/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-[#E59500] rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${stats.responseRate}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
