'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, formatPhone, formatRelativeTime } from '@/lib/utils';
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Send,
  User,
  Calendar,
  TrendingUp,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';

interface SMSMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  sent_at: string;
}

interface Lead {
  id: string;
  caller_phone: string;
  status: string;
  urgency: string | null;
  issue: string | null;
  sms_response_text: string | null;
  created_at: string;
  escalated_at: string | null;
  converted_at: string | null;
  sms_messages?: SMSMessage[];
}

const DEMO_LEAD: Lead = {
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
    {
      id: 'm3',
      direction: 'outbound',
      body: "I understand this is an emergency. We're dispatching a technician to your location immediately. They'll call you in the next 5 minutes to confirm your address.",
      sent_at: new Date(Date.now() - 11 * 60000).toISOString(),
    },
    {
      id: 'm4',
      direction: 'inbound',
      body: "Thank you so much! I'm at 123 Main Street, Apt 4B. The water is getting worse!",
      sent_at: new Date(Date.now() - 10 * 60000).toISOString(),
    },
  ],
};

const urgencyConfig: Record<string, { label: string; className: string }> = {
  emergency: { label: 'EMERGENCY', className: 'urgency-emergency border' },
  high: { label: 'HIGH', className: 'urgency-high border' },
  normal: { label: 'NORMAL', className: 'urgency-normal border' },
  low: { label: 'LOW', className: 'urgency-low border' },
};

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-muted-foreground' },
  responded: { label: 'Responded', icon: MessageSquare, color: 'text-primary' },
  qualified: { label: 'Qualified', icon: TrendingUp, color: 'text-foreground' },
  escalated: { label: 'Escalated', icon: AlertTriangle, color: 'text-danger' },
  converted: { label: 'Converted', icon: CheckCircle, color: 'text-success' },
  lost: { label: 'Lost', icon: XCircle, color: 'text-muted-foreground' },
  spam: { label: 'Spam', icon: XCircle, color: 'text-muted-foreground' },
};

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    const fetchLead = async () => {
      setIsLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setLead(DEMO_LEAD);
      } catch (error) {
        console.error('Failed to fetch lead:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLead();
  }, [params.id]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !lead) return;
    setIsSending(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const newSms: SMSMessage = {
      id: `m${Date.now()}`,
      direction: 'outbound',
      body: newMessage,
      sent_at: new Date().toISOString(),
    };
    setLead((prev) =>
      prev ? { ...prev, sms_messages: [...(prev.sms_messages || []), newSms] } : null
    );
    setNewMessage('');
    setIsSending(false);
  };

  const handleMarkConverted = async () => {
    if (!lead) return;
    setLead((prev) =>
      prev ? { ...prev, status: 'converted', converted_at: new Date().toISOString() } : null
    );
  };

  const handleEscalate = async () => {
    if (!lead) return;
    setLead((prev) =>
      prev ? { ...prev, status: 'escalated', escalated_at: new Date().toISOString() } : null
    );
  };

  const copyPhone = () => {
    if (lead) {
      navigator.clipboard.writeText(lead.caller_phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="Lead" subtitle="Loading…" maxWidth="5xl" showNav={false}>
        <div className="flex items-center justify-center py-24" role="status">
          <Loader2 className="w-8 h-8 text-primary animate-spin" aria-label="Loading lead" />
        </div>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell title="Lead" subtitle="Not found" maxWidth="5xl">
        <EmptyState
          icon={XCircle}
          title="Lead not found"
          description="This lead may have been removed or the link is invalid."
          action={
            <button type="button" onClick={() => router.push('/')} className="btn-primary">
              Return to dashboard
            </button>
          }
        />
      </AppShell>
    );
  }

  const urgency = lead.urgency ? urgencyConfig[lead.urgency] : null;
  const status = statusConfig[lead.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <AppShell
      title={formatPhone(lead.caller_phone)}
      subtitle={status.label}
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
          {lead.status !== 'converted' && lead.status !== 'lost' && (
            <>
              <button type="button" onClick={handleEscalate} className="btn-secondary border-accent/40 text-danger hidden sm:inline-flex">
                <Zap className="w-4 h-4" aria-hidden />
                Escalate
              </button>
              <button type="button" onClick={handleMarkConverted} className="btn-secondary border-success/40 text-success hidden sm:inline-flex">
                <CheckCircle className="w-4 h-4" aria-hidden />
                Mark converted
              </button>
            </>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        <div className="space-y-5">
          <section className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" aria-hidden />
              Contact info
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface/70 border border-border/50">
                <div className="flex items-center gap-3 min-w-0">
                  <Phone className="w-5 h-5 text-primary shrink-0" aria-hidden />
                  <span className="font-mono truncate">{formatPhone(lead.caller_phone)}</span>
                </div>
                <button type="button" onClick={copyPhone} className="btn-ghost p-2" aria-label="Copy phone number">
                  {copiedPhone ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface/70 border border-border/50">
                <Calendar className="w-5 h-5 text-muted-foreground" aria-hidden />
                <div>
                  <div className="text-xs text-muted-foreground">Called</div>
                  <div className="text-sm">{new Date(lead.created_at).toLocaleString()}</div>
                </div>
              </div>
              <a href={`tel:${lead.caller_phone}`} className="btn-primary w-full bg-gradient-to-r from-success to-emerald-600">
                <Phone className="w-4 h-4" aria-hidden />
                Call back
              </a>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-bold mb-4">Classification</h2>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusIcon className={cn('w-4 h-4', status.color)} aria-hidden />
                <span className="text-sm font-medium">{status.label}</span>
                {urgency && (
                  <span className={cn('px-2.5 py-1 rounded-md text-xs font-bold', urgency.className)}>
                    {urgency.label}
                  </span>
                )}
              </div>
              {lead.issue && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Issue</div>
                  <p className="text-sm">{lead.issue}</p>
                </div>
              )}
            </div>
          </section>

          <section className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" aria-hidden />
              Timeline
            </h2>
            <ol className="space-y-3">
              <li className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-foreground" aria-hidden />
                <div className="text-sm">
                  <div>Call received</div>
                  <div className="text-xs text-muted-foreground">{formatRelativeTime(lead.created_at)}</div>
                </div>
              </li>
              {lead.sms_messages && lead.sms_messages.length > 0 && (
                <li className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-primary" aria-hidden />
                  <div className="text-sm">
                    <div>SMS sent</div>
                    <div className="text-xs text-muted-foreground">{formatRelativeTime(lead.sms_messages[0].sent_at)}</div>
                  </div>
                </li>
              )}
              {lead.escalated_at && (
                <li className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-accent" aria-hidden />
                  <div className="text-sm">
                    <div className="text-danger">Escalated</div>
                    <div className="text-xs text-muted-foreground">{formatRelativeTime(lead.escalated_at)}</div>
                  </div>
                </li>
              )}
              {lead.converted_at && (
                <li className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-success" aria-hidden />
                  <div className="text-sm">
                    <div className="text-success">Converted</div>
                    <div className="text-xs text-muted-foreground">{formatRelativeTime(lead.converted_at)}</div>
                  </div>
                </li>
              )}
            </ol>
          </section>

          {lead.status !== 'converted' && lead.status !== 'lost' && (
            <div className="flex sm:hidden gap-2">
              <button type="button" onClick={handleEscalate} className="btn-secondary flex-1 border-accent/40 text-danger">
                Escalate
              </button>
              <button type="button" onClick={handleMarkConverted} className="btn-secondary flex-1 border-success/40 text-success">
                Converted
              </button>
            </div>
          )}
        </div>

        <section className="lg:col-span-2 glass-card rounded-2xl overflow-hidden min-h-[28rem] flex flex-col">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" aria-hidden />
              Conversation
            </h2>
            <span className="text-sm text-muted-foreground">
              {lead.sms_messages?.length || 0} messages
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {lead.sms_messages?.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3',
                    msg.direction === 'outbound'
                      ? 'bg-primary/15 border border-primary/25 rounded-br-sm'
                      : 'bg-surface/80 border border-border/50 rounded-bl-sm'
                  )}
                >
                  <p className="text-sm">{msg.body}</p>
                  <div className="text-xs text-muted-foreground mt-1 text-right font-mono">
                    {formatRelativeTime(msg.sent_at)}
                  </div>
                </div>
              </div>
            ))}
            {(!lead.sms_messages || lead.sms_messages.length === 0) && (
              <div className="text-center text-muted-foreground py-12">No messages yet</div>
            )}
          </div>

          <div className="p-4 border-t border-border/40">
            <div className="flex gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message…"
                className="field-input flex-1"
                aria-label="New message"
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending}
                className="btn-primary px-4"
                aria-label="Send message"
              >
                {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
