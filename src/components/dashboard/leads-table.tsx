'use client';

import { useRouter } from 'next/navigation';
import { cn, formatPhone, formatRelativeTime } from '@/lib/utils';
import { Phone, MessageSquare, Clock, ChevronRight, Zap } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import type { LeadStatus, UrgencyLevel } from '@/types';

interface Lead {
  id: string;
  caller_phone: string;
  status: LeadStatus;
  urgency: UrgencyLevel | null;
  issue: string | null;
  sms_response_text: string | null;
  created_at: string;
  escalated_at: string | null;
  converted_at: string | null;
}

interface LeadsTableProps {
  leads: Lead[];
  onSelectLead?: (lead: Lead) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

const urgencyConfig: Record<string, { label: string; variant: 'emergency' | 'high' | 'normal' | 'low'; icon?: typeof Zap }> = {
  emergency: { label: 'EMERGENCY', variant: 'emergency', icon: Zap },
  high: { label: 'HIGH', variant: 'high' },
  normal: { label: 'NORMAL', variant: 'normal' },
  low: { label: 'LOW', variant: 'low' },
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'pending' | 'primary' | 'escalated' | 'success' }> = {
  pending: { label: 'Pending', variant: 'pending' },
  responded: { label: 'Responded', variant: 'primary' },
  qualified: { label: 'Qualified', variant: 'default' },
  escalated: { label: 'Escalated', variant: 'escalated' },
  converted: { label: 'Converted', variant: 'success' },
  lost: { label: 'Lost', variant: 'default' },
  spam: { label: 'Spam', variant: 'default' },
};

export function LeadsTable({
  leads,
  onSelectLead,
  emptyTitle = 'No leads yet',
  emptyDescription = 'Missed calls will appear here automatically once the BRWN device posts missed-call events.',
}: LeadsTableProps) {
  const router = useRouter();

  const handleLeadClick = (lead: Lead, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-action="expand"]')) {
      onSelectLead?.(lead);
    } else {
      router.push(`/leads/${lead.id}`);
    }
  };

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Phone}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-slide-up">
      <div className="px-4 sm:px-6 py-4 border-b border-border/40">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold">Recent leads</h2>
          <span className="text-sm text-primary font-medium shrink-0">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
          </span>
        </div>
      </div>

      <ul className="divide-y divide-border/30" role="list">
        {leads.map((lead, index) => {
          const urgency = lead.urgency ? urgencyConfig[lead.urgency] : null;
          const status = statusConfig[lead.status] || statusConfig.pending;
          const isEmergency = lead.urgency === 'emergency';
          const UrgencyIcon = urgency?.icon;

          return (
            <li key={lead.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => handleLeadClick(lead, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleLeadClick(lead, e as unknown as React.MouseEvent);
                  }
                }}
                className={cn(
                  'w-full px-4 sm:px-6 py-4 flex items-center gap-3 sm:gap-4 text-left cursor-pointer',
                  isEmergency ? 'table-row-emergency' : 'table-row'
                )}
                style={{
                  animationDelay: `${index * 0.04}s`,
                  animationFillMode: 'both',
                }}
              >
                <div className="flex-shrink-0" aria-hidden>
                  <div
                    className={cn(
                      'w-2.5 h-2.5 rounded-full relative',
                      lead.urgency === 'emergency' && 'bg-accent',
                      lead.urgency === 'high' && 'bg-primary',
                      lead.urgency === 'normal' && 'bg-muted-foreground/60',
                      lead.urgency === 'low' && 'bg-muted-foreground/30',
                      !lead.urgency && 'bg-border'
                    )}
                  >
                    {isEmergency && (
                      <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-60" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                    <span className="font-semibold font-mono text-sm sm:text-base">
                      {formatPhone(lead.caller_phone)}
                    </span>

                    {urgency && (
                      <Badge variant={urgency.variant}>
                        {UrgencyIcon && <UrgencyIcon className="w-3 h-3" aria-hidden />}
                        {urgency.label}
                      </Badge>
                    )}

                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  {lead.issue && (
                    <p className="text-sm text-foreground/80 truncate flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" aria-hidden />
                      {lead.issue}
                    </p>
                  )}
                  {lead.sms_response_text && !lead.issue && (
                    <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                      {lead.sms_response_text}
                    </p>
                  )}
                  {!lead.issue && !lead.sms_response_text && (
                    <p className="text-sm text-muted-foreground">Awaiting customer reply</p>
                  )}
                </div>

                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/80 text-sm text-muted-foreground flex-shrink-0 font-mono">
                  <Clock className="w-4 h-4 text-primary/60" aria-hidden />
                  <time dateTime={lead.created_at}>{formatRelativeTime(lead.created_at)}</time>
                </div>

                <button
                  type="button"
                  data-action="expand"
                  className="p-2 rounded-lg hover:bg-primary/15 transition-colors"
                  aria-label={`Quick view lead ${formatPhone(lead.caller_phone)}`}
                  title="Quick view"
                >
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
