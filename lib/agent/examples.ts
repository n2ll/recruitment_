/**
 * 프롬프트 예시 파일 로더 — 매니저 실제 대화 톤을 시스템 프롬프트에 주입.
 *
 * - prompts/conversation-examples.txt : 일반 대화 톤 (모든 stage)
 * - prompts/screening-examples.txt    : 스크리닝 단계 운영 항목/문구
 *
 * 매니저가 .txt 파일을 수정하면 다음 배포(또는 cold start)부터 반영됨.
 */

import fs from "fs";
import path from "path";

let conversationCache: string | null = null;
let screeningCache: string | null = null;

function readPromptFile(filename: string): string {
  try {
    const filePath = path.join(process.cwd(), "prompts", filename);
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    console.error(`[agent/examples] failed to load ${filename}`, e);
    return "";
  }
}

export function loadConversationExamples(): string {
  if (conversationCache !== null) return conversationCache;
  conversationCache = readPromptFile("conversation-examples.txt");
  return conversationCache;
}

export function loadScreeningExamples(): string {
  if (screeningCache !== null) return screeningCache;
  screeningCache = readPromptFile("screening-examples.txt");
  return screeningCache;
}

/**
 * 시스템 프롬프트 끝에 붙일 톤 가이드 블록.
 * 단순히 예시를 던지는 대신, "이 톤을 그대로 모방하라"고 명시한다.
 */
export function buildToneGuide(opts: { includeScreening?: boolean } = {}): string {
  const conv = loadConversationExamples();
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

  if (opts.includeScreening) {
    lines.push(
      "",
      "## 스크리닝 운영 항목 원본 (참고)",
      "체크리스트 항목·자동 발송 본문이 어디서 왔는지 확인용. 그대로 인용보다는 톤을 흡수해 자연스럽게 풀어라.",
      "",
      loadScreeningExamples(),
    );
  }

  return lines.join("\n");
}
