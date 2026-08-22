import { GoogleGenAI } from '@google/genai';
import { HfInference } from '@huggingface/inference';

function getHfApiKey() {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  return token && token.trim().length > 0 ? token.trim() : null;
}

function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export interface AutoFixResult {
  success: boolean;
  fixedCode?: string;
  explanation?: string;
  error?: string;
}

export interface ExplainResult {
  success: boolean;
  explanation?: string;
  error?: string;
}

export interface AssistResult {
  success: boolean;
  response?: string;
  suggestedCode?: string;
  error?: string;
}

/**
 * Call Hugging Face Inference API via official SDK
 */
async function callHuggingFace(prompt: string, hfToken: string): Promise<string> {
  const model = process.env.HF_MODEL || 'Qwen/Qwen2.5-Coder-32B-Instruct';
  console.log(`[AI Engine] Using Hugging Face Inference API (Model: "${model}")...`);

  const hf = new HfInference(hfToken);
  const response = await hf.chatCompletion({
    model: model,
    messages: [
      {
        role: 'system',
        content: 'You are an expert AI software engineer, code editor assistant, and automated debugger.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 2048,
    temperature: 0.2,
  });

  const outputText = response.choices?.[0]?.message?.content || '';
  if (!outputText) {
    throw new Error('HuggingFace API returned an empty response.');
  }

  return outputText;
}

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
  'gemini-3.5-flash',
].filter(Boolean) as string[];

/**
 * Call Google Gemini API
 */
async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  let lastError: any = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(`[AI Engine] Attempting Gemini API with model "${modelName}"...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      if (response.text) return response.text;
    } catch (err: any) {
      console.warn(`[AI Engine] Gemini model "${modelName}" failed:`, err.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini AI models failed.');
}

/**
 * Main AI Prompt Dispatcher: Tries HF Token first if present, or Gemini, with automatic cross-provider fallback.
 */
async function generateAIResponse(prompt: string): Promise<string> {
  const hfToken = getHfApiKey();
  const geminiKey = getGeminiApiKey();

  if (!hfToken && !geminiKey) {
    throw new Error('No AI API key found. Please add HF_TOKEN or GEMINI_API_KEY in sync-server/.env file.');
  }

  // If HF Token is explicitly provided, prioritize Hugging Face
  if (hfToken) {
    try {
      return await callHuggingFace(prompt, hfToken);
    } catch (hfError: any) {
      console.warn('[AI Engine] Hugging Face failed, checking for Gemini fallback...', hfError.message);
      if (geminiKey) {
        return await callGemini(prompt, geminiKey);
      }
      throw hfError;
    }
  }

  // Otherwise try Gemini
  try {
    return await callGemini(prompt, geminiKey!);
  } catch (geminiError: any) {
    throw geminiError;
  }
}

function formatAiError(err: any): string {
  let msg = err?.message || String(err);

  try {
    const parsed = JSON.parse(msg);
    if (parsed.error?.message) {
      msg = parsed.error.message;
    }
  } catch {}

  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return 'Google Gemini API free tier rate limit reached. Please wait 30 seconds and try again, or add HF_TOKEN in sync-server/.env file for free Hugging Face inference.';
  }

  if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
    return 'Google Gemini servers are currently experiencing high demand (503). Please click the action again in 5 seconds, or paste your HF_TOKEN in sync-server/.env for instant Hugging Face responses.';
  }

  return msg;
}

/**
 * Explains code snippet using HuggingFace / Gemini API.
 */
export async function explainCode(code: string, language: string): Promise<ExplainResult> {
  try {
    const prompt = `You are an expert programming assistant integrated into a collaborative code editor.
Please provide a clear, concise, step-by-step explanation of the following ${language} code for a developer. Use clean markdown formatting.

Code:
\`\`\`${language}
${code}
\`\`\``;

    const text = await generateAIResponse(prompt);

    return {
      success: true,
      explanation: text,
    };
  } catch (err: any) {
    console.error('[AI Explain Error]', err);
    return {
      success: false,
      error: formatAiError(err),
    };
  }
}

/**
 * Agentic Auto-Fix: Analyzes failed Docker execution logs & source code, returning fixed code.
 */
export async function autoFixCode(
  code: string,
  errorLog: string,
  language: string,
  stdin: string = ''
): Promise<AutoFixResult> {
  try {
    const prompt = `You are an expert software engineer and automated debugger.
The following ${language} code was executed in a sandboxed Docker container and produced an error or unexpected output.

[LANGUAGE]: ${language}
[STANDARD INPUT]: ${stdin || '(None)'}

[ERROR / COMPILATION LOG]:
${errorLog}

[CURRENT SOURCE CODE]:
\`\`\`${language}
${code}
\`\`\`

Analyze the root cause of the error and produce a complete, working fix.
Respond ONLY with a valid JSON object matching this exact schema:
{
  "explanation": "A 1-2 sentence explanation of the bug and how you fixed it.",
  "fixedCode": "The complete, corrected source code ready to replace the editor content."
}
IMPORTANT REQUIREMENTS FOR "fixedCode":
- "fixedCode" MUST be clean, valid, standalone ${language} source code.
- Do NOT include any extra or duplicate closing braces '}', trailing garbage, or comments outside main().
- Do NOT wrap "fixedCode" in markdown code fences inside the JSON string.`;

    const rawText = await generateAIResponse(prompt);
    
    // Clean potential markdown JSON wrapping
    const cleanJson = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleanJson);
      let fixedCode = parsed.fixedCode || code;

      // Clean up markdown code blocks if AI wrapped fixedCode inside JSON
      if (typeof fixedCode === 'string') {
        fixedCode = fixedCode
          .replace(/^```(?:[a-z0-9_-]+)?\n/i, '')
          .replace(/\n```$/i, '')
          .replace(/\r\n/g, '\n')
          .trim();
      }

      return {
        success: true,
        fixedCode: fixedCode,
        explanation: parsed.explanation || 'Fixed error in source code.',
      };
    } catch {
      return {
        success: true,
        fixedCode: code,
        explanation: rawText,
      };
    }
  } catch (err: any) {
    console.error('[AI Auto-Fix Error]', err);
    return {
      success: false,
      error: formatAiError(err),
    };
  }
}

/**
 * Handles general AI Copilot requests (Refactor, Add Tests, Custom prompts).
 */
export async function assistCode(
  prompt: string,
  code: string,
  language: string
): Promise<AssistResult> {
  try {
    const fullPrompt = `You are CoEdit AI, a high-performance coding copilot.
User Request: ${prompt}
Programming Language: ${language}

Current Workspace Code:
\`\`\`${language}
${code}
\`\`\`

Please answer the user's request clearly. If your answer includes modified or newly generated code, enclose the primary runnable code block in \`\`\`${language} ... \`\`\` block.`;

    const text = await generateAIResponse(fullPrompt);

    // Extract code block if present
    const codeBlockRegex = new RegExp(`\`\`\`(?:${language}|[a-z0-9_]+)?\\n([\\s\\S]*?)\`\`\``, 'i');
    const match = text.match(codeBlockRegex);
    const suggestedCode = match ? match[1].trim() : undefined;

    return {
      success: true,
      response: text,
      suggestedCode: suggestedCode,
    };
  } catch (err: any) {
    console.error('[AI Assist Error]', err);
    return {
      success: false,
      error: formatAiError(err),
    };
  }
}
