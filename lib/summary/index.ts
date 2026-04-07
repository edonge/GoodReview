// Summary service entry point.
// USE_OPENAI 플래그 + key 존재 여부에 따라 OpenAI 호출 시도, 실패 시 mock fallback.

import { USE_OPENAI } from "@/lib/config";
import type { AiSummary } from "@/lib/types";
import { buildMockSummary } from "./mock";
import { callOpenAI } from "./openai";
import type { SummaryInput } from "./types";

export async function generateSummary(input: SummaryInput): Promise<AiSummary> {
  if (!USE_OPENAI) return buildMockSummary(input);
  try {
    return await callOpenAI(input);
  } catch (err) {
    console.warn("[summary] OpenAI 호출 실패 → mock 사용", err);
    return buildMockSummary(input);
  }
}

export type { SummaryInput };
