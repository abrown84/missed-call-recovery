'use client';

import { cn, formatPhone, formatRelativeTime } from '@/lib/utils';
import {
  X,
  Phone,
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle,
  Send,
  Zap,
} from 'lucide-react';
import type { LeadStatus, UrgencyLevel } from '@/types';

interface SMSMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  sent_at: string;
}

interface LeadDetailProps {
  lead: {
    id: string;
    caller_phone: string;
    status: LeadStatus;
    urgency: UrgencyLevel | null;
    issue: string | null;
    sms_response_text: string | null;
    created_at: string;
    escalated_at: string | null;
    converted_at: string | null;
    sms_messages?: SMSMessage[];
  };
  onClose: () => void;
  onMarkConverted?: (leadId: string) => void;
  onEscalate?: (leadId: string) => void;
}

export function LeadDetail({ lead, onClose, onMarkConverted, onEscalate }: LeadDetailProps) {
  const messages = lead.sms_messages || [];
  const isEmergency = lead.urgency === 'emergency';

  const urgencyColors = {
    emergency: 'text-[#e07090] bg-[#840032]/25 border-[#840032]/50',
    high: 'text-[#f5b333] bg-[#E59500]/20 border-[#E59500]/40',
    normal: 'text-[#E5DADA] bg-[#002642]/40 border-[#E5DADA]/20',
    low: 'text-[#E5DADA]/60 bg-[#E5DADA]/10 border-[#E5DADA]/15',
  };

  const statusColors = {
    pending: 'text-[#E5DADA]/70 bg-[#E5DADA]/10 border-[#E5DADA]/20',
    responded: 'text-[#f5b333] bg-[#E59500]/20 border-[#E59500]/30',
    qualified: 'text-[#E5DADA] bg-[#E5DADA]/10 border-[#E5DADA]/20',
    escalated: 'text-[#f5b333] bg-[#E59500]/20 border-[#E59500]/40',
    converted: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30',
    lost: 'text-[#E5DADA]/50 bg-[#002642]/40 border-[#E5DADA]/10',
    spam: 'text-[#E5DADA]/50 bg-[#002642]/40 border-[#E5DADA]/10',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#02040F]/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg glass-card border-l border-[#E5DADA]/10 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className={cn(
          "px-6 py-5 border-b border-[#E5DADA]/10",
          isEmergency && "bg-[#840032]/15 border-[#840032]/30"
        )}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-[#E5DADA] font-['JetBrains_Mono']">
                  {formatPhone(lead.caller_phone)}
                </h2>
                {isEmergency && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#840032]/25 border border-[#840032]/50">
                    <Zap className="w-4 h-4 text-[#e07090]" />
                    <span className="text-xs font-bold text-[#e07090]">EMERGENCY</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-[#E5DADA]/60">
                <Clock className="w-4 h-4" />
                {formatRelativeTime(lead.created_at)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#E5DADA]/10 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-[#E5DADA]/70" />
            </button>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex gap-2 px-6 py-4 border-b border-[#E5DADA]/10 bg-[#002642]/20">
          {lead.urgency && (
            <span className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border',
              urgencyColors[lead.urgency]
            )}>
              <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
              {lead.urgency.toUpperCase()}
            </span>
          )}
          <span className={cn(
            'inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border',
            statusColors[lead.status]
          )}>
            {lead.status.toUpperCase()}
          </span>
        </div>

        {/* Issue summary */}
        {lead.issue && (
          <div className="px-6 py-4 border-b border-[#E5DADA]/10 bg-[#002642]/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#E59500] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#E5DADA] mb-1">Reported Issue</p>
                <p className="text-[#E5DADA]/80">{lead.issue}</p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-[#E59500]/60" />
            <p className="text-sm font-semibold text-[#E5DADA]">Conversation</p>
          </div>

          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 mx-auto text-[#E5DADA]/20 mb-3" />
              <p className="text-sm text-[#E5DADA]/50">No messages yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 backdrop-blur-sm',
                    msg.direction === 'outbound'
                      ? 'ml-auto bg-gradient-to-r from-[#E59500]/20 to-[#840032]/20 border border-[#E59500]/30'
                      : 'bg-[#002642]/40 border border-[#E5DADA]/10'
                  )}
                >
                  <p className="text-sm text-[#E5DADA] leading-relaxed">{msg.body}</p>
                  <p
                    className={cn(
                      'text-xs mt-2 font-["JetBrains_Mono"]',
                      msg.direction === 'outbound' ? 'text-[#E59500]' : 'text-[#E5DADA]/50'
                    )}
                  >
                    {formatRelativeTime(msg.sent_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-5 border-t border-[#E5DADA]/10 space-y-3 bg-[#002642]/20">
          <a
            href={`tel:${lead.caller_phone}`}
            className="flex items-center justify-center gap-2 w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
          >
            <Phone className="w-5 h-5" />
            Call Back Now
          </a>

          <div className="grid grid-cols-2 gap-3">
            {lead.status !== 'converted' && onMarkConverted && (
              <button
                onClick={() => onMarkConverted(lead.id)}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-[#002642]/40 text-emerald-300 rounded-xl hover:bg-emerald-500/20 transition-all duration-200 border border-emerald-500/30 font-semibold"
              >
                <CheckCircle className="w-5 h-5" />
                Mark Booked
              </button>
            )}
            {lead.status !== 'escalated' && lead.urgency !== 'emergency' && onEscalate && (
              <button
                onClick={() => onEscalate(lead.id)}
                className={cn(
                  "flex items-center justify-center gap-2 py-3 px-4 bg-[#002642]/40 text-[#E59500] rounded-xl hover:bg-[#E59500]/20 transition-all duration-200 border border-[#E59500]/30 font-semibold",
                  lead.status === 'converted' && "col-span-2"
                )}
              >
                <Send className="w-5 h-5" />
                Escalate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
