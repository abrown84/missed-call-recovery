import { createServerClient } from '@/lib/supabase';
import type { ClassificationResult, UrgencyLevel, Vertical } from '@/types';

/**
 * Urgency Classification Service
 * Analyzes SMS responses to determine urgency level using keyword matching
 * with optional NLP enrichment (future enhancement)
 */

// Base emergency indicators (used across all verticals)
const BASE_EMERGENCY_PATTERNS = [
  /\b(emergency|urgent|asap|immediately|right now|help)\b/i,
  /\b(danger|dangerous|unsafe|hazard)\b/i,
  /\b(can'?t wait|need.*now|please hurry)\b/i,
];

// Patterns that indicate low urgency / can wait
const LOW_URGENCY_PATTERNS = [
  /\b(quote|estimate|pricing|cost)\b/i,
  /\b(next week|whenever|no rush|when.*available)\b/i,
  /\b(just asking|information|wondering)\b/i,
];

// Stop/spam patterns
const SPAM_PATTERNS = [
  /\b(stop|unsubscribe|remove me|wrong number)\b/i,
];

export async function classifyUrgency(
  messageText: string,
  vertical: string
): Promise<ClassificationResult> {
  const supabase = createServerClient();
  const text = messageText.toLowerCase();
  const matchedKeywords: string[] = [];
  let score = 0;

  // Check for spam/stop first
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      return {
        urgency: 'low',
        confidence: 1,
        keywords: ['stop'],
        issue: 'Opt-out request',
      };
    }
  }

  // Check base emergency patterns
  for (const pattern of BASE_EMERGENCY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      score += 8;
      matchedKeywords.push(match[0]);
    }
  }

  // Check low urgency patterns
  for (const pattern of LOW_URGENCY_PATTERNS) {
    if (pattern.test(text)) {
      score -= 5;
    }
  }

  // Fetch vertical-specific keywords from database
  const { data: keywords } = await supabase
    .from('emergency_keywords')
    .select('keyword, weight')
    .in('vertical', [vertical, 'general']);

  if (keywords) {
    for (const { keyword, weight } of keywords) {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(text)) {
        score += weight;
        matchedKeywords.push(keyword);
      }
    }
  }

  // Determine urgency level based on score
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

  // Extract potential issue description (first sentence or full message if short)
  const issue = extractIssue(messageText);

  return {
    urgency,
    confidence,
    keywords: matchedKeywords,
    issue,
  };
}

function extractIssue(text: string): string {
  // Get first sentence or first 100 chars
  const firstSentence = text.split(/[.!?]/)[0];
  if (firstSentence.length <= 100) {
    return firstSentence.trim();
  }
  return text.slice(0, 100).trim() + '...';
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
