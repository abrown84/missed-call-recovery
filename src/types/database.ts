// Supabase Database Types
// Run `npx supabase gen types typescript` to regenerate from actual schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          name: string;
          phone: string;
          vertical: string;
          timezone: string;
          business_hours_start: string;
          business_hours_end: string;
          after_hours_enabled: boolean;
          emergency_phone: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          vertical?: string;
          timezone?: string;
          business_hours_start?: string;
          business_hours_end?: string;
          after_hours_enabled?: boolean;
          emergency_phone?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          vertical?: string;
          timezone?: string;
          business_hours_start?: string;
          business_hours_end?: string;
          after_hours_enabled?: boolean;
          emergency_phone?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      missed_calls: {
        Row: {
          id: string;
          business_id: string;
          caller_phone: string;
          called_at: string;
          ring_duration: number;
          call_sid: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          caller_phone: string;
          called_at?: string;
          ring_duration?: number;
          call_sid: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          caller_phone?: string;
          called_at?: string;
          ring_duration?: number;
          call_sid?: string;
          created_at?: string;
        };
      };
      leads: {
        Row: {
          id: string;
          business_id: string;
          missed_call_id: string;
          caller_phone: string;
          status: string;
          urgency: string | null;
          issue: string | null;
          sms_outbound_sid: string | null;
          sms_response_text: string | null;
          classified_at: string | null;
          escalated_at: string | null;
          converted_at: string | null;
          estimated_value: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          missed_call_id: string;
          caller_phone: string;
          status?: string;
          urgency?: string | null;
          issue?: string | null;
          sms_outbound_sid?: string | null;
          sms_response_text?: string | null;
          classified_at?: string | null;
          escalated_at?: string | null;
          converted_at?: string | null;
          estimated_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          missed_call_id?: string;
          caller_phone?: string;
          status?: string;
          urgency?: string | null;
          issue?: string | null;
          sms_outbound_sid?: string | null;
          sms_response_text?: string | null;
          classified_at?: string | null;
          escalated_at?: string | null;
          converted_at?: string | null;
          estimated_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sms_messages: {
        Row: {
          id: string;
          lead_id: string;
          direction: string;
          body: string;
          message_sid: string;
          status: string;
          sent_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          direction: string;
          body: string;
          message_sid: string;
          status?: string;
          sent_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          direction?: string;
          body?: string;
          message_sid?: string;
          status?: string;
          sent_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
