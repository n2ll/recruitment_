/**
 * 퓨샷 예시 + 사실 정보 로더 — Supabase `prompt_examples` 테이블에서 동적 로드.
 *
 * - category='conversation' : 일반 대화 톤 (모든 stage)
 * - category='screening'    : 스크리닝 단계 운영 항목/문구
 * - category='facts'        : AI가 사실로 인용 가능한 운영 정보 (지점별 시급/구인 상태/정책 등)
 *
 * 매니저가 admin UI에서 편집하면 다음 캐시 만료(60초) 이후 자동 반영.
 */

import { createServiceClient } from "@/lib/supabase";

interface CachedCategory {
  text: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CachedCategory>();

async function fetchCategory(category: "conversation" | "screening" | "facts"): Promise<string> {
  const cached = cache.get(category);
  if (cached && cached.expiresAt > Date.now()) return cached.text;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("prompt_examples")
      .select("title, body, sort_order")
      .eq("category", category)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error(`[agent/examples] supabase error for ${category}`, error);
      return cached?.text ?? "";
    }

    const text = (data ?? [])
      .map((row) => `[${row.title}]\n${row.body}`)
      .join("\n\n");

    cache.set(category, { text, expiresAt: Date.now() + CACHE_TTL_MS });
    return text;
  } catch (e) {
    console.error(`[agent/examples] exception for ${category}`, e);
    return cached?.text ?? "";
  }
}

export async function loadConversationExamples(): Promise<string> {
  return fetchCategory("conversation");
}

export async function loadScreeningExamples(): Promise<string> {
  return fetchCategory("screening");
}

export async function loadFacts(): Promise<string> {
  return fetchCategory("facts");
}

/**
 * 시스템 프롬프트 끝에 붙일 톤 가이드 블록.
 */
export async function buildToneGuide(
  opts: { includeScreening?: boolean } = {}
): Promise<string> {
  const [conv, facts] = await Promise.all([
    loadConversationExamples(),
    loadFacts(),
  ]);
  const lines = [
    "## 매니저 실제 대화 톤 — 반드시 모방",
    "아래는 매니저 홍석범이 실제로 지원자에게 보낸 메시지 모음이다.",
    "이 톤·길이·이모지·맞춤법(가벼운 오타 포함)·말투를 그대로 따라라.",
    "- 짧고 친근하게. 한 메시지에 1~2문장이 기본.",
    '- "네 선생님!", "감사합니다", "ㅎㅎ", "ㅠ", "^^" 같은 매니저 어투를 자연스럽게 섞어라.',
    "- 격식 차린 AI 말투 금지 (예: \"안녕하세요, 저는 ~입니다. 몇 가지 확인해 드릴게요!\" 같은 정형문 X).",
    "- 이모지는 매니저 예시처럼 가끔만. ☺️/😊 같은 풍부한 이모지 남발 금지.",
    "",
    "[예시 — 매니저 실제 메시지]",
    conv,
  ];

  if (facts) {
    lines.push(
      "",
      "## AI 참고자료 — 사실 (지점·시급·구인 상태·정책 등)",
      "아래 정보는 매니저가 관리하는 최신 운영 정보다. 지원자가 질문하면 이 정보 안에서만 답해라.",
      "여기에 없는 사실(시급·시간대·인근 지하철역·시작일 등)은 추측하지 말고 매니저에게 인계해라.",
      "",
      facts
    );
  }

  if (opts.includeScreening) {
    const screening = await loadScreeningExamples();
    lines.push(
      "",
      "## 스크리닝 운영 항목 원본 (참고)",
      "체크리스트 항목·자동 발송 본문이 어디서 왔는지 확인용. 그대로 인용보다는 톤을 흡수해 자연스럽게 풀어라.",
      "",
      screening
    );
  }

  return lines.join("\n");
}

// 캐시 강제 무효화 (편집 직후 즉시 반영하고 싶을 때 사용)
export function invalidateExamplesCache(): void {
  cache.clear();
}
