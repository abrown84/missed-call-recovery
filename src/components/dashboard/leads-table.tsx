'use client';

import { cn, formatPhone, formatRelativeTime } from '@/lib/utils';
import { Phone, MessageSquare, Clock, ChevronRight, Zap } from 'lucide-react';
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
}

const urgencyConfig: Record<string, { label: string; className: string; icon?: typeof Zap }> = {
  emergency: { label: 'EMERGENCY', className: 'urgency-emergency border text-xs font-bold', icon: Zap },
  high: { label: 'HIGH', className: 'urgency-high border text-xs font-semibold' },
  normal: { label: 'NORMAL', className: 'urgency-normal border text-xs' },
  low: { label: 'LOW', className: 'urgency-low border text-xs' },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'status-pending border text-xs' },
  responded: { label: 'Responded', className: 'bg-[#E59500]/20 text-[#f5b333] border-[#E59500]/30 border text-xs' },
  qualified: { label: 'Qualified', className: 'bg-[#E5DADA]/10 text-[#E5DADA] border-[#E5DADA]/20 border text-xs' },
  escalated: { label: 'Escalated', className: 'status-escalated border text-xs font-semibold' },
  converted: { label: 'Converted', className: 'status-converted border text-xs font-semibold' },
  lost: { label: 'Lost', className: 'bg-[#002642]/40 text-[#E5DADA]/50 border-[#E5DADA]/10 border text-xs' },
  spam: { label: 'Spam', className: 'bg-[#002642]/40 text-[#E5DADA]/50 border-[#E5DADA]/10 border text-xs' },
};

export function LeadsTable({ leads, onSelectLead }: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center animate-fade-in">
        <Phone className="w-16 h-16 mx-auto text-[#E5DADA]/30 mb-4" strokeWidth={1.5} />
        <h3 className="text-xl font-semibold text-[#E5DADA] mb-2">No leads yet</h3>
        <p className="text-[#E5DADA]/60">
          Missed calls will appear here automatically
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E5DADA]/10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#E5DADA]">Recent Leads</h2>
          <span className="text-sm text-[#E59500]">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="divide-y divide-white/5">
        {leads.map((lead, index) => {
          const urgency = lead.urgency ? urgencyConfig[lead.urgency] : null;
          const status = statusConfig[lead.status] || statusConfig.pending;
          const isEmergency = lead.urgency === 'emergency';
          const UrgencyIcon = urgency?.icon;

          return (
            <button
              key={lead.id}
              onClick={() => onSelectLead?.(lead)}
              className={cn(
                'w-full px-6 py-4 flex items-center gap-4 transition-all duration-200 text-left',
                'hover:bg-white/5',
                isEmergency ? 'table-row-emergency' : 'table-row'
              )}
              style={{
                animationDelay: `${index * 0.05}s`,
                animationFillMode: 'both',
              }}
            >
              {/* Urgency Pulse Indicator */}
              <div className="flex-shrink-0">
                <div
                  className={cn(
                    'w-3 h-3 rounded-full relative',
                    lead.urgency === 'emergency' && 'bg-[#840032]',
                    lead.urgency === 'high' && 'bg-[#E59500]',
                    lead.urgency === 'normal' && 'bg-[#E5DADA]/60',
                    lead.urgency === 'low' && 'bg-[#E5DADA]/30',
                    !lead.urgency && 'bg-[#002642]'
                  )}
                >
                  {isEmergency && (
                    <span className="absolute inset-0 rounded-full bg-[#840032] animate-ping opacity-75" />
                  )}
                </div>
              </div>

              {/* Phone & Issue */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-[#E5DADA] font-['JetBrains_Mono']">
                    {formatPhone(lead.caller_phone)}
                  </span>

                  {urgency && (
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md', urgency.className)}>
                      {UrgencyIcon && <UrgencyIcon className="w-3 h-3" />}
                      {urgency.label}
                    </span>
                  )}

                  <span className={cn('px-2 py-0.5 rounded-md', status.className)}>
                    {status.label}
                  </span>
                </div>

                {lead.issue && (
                  <p className="text-sm text-[#E5DADA]/80 truncate flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#E59500]/60 flex-shrink-0" />
                    {lead.issue}
                  </p>
                )}
                {lead.sms_response_text && !lead.issue && (
                  <p className="text-sm text-[#E5DADA]/60 truncate flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#E5DADA]/40 flex-shrink-0" />
                    {lead.sms_response_text}
                  </p>
                )}
              </div>

              {/* Time Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#002642]/50 text-sm text-[#E5DADA]/70 flex-shrink-0 font-['JetBrains_Mono']">
                <Clock className="w-4 h-4 text-[#E59500]/60" />
                {formatRelativeTime(lead.created_at)}
              </div>

              <ChevronRight className="w-5 h-5 text-[#E5DADA]/30 flex-shrink-0 group-hover:text-[#E59500] transition-colors" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
