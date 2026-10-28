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
          opted_out: boolean;
          opted_out_at: string | null;
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
          opted_out?: boolean;
          opted_out_at?: string | null;
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
          opted_out?: boolean;
          opted_out_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sms_suppressions: {
        Row: {
          id: string;
          business_id: string;
          phone: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          phone: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          phone?: string;
          reason?: string | null;
          created_at?: string;
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
      campaigns: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          vertical: string;
          urgency_filter: string | null;
          status: string;
          auto_enroll: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          vertical?: string;
          urgency_filter?: string | null;
          status?: string;
          auto_enroll?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          vertical?: string;
          urgency_filter?: string | null;
          status?: string;
          auto_enroll?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      campaign_steps: {
        Row: {
          id: string;
          campaign_id: string;
          step_number: number;
          delay_minutes: number;
          template_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          step_number: number;
          delay_minutes: number;
          template_key: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          step_number?: number;
          delay_minutes?: number;
          template_key?: string;
          created_at?: string;
        };
      };
      campaign_enrollments: {
        Row: {
          id: string;
          lead_id: string;
          campaign_id: string;
          current_step: number;
          status: string;
          next_send_at: string | null;
          claimed_at: string | null;
          enrolled_at: string;
          paused_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          campaign_id: string;
          current_step?: number;
          status?: string;
          next_send_at?: string | null;
          claimed_at?: string | null;
          enrolled_at?: string;
          paused_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          campaign_id?: string;
          current_step?: number;
          status?: string;
          next_send_at?: string | null;
          claimed_at?: string | null;
          enrolled_at?: string;
          paused_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
