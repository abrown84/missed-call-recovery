// @ts-nocheck
import { createServerClient } from '@/lib/supabase';
import { geminiFlash } from '@/lib/gemini';
import type { ClassificationResult, UrgencyLevel } from '@/types';
import {
  classifyOptOut,
  isDefiniteOptOut,
} from '@/services/opt-out';

/**
 * Urgency Classification Service
 * Uses Gemini Flash for AI-powered classification with keyword fallback
 */

/** @deprecated Prefer classifyOptOut / isDefiniteOptOut — kept for import compat. */
export const SPAM_PATTERNS = [
  /^(stop|stopall|stop all|unsubscribe|quit|end|cancel|optout|opt out|opt-out|revoke)$/i,
];

export const EMERGENCY_PATTERNS = [
  /\b(emergency|urgent|asap|immediately|right now|help)\b/i,
  /\b(danger|dangerous|unsafe|hazard)\b/i,
  /\b(can'?t wait|need.*now|please hurry)\b/i,
];

export const LOW_URGENCY_PATTERNS = [
  /\b(quote|estimate|pricing|cost)\b/i,
  /\b(next week|whenever|no rush|when.*available)\b/i,
  /\b(just asking|information|wondering)\b/i,
];

/**
 * Definite whole-message opt-out (NFKC-normalized).
 * Does NOT match "won't stop leaking" / "stop by today" / "wrong number".
 */
export function isOptOutMessage(messageText: string): boolean {
  return isDefiniteOptOut(messageText);
}

export { classifyOptOut, isDefiniteOptOut };

/**
 * Score a message using built-in patterns + optional keyword weights.
 * Pure function — safe to unit test without DB or AI.
 */
export function scoreUrgencyKeywords(
  messageText: string,
  keywordWeights: Array<{ keyword: string; weight: number }> = []
): { score: number; matchedKeywords: string[]; urgency: UrgencyLevel; confidence: number } {
  const text = messageText.toLowerCase();
  const matchedKeywords: string[] = [];
  let score = 0;

  for (const pattern of EMERGENCY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      score += 8;
      matchedKeywords.push(match[0]);
    }
  }

  for (const pattern of LOW_URGENCY_PATTERNS) {
    if (pattern.test(text)) {
      score -= 5;
    }
  }

  for (const { keyword, weight } of keywordWeights) {
    const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
    if (regex.test(text)) {
      score += weight;
      matchedKeywords.push(keyword);
    }
  }

  let urgency: UrgencyLevel;
  let confidence: number;

  if (score >= 15) {
    urgency = 'emergency';
    confidence = Math.min(score / 20, 1);
  } else if (score >= 8) {
    urgency = 'high';
    confidence = Math.min(score / 15, 0.9);
  } else if (score >= 3) {
    urgency = 'normal';
    confidence = 0.7;
  } else {
    urgency = 'low';
    confidence = 0.6;
  }

  return { score, matchedKeywords, urgency, confidence };
}

/**
 * Main classification function - uses AI with keyword fallback
 */
export async function classifyUrgency(
  messageText: string,
  vertical: string
): Promise<ClassificationResult> {
  // Check for spam/stop first (no need for AI)
  if (isOptOutMessage(messageText)) {
    return {
      urgency: 'low',
      confidence: 1,
      keywords: ['stop'],
      issue: 'Opt-out request',
    };
  }

  // Try AI classification first
  try {
    const result = await classifyWithAI(messageText, vertical);
    return result;
  } catch (error) {
    console.error('AI classification failed, falling back to keywords:', error);
    return classifyWithKeywords(messageText, vertical);
  }
}

/**
 * AI-powered classification using Gemini Flash
 */
async function classifyWithAI(
  messageText: string,
  vertical: string
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(messageText, vertical);

  const result = await geminiFlash.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      // Thinking tokens count toward this limit on Gemini 3.x; keep headroom for JSON.
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  });

  const response = result.response.text();
  const parsed = JSON.parse(response) as {
    urgency: string;
    confidence: number;
    issue: string;
    reasoning: string;
  };

  // Validate urgency level
  const validUrgencies: UrgencyLevel[] = ['emergency', 'high', 'normal', 'low'];
  const urgency = validUrgencies.includes(parsed.urgency as UrgencyLevel)
    ? (parsed.urgency as UrgencyLevel)
    : 'normal';

  return {
    urgency,
    confidence: Math.min(Math.max(parsed.confidence, 0), 1),
    keywords: [], // AI doesn't return keywords
    issue: parsed.issue || extractIssue(messageText),
  };
}

function buildClassificationPrompt(messageText: string, vertical: string): string {
  const verticalContext: Record<string, string> = {
    plumbing: 'water leaks, pipe bursts, flooding, sewage backups, no water, clogged drains',
    hvac: 'no heat, no AC, furnace failure, gas smell, carbon monoxide, freezing conditions',
    electrical: 'no power, sparks, burning smell, electrical fire risk, shock hazard',
    locksmith: 'locked out, broken lock, security breach, car lockout',
    restoration: 'water damage, fire damage, mold, storm damage',
    roofing: 'active leak, storm damage, structural damage',
    pest_control: 'infestation, bites, dangerous pests',
    general: 'general service issues',
  };

  const context = verticalContext[vertical] || verticalContext.general;

  return `You are classifying the urgency of a customer message for a ${vertical} service business.

VERTICAL CONTEXT: ${context}

URGENCY LEVELS:
- "emergency": Immediate danger, active damage, or critical failure requiring same-day response
  Examples: flooding, gas leak, no heat in freezing weather, electrical fire risk, locked out of home
- "high": Urgent but not immediately dangerous, should be addressed within 24 hours
  Examples: water heater not working, AC out in summer, partial power loss
- "normal": Standard service request, can be scheduled normally
  Examples: routine maintenance, minor repair, inspection request
- "low": Not urgent, informational, or just requesting a quote
  Examples: pricing inquiry, future scheduling, general questions

CUSTOMER MESSAGE:
"${messageText}"

Respond with JSON only:
{
  "urgency": "emergency" | "high" | "normal" | "low",
  "confidence": 0.0-1.0,
  "issue": "brief description of the problem",
  "reasoning": "why this urgency level"
}`;
}

/**
 * Keyword-based fallback classification
 */
async function classifyWithKeywords(
  messageText: string,
  vertical: string
): Promise<ClassificationResult> {
  const supabase = createServerClient();

  const { data: keywords } = await supabase
    .from('emergency_keywords')
    .select('keyword, weight')
    .in('vertical', [vertical, 'general']);

  const scored = scoreUrgencyKeywords(messageText, keywords || []);

  return {
    urgency: scored.urgency,
    confidence: scored.confidence,
    keywords: scored.matchedKeywords,
    issue: extractIssue(messageText),
  };
}

export function extractIssue(text: string): string {
  const firstSentence = text.split(/[.!?]/)[0];
  if (firstSentence.length <= 100) {
    return firstSentence.trim();
  }
  return text.slice(0, 100).trim() + '...';
}

export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
