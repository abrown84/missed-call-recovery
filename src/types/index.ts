// Core domain types for Missed Call Recovery Platform

export type UrgencyLevel = 'emergency' | 'high' | 'normal' | 'low';

export type LeadStatus =
  | 'pending'      // SMS sent, awaiting response
  | 'responded'    // Customer replied
  | 'qualified'    // Urgency classified
  | 'escalated'    // Sent to dispatcher/owner
  | 'converted'    // Job booked
  | 'lost'         // No response / declined
  | 'spam';        // Filtered out

export type Vertical =
  | 'plumbing'
  | 'hvac'
  | 'electrical'
  | 'locksmith'
  | 'restoration'
  | 'roofing'
  | 'pest_control'
  | 'general';

export interface Business {
  id: string;
  name: string;
  phone: string;           // Twilio number
  vertical: Vertical;
  timezone: string;
  businessHoursStart: string; // "08:00"
  businessHoursEnd: string;   // "18:00"
  afterHoursEnabled: boolean;
  emergencyPhone?: string;    // Escalation number
  createdAt: Date;
  updatedAt: Date;
}

export interface MissedCall {
  id: string;
  businessId: string;
  callerPhone: string;
  calledAt: Date;
  ringDuration: number;     // seconds
  callSid: string;          // Twilio Call SID
  createdAt: Date;
}

export interface Lead {
  id: string;
  businessId: string;
  missedCallId: string;
  callerPhone: string;
  status: LeadStatus;
  urgency?: UrgencyLevel;
  issue?: string;           // Extracted from SMS response
  smsOutboundSid?: string;
  smsResponseText?: string;
  classifiedAt?: Date;
  escalatedAt?: Date;
  convertedAt?: Date;
  estimatedValue?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SMSMessage {
  id: string;
  leadId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  messageSid: string;
  status: string;
  sentAt: Date;
}

export interface ClassificationResult {
  urgency: UrgencyLevel;
  confidence: number;
  keywords: string[];
  issue?: string;
}

// Twilio webhook payloads
export interface TwilioCallStatusPayload {
  CallSid: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer';
  From: string;
  To: string;
  Direction: string;
  CallDuration?: string;
  Timestamp?: string;
}

export interface TwilioSMSPayload {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Analytics types
export interface RecoveryStats {
  period: 'day' | 'week' | 'month';
  missedCalls: number;
  smsDelivered: number;
  responses: number;
  responseRate: number;
  emergencies: number;
  recoveredLeads: number;
  estimatedRevenue: number;
}
