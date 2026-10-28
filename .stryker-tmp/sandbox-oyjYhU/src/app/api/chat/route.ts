// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { geminiFlash } from '@/lib/gemini';
import { createServerClient } from '@/lib/supabase';
import { requireApiUser } from '@/lib/auth-api';

export const dynamic = 'force-dynamic';

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
  businessId: z.string().uuid().optional(),
});

const SYSTEM_PROMPT = `You are an AI assistant for a Missed Call Recovery platform. You help service business owners (plumbers, HVAC techs, electricians) understand their leads and make decisions.

You have access to the business's lead data and can:
- Summarize lead activity and trends
- Explain urgency classifications
- Suggest which leads to prioritize
- Help draft follow-up SMS messages
- Answer questions about how the platform works

Be concise, helpful, and action-oriented. These are busy business owners who need quick insights.

CURRENT CONTEXT:
{context}

Respond in a helpful, conversational tone. Keep responses brief unless asked for details.`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;

    const json = await request.json().catch(() => null);
    const parsed = chatSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { messages, businessId } = parsed.data;

    let contextData = 'No business data available.';
    if (businessId) {
      contextData = await fetchBusinessContext(businessId);
    }

    const systemPrompt = SYSTEM_PROMPT.replace('{context}', contextData);

    const geminiMessages = messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const fullMessages = [
      {
        role: 'user',
        parts: [
          {
            text: `System: ${systemPrompt}\n\nNow respond to the user.`,
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            text: "Understood. I'm ready to help with your missed call recovery platform. What would you like to know?",
          },
        ],
      },
      ...geminiMessages,
    ];

    const result = await geminiFlash.generateContent({
      contents: fullMessages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    const response = result.response.text();

    return NextResponse.json({
      success: true,
      message: response,
    });
  } catch (error) {
    console.error('Chat error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}

async function fetchBusinessContext(businessId: string): Promise<string> {
  try {
    const supabase = createServerClient();

    const { data: leads } = await supabase
      .from('leads')
      .select('status, urgency, issue, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!leads || leads.length === 0) {
      return 'No recent leads found.';
    }

    const statusCounts: Record<string, number> = {};
    const urgencyCounts: Record<string, number> = {};
    const recentIssues: string[] = [];

    for (const lead of leads) {
      statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
      if (lead.urgency) {
        urgencyCounts[lead.urgency] = (urgencyCounts[lead.urgency] || 0) + 1;
      }
      if (lead.issue && recentIssues.length < 5) {
        // Issues may contain customer wording — keep short, no phones expected here.
        recentIssues.push(String(lead.issue).slice(0, 120));
      }
    }

    return `
Recent leads (last 20):
- Status breakdown: ${Object.entries(statusCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')}
- Urgency breakdown: ${
      Object.entries(urgencyCounts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') || 'None classified'
    }
- Recent issues: ${recentIssues.join('; ') || 'None recorded'}
- Total: ${leads.length} leads
    `.trim();
  } catch (error) {
    console.error(
      'Failed to fetch context:',
      error instanceof Error ? error.message : 'unknown'
    );
    return 'Unable to fetch business data.';
  }
}
