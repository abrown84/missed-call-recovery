// @ts-nocheck
'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { LeadsTable } from '@/components/dashboard/leads-table';
import { LeadDetail } from '@/components/dashboard/lead-detail';
import { CampaignOverview } from '@/components/dashboard/campaign-overview';
import { ChatWidget } from '@/components/chat/chat-widget';
import { AppShell } from '@/components/layout/app-shell';
import { StatsCardsSkeleton, LeadsTableSkeleton } from '@/components/ui/skeleton';
import { useRealtimeLeads } from '@/hooks/use-realtime-leads';
import { RefreshCw, Search, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEMO_BUSINESS_ID = 'demo-business-id';

interface Lead {
  id: string;
  caller_phone: string;
  status: 'pending' | 'responded' | 'qualified' | 'escalated' | 'converted' | 'lost' | 'spam';
  urgency: 'emergency' | 'high' | 'normal' | 'low' | null;
  issue: string | null;
  sms_response_text: string | null;
  created_at: string;
  escalated_at: string | null;
  converted_at: string | null;
  sms_messages?: Array<{
    id: string;
    direction: 'inbound' | 'outbound';
    body: string;
    sent_at: string;
  }>;
}

interface Stats {
  missedCalls: number;
  smsDelivered: number;
  responses: number;
  responseRate: number;
  emergencies: number;
  recoveredLeads: number;
  estimatedRevenue: number;
}

const DEMO_STATS: Stats = {
  missedCalls: 47,
  smsDelivered: 45,
  responses: 28,
  responseRate: 60,
  emergencies: 5,
  recoveredLeads: 18,
  estimatedRevenue: 6300,
};

const DEMO_LEADS: Lead[] = [
  {
    id: '1',
    caller_phone: '+15551234567',
    status: 'escalated',
    urgency: 'emergency',
    issue: 'Basement flooding, water everywhere',
    sms_response_text: 'Help! My basement is flooding and water is coming up through the drain!',
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
    escalated_at: new Date(Date.now() - 12 * 60000).toISOString(),
    converted_at: null,
    sms_messages: [
      {
        id: 'm1',
        direction: 'outbound',
        body: 'Hi, this is ABC Plumbing. We noticed we missed your call. What plumbing issue can we help you with today?',
        sent_at: new Date(Date.now() - 14 * 60000).toISOString(),
      },
      {
        id: 'm2',
        direction: 'inbound',
        body: 'Help! My basement is flooding and water is coming up through the drain!',
        sent_at: new Date(Date.now() - 13 * 60000).toISOString(),
      },
    ],
  },
  {
    id: '2',
    caller_phone: '+15559876543',
    status: 'qualified',
    urgency: 'high',
    issue: 'No hot water, water heater not working',
    sms_response_text: 'Water heater stopped working this morning. No hot water at all.',
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    escalated_at: null,
    converted_at: null,
    sms_messages: [
      {
        id: 'm3',
        direction: 'outbound',
        body: 'Hi, this is ABC Plumbing. We noticed we missed your call. What plumbing issue can we help you with today?',
        sent_at: new Date(Date.now() - 2 * 3600000 + 60000).toISOString(),
      },
      {
        id: 'm4',
        direction: 'inbound',
        body: 'Water heater stopped working this morning. No hot water at all.',
        sent_at: new Date(Date.now() - 2 * 3600000 + 180000).toISOString(),
      },
    ],
  },
  {
    id: '3',
    caller_phone: '+15555551234',
    status: 'converted',
    urgency: 'normal',
    issue: 'Dripping faucet in kitchen',
    sms_response_text: 'Kitchen faucet has been dripping for a few days. Would like to get it fixed.',
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    escalated_at: null,
    converted_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    sms_messages: [],
  },
  {
    id: '4',
    caller_phone: '+15553334444',
    status: 'pending',
    urgency: null,
    issue: null,
    sms_response_text: null,
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    escalated_at: null,
    converted_at: null,
    sms_messages: [
      {
        id: 'm5',
        direction: 'outbound',
        body: 'Hi, this is ABC Plumbing. We noticed we missed your call. What plumbing issue can we help you with today?',
        sent_at: new Date(Date.now() - 29 * 60000).toISOString(),
      },
    ],
  },
  {
    id: '5',
    caller_phone: '+15552223333',
    status: 'qualified',
    urgency: 'low',
    issue: 'Quote request for bathroom remodel',
    sms_response_text: 'Looking for a quote on a bathroom remodel. Can you come out next week?',
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    escalated_at: null,
    converted_at: null,
    sms_messages: [],
  },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>(DEMO_STATS);
  const [leads, setLeads] = useState<Lead[]>(DEMO_LEADS);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const handleLeadInsert = useCallback((newLead: Lead) => {
    setLeads((prev) => [newLead, ...prev]);
  }, []);

  const handleLeadUpdate = useCallback((updatedLead: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
    setSelectedLead((prev) => (prev?.id === updatedLead.id ? updatedLead : prev));
  }, []);

  const handleLeadDelete = useCallback((deletedId: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== deletedId));
    setSelectedLead((prev) => (prev?.id === deletedId ? null : prev));
  }, []);

  useRealtimeLeads({
    businessId: DEMO_BUSINESS_ID,
    onInsert: handleLeadInsert,
    onUpdate: handleLeadUpdate,
    onDelete: handleLeadDelete,
  });

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesPhone = lead.caller_phone.toLowerCase().includes(query);
        const matchesIssue = lead.issue?.toLowerCase().includes(query);
        const matchesResponse = lead.sms_response_text?.toLowerCase().includes(query);
        if (!matchesPhone && !matchesIssue && !matchesResponse) return false;
      }
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (urgencyFilter !== 'all') {
        if (urgencyFilter === 'none' && lead.urgency !== null) return false;
        if (urgencyFilter !== 'none' && lead.urgency !== urgencyFilter) return false;
      }
      return true;
    });
  }, [leads, searchQuery, statusFilter, urgencyFilter]);

  const campaignStats = useMemo(() => {
    const active = leads.filter((l) => l.status === 'pending').length;
    const paused = leads.filter((l) =>
      ['responded', 'qualified', 'escalated'].includes(l.status)
    ).length;
    const completed = leads.filter((l) =>
      ['converted', 'lost', 'spam'].includes(l.status)
    ).length;
    return { active, paused, completed };
  }, [leads]);

  const activeFilterCount = [statusFilter !== 'all', urgencyFilter !== 'all'].filter(Boolean).length;

  const fetchData = useCallback(async (currentPeriod: 'day' | 'week' | 'month', mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const statsRes = await fetch(
        `/api/stats?businessId=${DEMO_BUSINESS_ID}&period=${currentPeriod}`
      );
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success) setStats(statsData.data);
      }

      const leadsRes = await fetch(`/api/leads?businessId=${DEMO_BUSINESS_ID}&limit=20`);
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        if (leadsData.success && leadsData.data?.length > 0) {
          setLeads(leadsData.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const mode = initialLoadDone.current ? 'refresh' : 'initial';
    (async () => {
      if (!cancelled) {
        await fetchData(period, mode);
        initialLoadDone.current = true;
      }
    })();
    const interval = setInterval(() => {
      if (!cancelled) fetchData(period, 'refresh');
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [period, fetchData]);

  const handleMarkConverted = async (leadId: string) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, status: 'converted' as const, converted_at: new Date().toISOString() }
          : l
      )
    );
    setSelectedLead(null);
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'converted' }),
      });
      if (!response.ok) fetchData(period);
    } catch {
      fetchData(period);
    }
  };

  const handleEscalate = async (leadId: string) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, status: 'escalated' as const, escalated_at: new Date().toISOString() }
          : l
      )
    );
    setSelectedLead(null);
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'escalated' }),
      });
      if (!response.ok) fetchData(period);
    } catch {
      fetchData(period);
    }
  };

  const headerActions = (
    <>
      <div
        className="hidden sm:flex bg-surface/70 rounded-xl p-1 border border-border/50"
        role="group"
        aria-label="Time period"
      >
        {(['day', 'week', 'month'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1.5 text-sm font-semibold rounded-lg transition-all',
              period === p
                ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-soft'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => fetchData(period, 'refresh')}
        disabled={isRefreshing || isLoading}
        className="btn-ghost"
        aria-label="Refresh data"
        title="Refresh data"
      >
        <RefreshCw className={cn('w-5 h-5', (isRefreshing || isLoading) && 'animate-spin')} />
      </button>
    </>
  );

  return (
    <>
      <AppShell actions={headerActions}>
        <div className="space-y-6 sm:space-y-8">
          {/* Mobile period selector */}
          <div
            className="sm:hidden flex bg-surface/70 rounded-xl p-1 border border-border/50"
            role="group"
            aria-label="Time period"
          >
            {(['day', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition-all',
                  period === p
                    ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {isLoading ? (
            <>
              <StatsCardsSkeleton />
              <LeadsTableSkeleton />
            </>
          ) : (
            <>
              <StatsCards stats={stats} />
              <CampaignOverview {...campaignStats} />

              <div className="glass-card rounded-2xl p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
                      aria-hidden
                    />
                    <input
                      type="search"
                      placeholder="Search by phone, issue, or message…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="field-input pl-11 pr-10"
                      aria-label="Search leads"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                      'btn-secondary',
                      showFilters && 'border-primary/50 text-primary'
                    )}
                    aria-expanded={showFilters}
                  >
                    <Filter className="w-5 h-5" aria-hidden />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-primary text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </div>

                {showFilters && (
                  <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap gap-4 animate-fade-in">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="status-filter" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Status
                      </label>
                      <select
                        id="status-filter"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="field-input cursor-pointer min-w-[160px]"
                      >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="responded">Responded</option>
                        <option value="qualified">Qualified</option>
                        <option value="escalated">Escalated</option>
                        <option value="converted">Converted</option>
                        <option value="lost">Lost</option>
                        <option value="spam">Spam</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label htmlFor="urgency-filter" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Urgency
                      </label>
                      <select
                        id="urgency-filter"
                        value={urgencyFilter}
                        onChange={(e) => setUrgencyFilter(e.target.value)}
                        className="field-input cursor-pointer min-w-[160px]"
                      >
                        <option value="all">All urgencies</option>
                        <option value="emergency">Emergency</option>
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
                        <option value="none">Not classified</option>
                      </select>
                    </div>

                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter('all');
                          setUrgencyFilter('all');
                        }}
                        className="self-end text-sm text-danger hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}

                {(searchQuery || activeFilterCount > 0) && (
                  <div className="mt-3 text-sm text-muted-foreground" aria-live="polite">
                    Showing {filteredLeads.length} of {leads.length} leads
                  </div>
                )}
              </div>

              <LeadsTable
                leads={filteredLeads}
                onSelectLead={setSelectedLead}
                emptyTitle={searchQuery || activeFilterCount ? 'No matching leads' : 'No leads yet'}
                emptyDescription={
                  searchQuery || activeFilterCount
                    ? 'Try adjusting your search or filters.'
                    : 'Missed calls will appear here automatically once the BRWN device posts missed-call events.'
                }
              />
            </>
          )}
        </div>
      </AppShell>

      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onMarkConverted={handleMarkConverted}
          onEscalate={handleEscalate}
        />
      )}

      <ChatWidget businessId={DEMO_BUSINESS_ID} />
    </>
  );
}
