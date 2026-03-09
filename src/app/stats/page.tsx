'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
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

// Demo data
const STAT_CONFIGS: Record<string, {
  title: string;
  icon: typeof PhoneOff;
  color: string;
  description: string;
  unit?: string;
}> = {
  'missed-calls': {
    title: 'Missed Calls',
    icon: PhoneOff,
    color: 'text-[#E5DADA]',
    description: 'Total inbound calls that went unanswered',
  },
  'sms-sent': {
    title: 'SMS Sent',
    icon: MessageSquare,
    color: 'text-[#E59500]',
    description: 'Recovery messages sent to missed callers',
  },
  'response-rate': {
    title: 'Response Rate',
    icon: TrendingUp,
    color: 'text-emerald-400',
    description: 'Percentage of SMS that received a reply',
    unit: '%',
  },
  'emergencies': {
    title: 'Emergencies',
    icon: AlertTriangle,
    color: 'text-[#840032]',
    description: 'High-priority leads requiring immediate attention',
  },
  'recovered': {
    title: 'Recovered Leads',
    icon: CheckCircle,
    color: 'text-emerald-400',
    description: 'Leads successfully converted into jobs',
  },
  'revenue': {
    title: 'Estimated Revenue',
    icon: DollarSign,
    color: 'text-[#E59500]',
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
    <div className="min-h-screen relative">
      <div className="relative z-10">
        {/* Header */}
        <header className="glass-card border-b border-[#E5DADA]/10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/')}
                  className="p-2 rounded-lg hover:bg-[#E5DADA]/10 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-[#E5DADA]/70" />
                </button>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-3 rounded-xl bg-[#002642]/60 border border-[#E5DADA]/10'
                  )}>
                    <Icon className={cn('w-6 h-6', config.color)} strokeWidth={2} />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-[#E5DADA]">{config.title}</h1>
                    <p className="text-sm text-[#E5DADA]/60">{config.description}</p>
                  </div>
                </div>
              </div>

              {/* Period selector */}
              <div className="flex bg-[#002642]/50 backdrop-blur-sm rounded-xl p-1 border border-[#E5DADA]/10">
                {(['day', 'week', 'month'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPeriod(p)}
                    className={cn(
                      'px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200',
                      selectedPeriod === p
                        ? 'bg-gradient-to-r from-[#E59500] to-[#840032] text-white shadow-lg'
                        : 'text-[#E5DADA]/60 hover:text-[#E5DADA]'
                    )}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Period Comparison */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {periods.map((period) => (
              <div
                key={period.period}
                className="glass-card rounded-2xl p-5 hover:shadow-[0_0_30px_rgba(229,149,0,0.15)] transition-all duration-300"
              >
                <div className="text-sm text-[#E5DADA]/60 mb-1">{period.period}</div>
                <div className="stat-number text-3xl">
                  {config.unit === '$' && '$'}
                  {period.value.toLocaleString()}
                  {config.unit === '%' && '%'}
                </div>
                <div className={cn(
                  'flex items-center gap-1 text-sm mt-2',
                  period.change >= 0 ? 'text-emerald-400' : 'text-[#840032]'
                )}>
                  {period.change >= 0 ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  <span>
                    {period.change >= 0 ? '+' : ''}{period.changePercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#E5DADA] flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#E59500]" />
                Daily Breakdown
              </h2>
              <span className="text-sm text-[#E5DADA]/60">Last 7 days</span>
            </div>

            {/* Simple Bar Chart */}
            <div className="flex items-end justify-between gap-2 h-48 mt-4">
              {dailyData.map((day, index) => {
                const height = maxValue > 0 ? (day.value / maxValue) * 100 : 0;
                const date = new Date(day.date);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                    <div className="text-xs text-[#E5DADA] font-medium">{day.value}</div>
                    <div className="w-full relative" style={{ height: '160px' }}>
                      <div
                        className={cn(
                          'absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-500',
                          'bg-gradient-to-t from-[#E59500] to-[#840032]',
                          'hover:from-[#f5a520] hover:to-[#a01042]',
                          'cursor-pointer'
                        )}
                        style={{
                          height: `${height}%`,
                          animationDelay: `${index * 0.1}s`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-[#E5DADA]/60">{dayName}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats Breakdown by Type */}
          {statType === 'emergencies' && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-bold text-[#E5DADA] mb-6 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-[#840032]" />
                Emergency Breakdown
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Flooding', value: 12, color: 'bg-[#840032]' },
                  { label: 'No Heat', value: 8, color: 'bg-[#E59500]' },
                  { label: 'Gas Leak', value: 3, color: 'bg-red-500' },
                  { label: 'Other', value: 5, color: 'bg-[#E5DADA]/30' },
                ].map((item) => (
                  <div key={item.label} className="p-4 rounded-xl bg-[#002642]/50 border border-[#E5DADA]/10">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn('w-3 h-3 rounded-full', item.color)} />
                      <span className="text-sm text-[#E5DADA]/80">{item.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-[#E5DADA]">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {statType === 'revenue' && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-bold text-[#E5DADA] mb-6 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#E59500]" />
                Revenue by Service Type
              </h2>

              <div className="space-y-4">
                {[
                  { label: 'Emergency Repairs', value: 3200, percent: 50 },
                  { label: 'Standard Service', value: 2100, percent: 33 },
                  { label: 'Installations', value: 1000, percent: 17 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[#E5DADA]">{item.label}</span>
                      <span className="text-sm font-medium text-[#E59500]">${item.value.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-[#002642]/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#E59500] to-[#840032] rounded-full"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-[#E5DADA] mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push('/')}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium',
                  'bg-[#002642]/50 border border-[#E5DADA]/10',
                  'text-[#E5DADA]/70 hover:text-[#E5DADA] hover:border-[#E59500]/30',
                  'transition-all duration-200'
                )}
              >
                View All Leads
              </button>
              <button
                onClick={() => router.push('/settings')}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium',
                  'bg-[#002642]/50 border border-[#E5DADA]/10',
                  'text-[#E5DADA]/70 hover:text-[#E5DADA] hover:border-[#E59500]/30',
                  'transition-all duration-200'
                )}
              >
                Settings
              </button>
              <button
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium',
                  'bg-gradient-to-r from-[#E59500]/20 to-[#840032]/20',
                  'border border-[#E59500]/30 text-[#E59500]',
                  'hover:from-[#E59500]/30 hover:to-[#840032]/30',
                  'transition-all duration-200'
                )}
              >
                Export Report
              </button>
            </div>
          </div>

          {/* Stat Navigation */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-[#E5DADA] mb-4">Other Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(STAT_CONFIGS)
                .filter(([key]) => key !== statType)
                .map(([key, cfg]) => {
                  const StatIcon = cfg.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => router.push(`/stats?type=${key}`)}
                      className={cn(
                        'flex items-center gap-3 p-4 rounded-xl',
                        'bg-[#002642]/50 border border-[#E5DADA]/10',
                        'hover:border-[#E59500]/30 hover:bg-[#002642]/70',
                        'transition-all duration-200 text-left'
                      )}
                    >
                      <StatIcon className={cn('w-5 h-5', cfg.color)} />
                      <span className="text-sm text-[#E5DADA]">{cfg.title}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatsPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#E59500] animate-spin" />
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
