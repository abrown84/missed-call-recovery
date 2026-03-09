'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { cn, formatPhone, formatRelativeTime } from '@/lib/utils';
import Image from 'next/image';
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
  Building2,
  Calendar,
  TrendingUp,
  MoreVertical,
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

// Demo lead for fallback
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

const urgencyConfig: Record<string, { label: string; className: string; bgClass: string }> = {
  emergency: {
    label: 'EMERGENCY',
    className: 'urgency-emergency border text-sm font-bold',
    bgClass: 'bg-[#840032]/20 border-[#840032]/50',
  },
  high: {
    label: 'HIGH',
    className: 'urgency-high border text-sm font-semibold',
    bgClass: 'bg-[#E59500]/20 border-[#E59500]/50',
  },
  normal: {
    label: 'NORMAL',
    className: 'urgency-normal border text-sm',
    bgClass: 'bg-[#E5DADA]/10 border-[#E5DADA]/20',
  },
  low: {
    label: 'LOW',
    className: 'urgency-low border text-sm',
    bgClass: 'bg-[#002642]/50 border-[#E5DADA]/10',
  },
};

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-[#E5DADA]/60' },
  responded: { label: 'Responded', icon: MessageSquare, color: 'text-[#E59500]' },
  qualified: { label: 'Qualified', icon: TrendingUp, color: 'text-[#E5DADA]' },
  escalated: { label: 'Escalated', icon: AlertTriangle, color: 'text-[#840032]' },
  converted: { label: 'Converted', icon: CheckCircle, color: 'text-emerald-400' },
  lost: { label: 'Lost', icon: XCircle, color: 'text-[#E5DADA]/40' },
  spam: { label: 'Spam', icon: XCircle, color: 'text-[#E5DADA]/40' },
};

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const fetchLead = async () => {
      setIsLoading(true);
      try {
        // In demo mode, use demo lead
        // TODO: Fetch from API in production
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
    // Simulate sending
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newSms: SMSMessage = {
      id: `m${Date.now()}`,
      direction: 'outbound',
      body: newMessage,
      sent_at: new Date().toISOString(),
    };

    setLead((prev) => prev ? {
      ...prev,
      sms_messages: [...(prev.sms_messages || []), newSms],
    } : null);

    setNewMessage('');
    setIsSending(false);
  };

  const handleMarkConverted = async () => {
    if (!lead) return;
    setLead((prev) => prev ? { ...prev, status: 'converted', converted_at: new Date().toISOString() } : null);
    // TODO: API call
  };

  const handleEscalate = async () => {
    if (!lead) return;
    setLead((prev) => prev ? { ...prev, status: 'escalated', escalated_at: new Date().toISOString() } : null);
    // TODO: API call
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E59500] animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <XCircle className="w-16 h-16 text-[#840032]" />
        <h1 className="text-xl font-bold text-[#E5DADA]">Lead not found</h1>
        <button
          onClick={() => router.push('/')}
          className="text-[#E59500] hover:underline"
        >
          Return to dashboard
        </button>
      </div>
    );
  }

  const urgency = lead.urgency ? urgencyConfig[lead.urgency] : null;
  const status = statusConfig[lead.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10">
        {/* Header */}
        <header className="glass-card border-b border-[#E5DADA]/10 sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/')}
                  className="p-2 rounded-lg hover:bg-[#E5DADA]/10 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-[#E5DADA]/70" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#002642]/60 border border-[#E5DADA]/10 flex items-center justify-center p-1.5">
                    <Image
                      src="/logo.png"
                      alt="Missed Call Recovery"
                      width={32}
                      height={28}
                      className="drop-shadow-md"
                    />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-[#E5DADA] font-['JetBrains_Mono']">
                      {formatPhone(lead.caller_phone)}
                    </h1>
                    <div className="flex items-center gap-2 text-sm text-[#E5DADA]/60">
                      <StatusIcon className={cn('w-4 h-4', status.color)} />
                      {status.label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {lead.status !== 'converted' && lead.status !== 'lost' && (
                  <>
                    <button
                      onClick={handleEscalate}
                      className={cn(
                        'px-4 py-2.5 rounded-xl font-semibold text-sm',
                        'bg-[#840032]/20 border border-[#840032]/50',
                        'text-[#e07090] hover:bg-[#840032]/30',
                        'transition-all duration-200'
                      )}
                    >
                      <Zap className="w-4 h-4 inline mr-2" />
                      Escalate
                    </button>
                    <button
                      onClick={handleMarkConverted}
                      className={cn(
                        'px-4 py-2.5 rounded-xl font-semibold text-sm',
                        'bg-gradient-to-r from-emerald-500/20 to-emerald-600/20',
                        'border border-emerald-500/50',
                        'text-emerald-400 hover:from-emerald-500/30 hover:to-emerald-600/30',
                        'transition-all duration-200'
                      )}
                    >
                      <CheckCircle className="w-4 h-4 inline mr-2" />
                      Mark Converted
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lead Info Sidebar */}
            <div className="space-y-6">
              {/* Contact Card */}
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-bold text-[#E5DADA] mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-[#E59500]" />
                  Contact Info
                </h2>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#002642]/50 border border-[#E5DADA]/10">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-[#E59500]" />
                      <span className="font-['JetBrains_Mono'] text-[#E5DADA]">
                        {formatPhone(lead.caller_phone)}
                      </span>
                    </div>
                    <button
                      onClick={copyPhone}
                      className="p-2 rounded-lg hover:bg-[#E5DADA]/10 transition-colors"
                    >
                      {copiedPhone ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-[#E5DADA]/40" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-[#002642]/50 border border-[#E5DADA]/10">
                    <Calendar className="w-5 h-5 text-[#E5DADA]/40" />
                    <div>
                      <div className="text-xs text-[#E5DADA]/60">Called</div>
                      <div className="text-sm text-[#E5DADA]">
                        {new Date(lead.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Card */}
              <div className={cn('glass-card rounded-2xl p-6', urgency?.bgClass)}>
                <h2 className="text-lg font-bold text-[#E5DADA] mb-4">Classification</h2>

                <div className="space-y-4">
                  {urgency && (
                    <div className="flex items-center gap-2">
                      {lead.urgency === 'emergency' && (
                        <Zap className="w-5 h-5 text-[#840032]" />
                      )}
                      <span className={cn('px-3 py-1.5 rounded-lg', urgency.className)}>
                        {urgency.label}
                      </span>
                    </div>
                  )}

                  {lead.issue && (
                    <div>
                      <div className="text-xs text-[#E5DADA]/60 uppercase tracking-wide mb-1">
                        Issue
                      </div>
                      <p className="text-[#E5DADA]">{lead.issue}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-bold text-[#E5DADA] mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#E59500]" />
                  Timeline
                </h2>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#E5DADA]" />
                    <div className="text-sm">
                      <div className="text-[#E5DADA]">Call received</div>
                      <div className="text-xs text-[#E5DADA]/60">
                        {formatRelativeTime(lead.created_at)}
                      </div>
                    </div>
                  </div>

                  {lead.sms_messages && lead.sms_messages.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#E59500]" />
                      <div className="text-sm">
                        <div className="text-[#E5DADA]">SMS sent</div>
                        <div className="text-xs text-[#E5DADA]/60">
                          {formatRelativeTime(lead.sms_messages[0].sent_at)}
                        </div>
                      </div>
                    </div>
                  )}

                  {lead.escalated_at && (
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#840032]" />
                      <div className="text-sm">
                        <div className="text-[#e07090]">Escalated</div>
                        <div className="text-xs text-[#E5DADA]/60">
                          {formatRelativeTime(lead.escalated_at)}
                        </div>
                      </div>
                    </div>
                  )}

                  {lead.converted_at && (
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <div className="text-sm">
                        <div className="text-emerald-400">Converted</div>
                        <div className="text-xs text-[#E5DADA]/60">
                          {formatRelativeTime(lead.converted_at)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Conversation */}
            <div className="lg:col-span-2">
              <div className="glass-card rounded-2xl overflow-hidden h-[calc(100vh-200px)] flex flex-col">
                {/* Conversation Header */}
                <div className="px-6 py-4 border-b border-[#E5DADA]/10 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[#E5DADA] flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-[#E59500]" />
                    Conversation
                  </h2>
                  <span className="text-sm text-[#E5DADA]/60">
                    {lead.sms_messages?.length || 0} messages
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {lead.sms_messages?.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-4 py-3',
                          msg.direction === 'outbound'
                            ? 'bg-gradient-to-r from-[#E59500]/20 to-[#840032]/20 border border-[#E59500]/30 rounded-br-sm'
                            : 'bg-[#002642]/60 border border-[#E5DADA]/10 rounded-bl-sm'
                        )}
                      >
                        <p className="text-[#E5DADA] text-sm">{msg.body}</p>
                        <div className="text-xs text-[#E5DADA]/50 mt-1 text-right">
                          {formatRelativeTime(msg.sent_at)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(!lead.sms_messages || lead.sms_messages.length === 0) && (
                    <div className="text-center text-[#E5DADA]/40 py-12">
                      No messages yet
                    </div>
                  )}
                </div>

                {/* Message Input */}
                <div className="p-4 border-t border-[#E5DADA]/10">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Type a message..."
                      className={cn(
                        'flex-1 px-4 py-3 rounded-xl',
                        'bg-[#002642]/50 border border-[#E5DADA]/10',
                        'text-[#E5DADA] placeholder-[#E5DADA]/40',
                        'focus:outline-none focus:border-[#E59500]/50',
                        'transition-all duration-200'
                      )}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || isSending}
                      className={cn(
                        'px-5 py-3 rounded-xl font-semibold',
                        'bg-gradient-to-r from-[#E59500] to-[#840032]',
                        'text-white shadow-lg',
                        'hover:shadow-[0_0_20px_rgba(229,149,0,0.3)]',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'transition-all duration-200'
                      )}
                    >
                      {isSending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
