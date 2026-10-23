import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Content, GenerateContentConfig, Part } from '@google/genai';

const DEFAULT_MODEL = 'gemini-3.8-flash';
/** Floor for JSON classification so thinking tokens don't truncate the payload. */
const MIN_JSON_OUTPUT_TOKENS = 1024;

const apiKey = process.env.GOOGLE_GEMINI_API_KEY!;
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

const genAI = new GoogleGenAI({ apiKey });

type LegacyGenerationConfig = {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  topP?: number;
  topK?: number;
};

type LegacyGenerateContentRequest = {
  contents: Content[] | Content | Part[] | string;
  generationConfig?: LegacyGenerationConfig;
};

/**
 * Compatibility shim matching the old @google/generative-ai GenerativeModel
 * surface used by callers (`generateContent` + `result.response.text()`).
 */
export const geminiFlash = {
  async generateContent(request: LegacyGenerateContentRequest) {
    const { generationConfig } = request;
    const isJson = generationConfig?.responseMimeType === 'application/json';
    const requestedTokens = generationConfig?.maxOutputTokens;
    const maxOutputTokens =
      isJson && (requestedTokens == null || requestedTokens < MIN_JSON_OUTPUT_TOKENS)
        ? MIN_JSON_OUTPUT_TOKENS
        : requestedTokens;

    const config: GenerateContentConfig = {
      temperature: generationConfig?.temperature,
      maxOutputTokens,
      responseMimeType: generationConfig?.responseMimeType,
      topP: generationConfig?.topP,
      topK: generationConfig?.topK,
      // Gemini 3.x thinking counts against maxOutputTokens; keep budget low.
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
    };

    const response = await genAI.models.generateContent({
      model,
      contents: request.contents,
      config,
    });

    return {
      response: {
        text: () => response.text ?? '',
      },
    };
  },
};

export { genAI };
