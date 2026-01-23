'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatPhone, formatRelativeTime } from '@/lib/utils';
import { Phone, MessageSquare, Clock, ChevronRight } from 'lucide-react';
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

const urgencyVariant: Record<string, 'emergency' | 'high' | 'normal' | 'low'> = {
  emergency: 'emergency',
  high: 'high',
  normal: 'normal',
  low: 'low',
};

const statusVariant: Record<string, 'pending' | 'success' | 'default' | 'high' | 'low'> = {
  pending: 'pending',
  responded: 'default',
  qualified: 'default',
  escalated: 'high',
  converted: 'success',
  lost: 'low',
  spam: 'low',
};

export function LeadsTable({ leads, onSelectLead }: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Phone className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No leads yet</h3>
          <p className="text-gray-500 mt-1">
            Missed calls will appear here automatically
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Recent Leads</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {leads.map((lead) => (
            <button
              key={lead.id}
              onClick={() => onSelectLead?.(lead)}
              className={cn(
                'w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left',
                lead.urgency === 'emergency' && 'bg-red-50 hover:bg-red-100'
              )}
            >
              {/* Urgency indicator */}
              <div
                className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  lead.urgency === 'emergency' && 'bg-red-500',
                  lead.urgency === 'high' && 'bg-orange-500',
                  lead.urgency === 'normal' && 'bg-blue-500',
                  lead.urgency === 'low' && 'bg-gray-400',
                  !lead.urgency && 'bg-gray-300'
                )}
              />

              {/* Phone & Issue */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatPhone(lead.caller_phone)}</span>
                  {lead.urgency && (
                    <Badge variant={urgencyVariant[lead.urgency]}>
                      {lead.urgency}
                    </Badge>
                  )}
                  <Badge variant={statusVariant[lead.status] || 'default'}>
                    {lead.status}
                  </Badge>
                </div>
                {lead.issue && (
                  <p className="text-sm text-gray-600 truncate mt-0.5">{lead.issue}</p>
                )}
                {lead.sms_response_text && !lead.issue && (
                  <p className="text-sm text-gray-500 truncate mt-0.5 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {lead.sms_response_text}
                  </p>
                )}
              </div>

              {/* Time */}
              <div className="flex items-center gap-1 text-sm text-gray-500 flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
                {formatRelativeTime(lead.created_at)}
              </div>

              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
