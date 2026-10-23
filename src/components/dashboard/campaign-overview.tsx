'use client';

import { Megaphone, PauseCircle, PlayCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CampaignOverviewProps {
  active: number;
  paused: number;
  completed: number;
}

export function CampaignOverview({ active, paused, completed }: CampaignOverviewProps) {
  const items = [
    {
      label: 'Active sequences',
      value: active,
      icon: PlayCircle,
      hint: 'Awaiting reply / next touch',
      className: 'text-primary',
    },
    {
      label: 'Paused on reply',
      value: paused,
      icon: PauseCircle,
      hint: 'Customer responded',
      className: 'text-foreground',
    },
    {
      label: 'Completed / booked',
      value: completed,
      icon: CheckCircle2,
      hint: 'Converted or finished',
      className: 'text-success',
    },
  ];

  return (
    <section
      className="glass-card rounded-2xl p-4 sm:p-5 animate-slide-up"
      aria-labelledby="campaigns-heading"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 id="campaigns-heading" className="text-base sm:text-lg font-bold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" aria-hidden />
            Multi-touch campaigns
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Follow-up sequences for non-responders — pauses automatically on reply
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border/50 bg-surface/50 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <item.icon className={cn('w-5 h-5', item.className)} aria-hidden />
              <span className="font-mono text-2xl font-bold text-foreground">{item.value}</span>
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">{item.label}</div>
            <div className="text-xs text-muted-foreground">{item.hint}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
