import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { collectAssistantText, harvestAnthropic, harvestGemini } from "./harvest.js";
import { decomposePrompt, retrievePrompt } from "./prompts.js";
import { extractJson } from "./verification.js";

const ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
const GEMINI_MODEL = "gemini-2.5-pro";

export function hasAnthropicKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function liveModelAvailable(model) {
  if (process.env.PULL_FORCE_DEMO === "1") return false;
  return model === "google" ? hasGeminiKey() : hasAnthropicKey();
}

function parseOrMinimal(text, query) {
  return (
    extractJson(text) || {
      intent: query,
      constraints: [query],
      searchQueries: [query],
      destinations: [],
    }
  );
}

export async function runAnthropic({ query, domain, facts, constraints }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const decomposition = await decomposeWithAnthropic(client, {
    query,
    domain,
    facts,
    constraints,
  });
  const retrieve = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [
      {
        role: "user",
        content: retrievePrompt({ query, domain, decomposition, facts }),
      },
    ],
  });
  const text = collectAssistantText(retrieve);
  const parsed = parseOrMinimal(text, query);
  return {
    provider: "anthropic",
    model: ANTHROPIC_MODEL,
    decomposition,
    parsed: {
      ...parsed,
      destinations: parsed.destinations || [],
      constraints: parsed.constraints || decomposition.constraints || [],
    },
    harvestedUrls: harvestAnthropic(retrieve),
    rawText: text,
  };
}

async function decomposeWithAnthropic(client, input) {
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: decomposePrompt(input) }],
  });
  return parseOrMinimal(collectAssistantText(response), input.query);
}

export async function runGemini({ query, domain, facts, constraints }) {
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  });
  const decomposition = await decomposeWithGemini(client, {
    query,
    domain,
    facts,
    constraints,
  });
  const retrieve = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: retrievePrompt({ query, domain, decomposition, facts }),
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
  const text =
    retrieve.text ||
    collectAssistantText(retrieve) ||
    retrieve.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ||
    "";
  const parsed = parseOrMinimal(text, query);
  return {
    provider: "google",
    model: GEMINI_MODEL,
    decomposition,
    parsed: {
      ...parsed,
      destinations: parsed.destinations || [],
      constraints: parsed.constraints || decomposition.constraints || [],
    },
    harvestedUrls: harvestGemini(retrieve),
    rawText: text,
  };
}

async function decomposeWithGemini(client, input) {
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: decomposePrompt(input),
  });
  const text = response.text || collectAssistantText(response) || "";
  return parseOrMinimal(text, input.query);
}

export async function runModelRouter(payload) {
  if (payload.model === "google") return runGemini(payload);
  return runAnthropic(payload);
}
