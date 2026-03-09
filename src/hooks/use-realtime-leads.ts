'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
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
  sms_messages?: Array<{
    id: string;
    direction: 'inbound' | 'outbound';
    body: string;
    sent_at: string;
  }>;
}

interface UseRealtimeLeadsOptions {
  businessId: string;
  onInsert?: (lead: Lead) => void;
  onUpdate?: (lead: Lead) => void;
  onDelete?: (id: string) => void;
}

export function useRealtimeLeads({
  businessId,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeLeadsOptions) {
  const supabase = createClient();

  const setupSubscription = useCallback(() => {
    // Check if supabase client has channel method (not mock)
    if (!('channel' in supabase)) {
      console.log('Supabase not configured, skipping realtime subscription');
      return null;
    }

    const channel: RealtimeChannel = supabase
      .channel(`leads:${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'missed_calls',
          filter: `business_id=eq.${businessId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('New lead:', payload.new);
          onInsert?.(payload.new as unknown as Lead);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'missed_calls',
          filter: `business_id=eq.${businessId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('Lead updated:', payload.new);
          onUpdate?.(payload.new as unknown as Lead);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'missed_calls',
          filter: `business_id=eq.${businessId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('Lead deleted:', payload.old);
          onDelete?.((payload.old as unknown as Lead).id);
        }
      )
      .subscribe((status: string) => {
        console.log('Realtime subscription status:', status);
      });

    return channel;
  }, [businessId, onInsert, onUpdate, onDelete, supabase]);

  useEffect(() => {
    const channel = setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [setupSubscription, supabase]);
}
