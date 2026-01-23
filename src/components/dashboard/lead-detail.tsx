'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatPhone, formatRelativeTime } from '@/lib/utils';
import {
  X,
  Phone,
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle,
  Send,
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">{formatPhone(lead.caller_phone)}</h2>
            <p className="text-sm text-gray-500">
              {formatRelativeTime(lead.created_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status badges */}
        <div className="flex gap-2 p-4 border-b">
          {lead.urgency && (
            <Badge
              variant={
                lead.urgency === 'emergency'
                  ? 'emergency'
                  : lead.urgency === 'high'
                  ? 'high'
                  : lead.urgency === 'normal'
                  ? 'normal'
                  : 'low'
              }
            >
              {lead.urgency === 'emergency' && <AlertTriangle className="w-3 h-3 mr-1" />}
              {lead.urgency}
            </Badge>
          )}
          <Badge
            variant={
              lead.status === 'converted'
                ? 'success'
                : lead.status === 'pending'
                ? 'pending'
                : 'default'
            }
          >
            {lead.status}
          </Badge>
        </div>

        {/* Issue summary */}
        {lead.issue && (
          <div className="p-4 border-b bg-gray-50">
            <p className="text-sm font-medium text-gray-700">Issue</p>
            <p className="text-gray-900 mt-1">{lead.issue}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-sm font-medium text-gray-500">Conversation</p>
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400">No messages yet</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'max-w-[80%] rounded-lg px-3 py-2',
                  msg.direction === 'outbound'
                    ? 'bg-blue-500 text-white ml-auto'
                    : 'bg-gray-100 text-gray-900'
                )}
              >
                <p className="text-sm">{msg.body}</p>
                <p
                  className={cn(
                    'text-xs mt-1',
                    msg.direction === 'outbound' ? 'text-blue-100' : 'text-gray-400'
                  )}
                >
                  {formatRelativeTime(msg.sent_at)}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t space-y-2">
          <a
            href={`tel:${lead.caller_phone}`}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Phone className="w-4 h-4" />
            Call Back
          </a>

          <div className="flex gap-2">
            {lead.status !== 'converted' && onMarkConverted && (
              <button
                onClick={() => onMarkConverted(lead.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-4 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Booked
              </button>
            )}
            {lead.status !== 'escalated' && lead.urgency !== 'emergency' && onEscalate && (
              <button
                onClick={() => onEscalate(lead.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-4 border border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Send className="w-4 h-4" />
                Escalate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
