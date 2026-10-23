'use client';

import { useEffect, useRef } from 'react';
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
import { Button } from '@/components/ui/button';
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const urgencyColors = {
    emergency: 'text-danger bg-danger/15 border-danger/40',
    high: 'text-primary bg-primary/15 border-primary/35',
    normal: 'text-foreground bg-muted border-border',
    low: 'text-muted-foreground bg-muted/70 border-border',
  };

  const statusColors = {
    pending: 'text-muted-foreground bg-muted border-border',
    responded: 'text-primary bg-primary/15 border-primary/30',
    qualified: 'text-foreground bg-muted border-border',
    escalated: 'text-primary bg-primary/15 border-primary/35',
    converted: 'text-success bg-success/15 border-success/30',
    lost: 'text-muted-foreground bg-muted border-border',
    spam: 'text-muted-foreground bg-muted border-border',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="lead-detail-title">
      <button
        type="button"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm cursor-default"
        aria-label="Close lead detail"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className="relative w-full max-w-lg h-full glass-card border-l border-border/40 flex flex-col animate-slide-in-right shadow-panel"
      >
        <div
          className={cn(
            'px-5 sm:px-6 py-5 border-b border-border/40',
            isEmergency && 'bg-accent/10 border-accent/30'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h2 id="lead-detail-title" className="text-xl sm:text-2xl font-bold font-mono truncate">
                  {formatPhone(lead.caller_phone)}
                </h2>
                {isEmergency && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-danger/15 border border-danger/40">
                    <Zap className="w-4 h-4 text-danger" aria-hidden />
                    <span className="text-xs font-bold text-danger">EMERGENCY</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" aria-hidden />
                <time dateTime={lead.created_at}>{formatRelativeTime(lead.created_at)}</time>
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="btn-ghost shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-5 sm:px-6 py-3 border-b border-border/40 bg-surface/40">
          {lead.urgency && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border',
                urgencyColors[lead.urgency]
              )}
            >
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" aria-hidden />
              {lead.urgency.toUpperCase()}
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border',
              statusColors[lead.status]
            )}
          >
            {lead.status.toUpperCase()}
          </span>
        </div>

        {lead.issue && (
          <div className="px-5 sm:px-6 py-4 border-b border-border/40 bg-surface/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="text-sm font-semibold mb-1">Reported issue</p>
                <p className="text-foreground/85">{lead.issue}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-primary/70" aria-hidden />
            <p className="text-sm font-semibold">Conversation</p>
          </div>

          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" aria-hidden />
              <p className="text-sm text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3',
                    msg.direction === 'outbound'
                      ? 'ml-auto bg-primary/15 border border-primary/25'
                      : 'bg-surface/80 border border-border/50'
                  )}
                >
                  <p className="text-sm leading-relaxed">{msg.body}</p>
                  <p
                    className={cn(
                      'text-xs mt-2 font-mono',
                      msg.direction === 'outbound' ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {formatRelativeTime(msg.sent_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-border/40 space-y-3 bg-surface/40">
          <a
            href={`tel:${lead.caller_phone}`}
            className="btn-primary w-full bg-gradient-to-r from-success to-emerald-600"
          >
            <Phone className="w-5 h-5" aria-hidden />
            Call back now
          </a>

          <div className="grid grid-cols-2 gap-3">
            {lead.status !== 'converted' && onMarkConverted && (
              <Button
                variant="success"
                onClick={() => onMarkConverted(lead.id)}
                className="w-full"
              >
                <CheckCircle className="w-5 h-5" aria-hidden />
                Mark booked
              </Button>
            )}
            {lead.status !== 'escalated' && lead.urgency !== 'emergency' && onEscalate && (
              <Button
                variant="secondary"
                onClick={() => onEscalate(lead.id)}
                className={cn(
                  'w-full border-primary/30 text-primary hover:bg-primary/10',
                  lead.status === 'converted' && 'col-span-2'
                )}
              >
                <Send className="w-5 h-5" aria-hidden />
                Escalate
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
