'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { LeadsTable } from '@/components/dashboard/leads-table';
import { LeadDetail } from '@/components/dashboard/lead-detail';
import { ChatWidget } from '@/components/chat/chat-widget';
import { createClient } from '@/lib/supabase-browser';
import { useRealtimeLeads } from '@/hooks/use-realtime-leads';
import { RefreshCw, LogOut, Activity, Search, Filter, X, Settings } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// Demo business ID - replace with auth in production
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

// Demo data for initial display
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
        body: "Hi, this is ABC Plumbing. We noticed we missed your call. What plumbing issue can we help you with today?",
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
    sms_response_text: "Water heater stopped working this morning. No hot water at all.",
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    escalated_at: null,
    converted_at: null,
    sms_messages: [
      {
        id: 'm3',
        direction: 'outbound',
        body: "Hi, this is ABC Plumbing. We noticed we missed your call. What plumbing issue can we help you with today?",
        sent_at: new Date(Date.now() - 2 * 3600000 + 60000).toISOString(),
      },
      {
        id: 'm4',
        direction: 'inbound',
        body: "Water heater stopped working this morning. No hot water at all.",
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
    sms_response_text: "Kitchen faucet has been dripping for a few days. Would like to get it fixed.",
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
        body: "Hi, this is ABC Plumbing. We noticed we missed your call. What plumbing issue can we help you with today?",
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
    sms_response_text: "Looking for a quote on a bathroom remodel. Can you come out next week?",
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
  const [isLoading, setIsLoading] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Real-time lead updates
  const handleLeadInsert = useCallback((newLead: Lead) => {
    setLeads((prev) => [newLead, ...prev]);
  }, []);

  const handleLeadUpdate = useCallback((updatedLead: Lead) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === updatedLead.id ? updatedLead : l))
    );
    // Update selected lead if it's the one being viewed
    setSelectedLead((prev) =>
      prev?.id === updatedLead.id ? updatedLead : prev
    );
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

  // Filtered leads based on search and filters
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesPhone = lead.caller_phone.toLowerCase().includes(query);
        const matchesIssue = lead.issue?.toLowerCase().includes(query);
        const matchesResponse = lead.sms_response_text?.toLowerCase().includes(query);
        if (!matchesPhone && !matchesIssue && !matchesResponse) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all' && lead.status !== statusFilter) {
        return false;
      }

      // Urgency filter
      if (urgencyFilter !== 'all') {
        if (urgencyFilter === 'none' && lead.urgency !== null) {
          return false;
        } else if (urgencyFilter !== 'none' && lead.urgency !== urgencyFilter) {
          return false;
        }
      }

      return true;
    });
  }, [leads, searchQuery, statusFilter, urgencyFilter]);

  const activeFilterCount = [
    statusFilter !== 'all',
    urgencyFilter !== 'all',
  ].filter(Boolean).length;

  useEffect(() => {
    supabase.auth.getUser().then((result: { data: { user: { email?: string } | null } }) => {
      setUserEmail(result.data?.user?.email || null);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const fetchData = useCallback(async (currentPeriod: 'day' | 'week' | 'month') => {
    setIsLoading(true);
    try {
      // Fetch stats
      const statsRes = await fetch(
        `/api/stats?businessId=${DEMO_BUSINESS_ID}&period=${currentPeriod}`
      );
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success) {
          setStats(statsData.data);
        }
      }

      // Fetch leads
      const leadsRes = await fetch(`/api/leads?businessId=${DEMO_BUSINESS_ID}&limit=20`);
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        if (leadsData.success && leadsData.data?.length > 0) {
          setLeads(leadsData.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      // Keep demo data on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
    // Poll for updates every 30 seconds
    const interval = setInterval(() => fetchData(period), 30000);
    return () => clearInterval(interval);
  }, [period, fetchData]);

  const handleMarkConverted = async (leadId: string) => {
    // Update locally first (optimistic update)
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, status: 'converted' as const, converted_at: new Date().toISOString() }
          : l
      )
    );
    setSelectedLead(null);

    // API call to update lead status
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'converted' }),
      });

      if (!response.ok) {
        console.error('Failed to update lead status');
        // Revert optimistic update on error
        fetchData(period);
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      // Revert optimistic update on error
      fetchData(period);
    }
  };

  const handleEscalate = async (leadId: string) => {
    // Update locally first (optimistic update)
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, status: 'escalated' as const, escalated_at: new Date().toISOString() }
          : l
      )
    );
    setSelectedLead(null);

    // API call to escalate lead
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'escalated' }),
      });

      if (!response.ok) {
        console.error('Failed to escalate lead');
        // Revert optimistic update on error
        fetchData(period);
      }
    } catch (error) {
      console.error('Error escalating lead:', error);
      // Revert optimistic update on error
      fetchData(period);
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* Background is handled by globals.css */}
      <div className="relative z-10">
        {/* Header */}
        <header className="glass-card border-b border-[#E5DADA]/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              {/* Logo & Title */}
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#002642]/60 border border-[#E5DADA]/10 flex items-center justify-center p-1.5">
                  <Image
                    src="/logo.png"
                    alt="Missed Call Recovery"
                    width={36}
                    height={31}
                    className="drop-shadow-md"
                  />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-[#E5DADA]">Missed Call Recovery</h1>
                  <p className="text-sm text-[#E5DADA]/60 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    ABC Plumbing
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4">
                {/* Period selector */}
                <div className="flex bg-[#002642]/50 backdrop-blur-sm rounded-xl p-1 border border-[#E5DADA]/10">
                  {(['day', 'week', 'month'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={cn(
                        'px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200',
                        period === p
                          ? 'bg-gradient-to-r from-[#E59500] to-[#840032] text-white shadow-lg'
                          : 'text-[#E5DADA]/60 hover:text-[#E5DADA]'
                      )}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Refresh button */}
                <button
                  onClick={() => fetchData(period)}
                  disabled={isLoading}
                  className={cn(
                    'p-3 rounded-xl bg-[#002642]/50 backdrop-blur-sm border border-[#E5DADA]/10',
                    'hover:bg-[#E59500]/20 hover:border-[#E59500]/30 transition-all duration-200',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  title="Refresh data"
                >
                  <RefreshCw className={cn('w-5 h-5 text-[#E5DADA]/70', isLoading && 'animate-spin')} />
                </button>

                {/* Settings button */}
                <button
                  onClick={() => router.push('/settings')}
                  className={cn(
                    'p-3 rounded-xl bg-[#002642]/50 backdrop-blur-sm border border-[#E5DADA]/10',
                    'hover:bg-[#E59500]/20 hover:border-[#E59500]/30 transition-all duration-200'
                  )}
                  title="Settings"
                >
                  <Settings className="w-5 h-5 text-[#E5DADA]/70" />
                </button>

                {/* User menu */}
                <div className="flex items-center gap-3 pl-4 border-l border-[#E5DADA]/10">
                  {userEmail && (
                    <span className="text-sm text-[#E5DADA]/80 hidden sm:block font-medium">
                      {userEmail}
                    </span>
                  )}
                  <button
                    onClick={handleLogout}
                    className="p-3 rounded-xl bg-[#002642]/50 backdrop-blur-sm border border-[#E5DADA]/10 hover:bg-[#840032]/20 hover:border-[#840032]/30 transition-all duration-200"
                    title="Sign out"
                  >
                    <LogOut className="w-5 h-5 text-[#E5DADA]/70" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <StatsCards stats={stats} />

          {/* Search and Filter Bar */}
          <div className="glass-card rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#E5DADA]/40" />
                <input
                  type="text"
                  placeholder="Search by phone, issue, or message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    'w-full pl-12 pr-10 py-3 rounded-xl',
                    'bg-[#002642]/50 border border-[#E5DADA]/10',
                    'text-[#E5DADA] placeholder-[#E5DADA]/40',
                    'focus:outline-none focus:border-[#E59500]/50 focus:ring-1 focus:ring-[#E59500]/30',
                    'transition-all duration-200'
                  )}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#E5DADA]/40 hover:text-[#E5DADA] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 rounded-xl',
                  'bg-[#002642]/50 border border-[#E5DADA]/10',
                  'text-[#E5DADA]/70 hover:text-[#E5DADA] hover:border-[#E59500]/30',
                  'transition-all duration-200',
                  showFilters && 'border-[#E59500]/50 text-[#E59500]'
                )}
              >
                <Filter className="w-5 h-5" />
                <span className="font-medium">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-[#E59500] text-[#02040F]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Filter Options */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-[#E5DADA]/10 flex flex-wrap gap-4 animate-fade-in">
                {/* Status Filter */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-[#E5DADA]/60 uppercase tracking-wide">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={cn(
                      'px-4 py-2 rounded-lg',
                      'bg-[#002642]/60 border border-[#E5DADA]/10',
                      'text-[#E5DADA] text-sm',
                      'focus:outline-none focus:border-[#E59500]/50',
                      'cursor-pointer'
                    )}
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="responded">Responded</option>
                    <option value="qualified">Qualified</option>
                    <option value="escalated">Escalated</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                    <option value="spam">Spam</option>
                  </select>
                </div>

                {/* Urgency Filter */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-[#E5DADA]/60 uppercase tracking-wide">
                    Urgency
                  </label>
                  <select
                    value={urgencyFilter}
                    onChange={(e) => setUrgencyFilter(e.target.value)}
                    className={cn(
                      'px-4 py-2 rounded-lg',
                      'bg-[#002642]/60 border border-[#E5DADA]/10',
                      'text-[#E5DADA] text-sm',
                      'focus:outline-none focus:border-[#E59500]/50',
                      'cursor-pointer'
                    )}
                  >
                    <option value="all">All Urgencies</option>
                    <option value="emergency">Emergency</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                    <option value="none">Not Classified</option>
                  </select>
                </div>

                {/* Clear Filters */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setStatusFilter('all');
                      setUrgencyFilter('all');
                    }}
                    className="self-end px-4 py-2 text-sm text-[#840032] hover:text-[#e07090] transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}

            {/* Results Count */}
            {(searchQuery || activeFilterCount > 0) && (
              <div className="mt-3 text-sm text-[#E5DADA]/60">
                Showing {filteredLeads.length} of {leads.length} leads
              </div>
            )}
          </div>

          <LeadsTable leads={filteredLeads} onSelectLead={setSelectedLead} />
        </main>

        {/* Lead detail panel */}
        {selectedLead && (
          <LeadDetail
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onMarkConverted={handleMarkConverted}
            onEscalate={handleEscalate}
          />
        )}

        {/* AI Chat Assistant */}
        <ChatWidget businessId={DEMO_BUSINESS_ID} />
      </div>
    </div>
  );
}
