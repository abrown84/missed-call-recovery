// @ts-nocheck
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
  phone: string;           // Business phone (BRWN device SIM / line)

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
  callSid: string;          // Device call id (unique per missed call)

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

/** Authenticated missed-call event from the BRWN device. */
export interface BrwnMissedCallPayload {
  callerPhone: string;
  businessPhone: string;
  callId: string;
  ringDurationSeconds?: number;
}

/** Inbound SMS forwarded from the BRWN relay webhook. */
export interface BrwnInboundPayload {
  from: string;
  body: string;
  to?: string;
  businessPhone?: string;
  messageId?: string;
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
