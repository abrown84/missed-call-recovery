// @ts-nocheck
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { cn } from '@/lib/utils';
import {
  PhoneOff,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  PieChart,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

interface StatDetail {
  period: string;
  value: number;
  change: number;
  changePercent: number;
}

interface DailyBreakdown {
  date: string;
  value: number;
}

const STAT_CONFIGS: Record<
  string,
  {
    title: string;
    icon: typeof PhoneOff;
    color: string;
    description: string;
    unit?: string;
  }
> = {
  'missed-calls': {
    title: 'Missed Calls',
    icon: PhoneOff,
    color: 'text-foreground',
    description: 'Total inbound calls that went unanswered',
  },
  'sms-sent': {
    title: 'SMS Sent',
    icon: MessageSquare,
    color: 'text-primary',
    description: 'Recovery messages sent to missed callers',
  },
  'response-rate': {
    title: 'Response Rate',
    icon: TrendingUp,
    color: 'text-success',
    description: 'Percentage of SMS that received a reply',
    unit: '%',
  },
  emergencies: {
    title: 'Emergencies',
    icon: AlertTriangle,
    color: 'text-danger',
    description: 'High-priority leads requiring immediate attention',
  },
  recovered: {
    title: 'Recovered Leads',
    icon: CheckCircle,
    color: 'text-success',
    description: 'Leads successfully converted into jobs',
  },
  revenue: {
    title: 'Estimated Revenue',
    icon: DollarSign,
    color: 'text-primary',
    description: 'Potential value from recovered leads',
    unit: '$',
  },
};

const DEMO_DAILY_DATA: DailyBreakdown[] = [
  { date: '2024-01-15', value: 8 },
  { date: '2024-01-16', value: 12 },
  { date: '2024-01-17', value: 6 },
  { date: '2024-01-18', value: 15 },
  { date: '2024-01-19', value: 9 },
  { date: '2024-01-20', value: 4 },
  { date: '2024-01-21', value: 3 },
];

const DEMO_PERIODS: StatDetail[] = [
  { period: 'Today', value: 7, change: 2, changePercent: 40 },
  { period: 'This Week', value: 47, change: 8, changePercent: 20 },
  { period: 'This Month', value: 156, change: -12, changePercent: -7 },
  { period: 'This Year', value: 1847, change: 234, changePercent: 14.5 },
];

function StatsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statType = searchParams.get('type') || 'missed-calls';
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [dailyData] = useState<DailyBreakdown[]>(DEMO_DAILY_DATA);
  const [periods] = useState<StatDetail[]>(DEMO_PERIODS);

  const config = STAT_CONFIGS[statType] || STAT_CONFIGS['missed-calls'];
  const Icon = config.icon;
  const maxValue = Math.max(...dailyData.map((d) => d.value));

  return (
    <AppShell
      title={config.title}
      subtitle={config.description}
      maxWidth="5xl"
      actions={
        <>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="btn-ghost"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div
            className="hidden sm:flex bg-surface/70 rounded-xl p-1 border border-border/50"
            role="group"
            aria-label="Time period"
          >
            {(['day', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPeriod(p)}
                className={cn(
                  'px-3 py-1.5 text-sm font-semibold rounded-lg transition-all',
                  selectedPeriod === p
                    ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-center gap-3 sm:hidden">
          <div className="p-3 rounded-xl bg-surface border border-border/50">
            <Icon className={cn('w-6 h-6', config.color)} aria-hidden />
          </div>
          <div
            className="flex-1 flex bg-surface/70 rounded-xl p-1 border border-border/50"
            role="group"
            aria-label="Time period"
          >
            {(['day', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPeriod(p)}
                className={cn(
                  'flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg',
                  selectedPeriod === p
                    ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {periods.map((period) => (
            <div key={period.period} className="glass-card rounded-2xl p-4 sm:p-5">
              <div className="text-sm text-muted-foreground mb-1">{period.period}</div>
              <div className="stat-number text-2xl sm:text-3xl">
                {config.unit === '$' && '$'}
                {period.value.toLocaleString()}
                {config.unit === '%' && '%'}
              </div>
              <div
                className={cn(
                  'flex items-center gap-1 text-sm mt-2',
                  period.change >= 0 ? 'text-success' : 'text-danger'
                )}
              >
                {period.change >= 0 ? (
                  <ArrowUpRight className="w-4 h-4" aria-hidden />
                ) : (
                  <ArrowDownRight className="w-4 h-4" aria-hidden />
                )}
                <span>
                  {period.change >= 0 ? '+' : ''}
                  {period.changePercent.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        <section className="glass-card rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" aria-hidden />
              Daily breakdown
            </h2>
            <span className="text-sm text-muted-foreground">Last 7 days</span>
          </div>

          <div className="flex items-end justify-between gap-2 h-48 mt-4" role="img" aria-label="Daily values bar chart">
            {dailyData.map((day, index) => {
              const height = maxValue > 0 ? (day.value / maxValue) * 100 : 0;
              const date = new Date(day.date);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                  <div className="text-xs text-foreground font-medium">{day.value}</div>
                  <div className="w-full relative" style={{ height: '160px' }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-lg bg-gradient-to-t from-primary to-accent transition-all duration-500"
                      style={{ height: `${height}%`, animationDelay: `${index * 0.1}s` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{dayName}</div>
                </div>
              );
            })}
          </div>
        </section>

        {statType === 'emergencies' && (
          <section className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-accent" aria-hidden />
              Emergency breakdown
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Flooding', value: 12, color: 'bg-accent' },
                { label: 'No Heat', value: 8, color: 'bg-primary' },
                { label: 'Gas Leak', value: 3, color: 'bg-danger' },
                { label: 'Other', value: 5, color: 'bg-muted-foreground/40' },
              ].map((item) => (
                <div key={item.label} className="p-4 rounded-xl bg-surface/70 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn('w-3 h-3 rounded-full', item.color)} aria-hidden />
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                  </div>
                  <div className="text-2xl font-bold">{item.value}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {statType === 'revenue' && (
          <section className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" aria-hidden />
              Revenue by service type
            </h2>
            <div className="space-y-4">
              {[
                { label: 'Emergency Repairs', value: 3200, percent: 50 },
                { label: 'Standard Service', value: 2100, percent: 33 },
                { label: 'Installations', value: 1000, percent: 17 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm">{item.label}</span>
                    <span className="text-sm font-medium text-primary">${item.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="glass-card rounded-2xl p-5 sm:p-6">
          <h2 className="text-lg font-bold mb-4">Quick actions</h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => router.push('/')} className="btn-secondary">
              View all leads
            </button>
            <button type="button" onClick={() => router.push('/settings')} className="btn-secondary">
              Settings
            </button>
            <button type="button" className="btn-secondary border-primary/30 text-primary">
              Export report
            </button>
          </div>
        </section>

        <section className="glass-card rounded-2xl p-5 sm:p-6">
          <h2 className="text-lg font-bold mb-4">Other stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(STAT_CONFIGS)
              .filter(([key]) => key !== statType)
              .map(([key, cfg]) => {
                const StatIcon = cfg.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => router.push(`/stats?type=${key}`)}
                    className="flex items-center gap-3 p-4 rounded-xl bg-surface/70 border border-border/50 hover:border-primary/30 transition-all text-left"
                  >
                    <StatIcon className={cn('w-5 h-5', cfg.color)} aria-hidden />
                    <span className="text-sm">{cfg.title}</span>
                  </button>
                );
              })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatsPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status">
      <Loader2 className="w-8 h-8 text-primary animate-spin" aria-label="Loading stats" />
    </div>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<StatsPageFallback />}>
      <StatsPageContent />
    </Suspense>
  );
}
