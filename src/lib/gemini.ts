/**
 * AI client routed exclusively through One Gateway
 * (https://github.com/abrown84/one-gateway) — OpenAI-compatible
 * `POST {ONE_GATEWAY_URL}/v1/chat/completions`.
 *
 * Compatibility shim matching the old GenerativeModel surface used by callers
 * (`generateContent` + `result.response.text()`).
 */

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const DEFAULT_MODEL = 'gemini-3.8-flash';
/** Floor for JSON classification so thinking / preamble doesn't truncate the payload. */
const MIN_JSON_OUTPUT_TOKENS = 1024;
const DEFAULT_GATEWAY_URL = 'https://brwnindustries.com/labs/one-gateway';
const DEFAULT_AGENT_ID = 'main';
const DEFAULT_TIMEOUT_MS = 45_000;

type LegacyPart = { text?: string };

type LegacyContent = {
  role?: string;
  parts?: LegacyPart[];
};

type LegacyGenerationConfig = {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  topP?: number;
  topK?: number;
};

type LegacyGenerateContentRequest = {
  contents: LegacyContent[] | LegacyContent | LegacyPart[] | string;
  generationConfig?: LegacyGenerationConfig;
};

/** Validate and normalize a One Gateway base URL (exported for unit tests). */
export function resolveGatewayUrl(rawInput?: string): string {
  const raw = rawInput?.trim() || DEFAULT_GATEWAY_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid ONE_GATEWAY_URL: not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid ONE_GATEWAY_URL: only http: and https: are allowed');
  }
  const host = url.hostname.toLowerCase();
  const isLoopback =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (url.protocol === 'http:' && !isLoopback) {
    throw new Error(
      'Invalid ONE_GATEWAY_URL: remote gateways must use https: (http: is only allowed for localhost)'
    );
  }
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

function getGatewayUrl(): string {
  return resolveGatewayUrl(process.env.ONE_GATEWAY_URL);
}

/** Optional — Authorization is only sent when ONE_GATEWAY_TOKEN is set. */
function getToken(): string | undefined {
  const token = process.env.ONE_GATEWAY_TOKEN?.trim();
  if (!token) return undefined;
  if (/[\x00-\x1f\x7f]/.test(token)) {
    throw new Error('Invalid ONE_GATEWAY_TOKEN: contains control characters');
  }
  return token;
}

function getModel(): string {
  return process.env.ONE_GATEWAY_MODEL?.trim() || DEFAULT_MODEL;
}

function getAgentId(): string {
  return process.env.ONE_GATEWAY_AGENT?.trim() || DEFAULT_AGENT_ID;
}

function getTimeoutMs(): number {
  const n = Number(process.env.ONE_GATEWAY_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

function extractTextFromParts(parts: LegacyPart[] | undefined): string {
  if (!parts?.length) return '';
  return parts.map((p) => p.text ?? '').join('');
}

function mapRole(role: string | undefined): ChatMessage['role'] {
  if (role === 'model' || role === 'assistant') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
}

/**
 * Convert Gemini-style contents into OpenAI chat messages for One Gateway.
 */
function toChatMessages(
  contents: LegacyGenerateContentRequest['contents']
): ChatMessage[] {
  if (typeof contents === 'string') {
    return [{ role: 'user', content: contents }];
  }

  if (Array.isArray(contents)) {
    // Part[] — array of { text } without role
    if (
      contents.length > 0 &&
      typeof contents[0] === 'object' &&
      contents[0] !== null &&
      !('role' in contents[0]) &&
      'text' in contents[0]
    ) {
      return [
        {
          role: 'user',
          content: extractTextFromParts(contents as LegacyPart[]),
        },
      ];
    }

    return (contents as LegacyContent[]).map((c) => ({
      role: mapRole(c.role),
      content: extractTextFromParts(c.parts),
    }));
  }

  // Single Content object
  return [
    {
      role: mapRole(contents.role),
      content: extractTextFromParts(contents.parts),
    },
  ];
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function callGateway(args: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const baseUrl = getGatewayUrl();
  const token = getToken();
  const model = getModel();
  const agentId = getAgentId();
  const timeoutMs = getTimeoutMs();

  const temperature = args.temperature ?? 0.2;
  const maxTokens = args.maxTokens ?? 500;

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error('temperature must be a number between 0 and 2');
  }
  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 128_000) {
    throw new Error('maxTokens must be an integer between 1 and 128000');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-openclaw-agent-id': agentId,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: args.messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 2048) };
    }

    if (!res.ok) {
      throw new Error(`One Gateway HTTP ${res.status} for model=${model}`);
    }

    const content = (
      json as { choices?: { message?: { content?: string } }[] }
    )?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`Empty content from One Gateway for model=${model}`);
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}

export const geminiFlash = {
  async generateContent(request: LegacyGenerateContentRequest) {
    const { generationConfig } = request;
    const isJson = generationConfig?.responseMimeType === 'application/json';
    const requestedTokens = generationConfig?.maxOutputTokens;
    const maxOutputTokens =
      isJson && (requestedTokens == null || requestedTokens < MIN_JSON_OUTPUT_TOKENS)
        ? MIN_JSON_OUTPUT_TOKENS
        : requestedTokens;

    let messages = toChatMessages(request.contents);

    if (isJson) {
      // Gateway is OpenAI-compatible; reinforce JSON-only when callers asked for it.
      messages = [
        {
          role: 'system',
          content:
            'Respond with valid JSON only. Do not wrap the response in markdown code fences.',
        },
        ...messages,
      ];
    }

    const content = await callGateway({
      messages,
      temperature: generationConfig?.temperature,
      maxTokens: maxOutputTokens,
    });

    const text = isJson ? stripJsonFences(content) : content;

    return {
      response: {
        text: () => text,
      },
    };
  },
};
