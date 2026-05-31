/**
 * 배민 지원자 분류·파싱 헬퍼 (Claude Haiku 4.5).
 *
 * 입력: 미매칭 phone에서 도착한 첫 메시지 본문.
 * 출력: { is_baemin, confidence, extracted: {name, vehicle, branch_raw, time_raw, baemin_id, experience} }
 *
 * 호출부:
 *   - /api/messages/inbound: hard filter 통과한 미매칭 phone 메시지에 호출.
 *     conf ≥ 0.7 + is_baemin → 자동 baemin applicant 생성.
 *   - /api/admin/inbox/[id]/classify: 매니저가 pending 메시지를 '배민 지원자'로 분류 시 재파싱.
 *
 * 하드 필터 (Haiku 호출 전):
 *   - '[광고]' 접두
 *   - URL (http://, https://, www.) 포함
 *   - 비휴대폰 발신 (1588/15xx/16xx/18xx, 4자리 등) — phone 문자열에서 판단
 *   → classification='other'로 즉시 종료, Haiku 호출 X.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

const SPAM_REGEX = /^\s*\[(광고|web발신|국제발신)\]/i;
const URL_REGEX = /(https?:\/\/|www\.)/i;

export function isHardSpam(phone: string, body: string): boolean {
  if (SPAM_REGEX.test(body)) return true;
  if (URL_REGEX.test(body)) return true;
  // 휴대폰 형식 (010/011/016~019 + 7~8자리)가 아니면 광고/은행/OTP로 본다.
  const digits = phone.replace(/[^\d]/g, "");
  if (!/^01[016789]\d{7,8}$/.test(digits)) return true;
  return false;
}

export interface TriageExtracted {
  name?: string;
  vehicle?: string;
  branch_raw?: string;
  time_raw?: string;
  baemin_id?: string;
  experience?: string;
}

export interface TriageResult {
  is_baemin: boolean;
  confidence: number;
  reasoning: string;
  extracted: TriageExtracted;
}

interface TriageToolInput {
  is_baemin: boolean;
  confidence: number;
  reasoning: string;
  name: string;
  vehicle: string;
  branch_raw: string;
  time_raw: string;
  baemin_id: string;
  experience: string;
}

const SYSTEM_PROMPT = `너는 옹고잉(내이루리) 비마트 배송원 채용 매니저의 SMS 인입 분류기다.

배민 지원자가 보낸 첫 메시지를 받으면 분류·파싱 결과를 반환해라.

## 배민 지원자 메시지 특징
- 이름 / 차종 / 지점 / 시간대를 슬래시·콤마·공백으로 구분해 보냄
  예) "김세진 / 캐스퍼 / 노원중계 / 오후 시간"
  예) "조종국/쏘나타하이브리드/B마트/09~14시/노원중계"
  예) "박진원  스파크  안산B마트  오전 오후"
- 배민커넥트 ID(영문+숫자)를 함께 보내기도 함 — 예: "eugene0909", "tpwlsdms1"
- "라이더", "지원합니다", "신청합니다", "B마트" 키워드 자주 등장
- 경력 언급 가능 — 예: "노원지역 배달경력 10년"

## 배민 지원자가 아닌 메시지
- 단가/조건 단순 문의 ("수수료가 어떻게 되나요") — 정보 부족하므로 confidence 낮게.
  단, "배민라이더입니다 수수료 궁금"처럼 자기소개 + 질문이면 배민 가능성 있음.
- 광고·은행 알림·OTP·지인 문자 → is_baemin=false

## 출력 규칙
- 확신 있는 배민 지원 → is_baemin=true, confidence ≥ 0.85
- 가능성 있지만 정보 부족 → is_baemin=true, confidence 0.5~0.7
- 명백한 비-배민 → is_baemin=false, confidence ≥ 0.85
- 애매 → is_baemin=false, confidence 0.5~0.7
- 추출 필드는 없으면 빈 문자열로

baemin_triage tool로만 응답.`;

const TOOL = {
  name: "baemin_triage",
  description: "메시지가 배민 지원인지 분류하고, 맞으면 이름·차종·지점·시간대·배민ID·경력을 추출한다.",
  input_schema: {
    type: "object" as const,
    properties: {
      is_baemin: { type: "boolean", description: "배민 지원 메시지로 판단되면 true." },
      confidence: { type: "number", description: "0~1 확신도. 1=완전 확신, 0.5=반반." },
      reasoning: { type: "string", description: "판단 근거 한 줄." },
      name: { type: "string", description: "지원자 이름. 없으면 빈 문자열." },
      vehicle: { type: "string", description: "차종(예: 스파크, 모닝, 쏘나타). 없으면 빈 문자열." },
      branch_raw: { type: "string", description: "지점명 원본(예: 노원중계, B마트 부천점). 없으면 빈 문자열." },
      time_raw: { type: "string", description: "시간대 원본(예: 오전, 오후, 09~14시). 없으면 빈 문자열." },
      baemin_id: { type: "string", description: "배민커넥트 아이디. 없으면 빈 문자열." },
      experience: { type: "string", description: "경력 언급. 없으면 빈 문자열." },
    },
    required: ["is_baemin", "confidence", "reasoning", "name", "vehicle", "branch_raw", "time_raw", "baemin_id", "experience"],
  },
};

export async function triageInbound(opts: { phone: string; body: string }): Promise<TriageResult> {
  const apiKey = process.env.CLAUDE_API;
  if (!apiKey) {
    return {
      is_baemin: false,
      confidence: 0,
      reasoning: "CLAUDE_API env missing — pending으로 fallback",
      extracted: {},
    };
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "baemin_triage" },
        messages: [
          {
            role: "user",
            content: `발신: ${opts.phone}\n메시지:\n${opts.body}`,
          },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("[baemin-triage] HTTP", res.status, errBody);
      return { is_baemin: false, confidence: 0, reasoning: `Haiku HTTP ${res.status}`, extracted: {} };
    }
    const data = (await res.json()) as { content: Array<{ type: string; input?: TriageToolInput }> };
    const block = data.content?.find((c) => c.type === "tool_use");
    if (!block?.input) {
      return { is_baemin: false, confidence: 0, reasoning: "no tool_use block", extracted: {} };
    }
    const out = block.input;
    return {
      is_baemin: !!out.is_baemin,
      confidence: typeof out.confidence === "number" ? out.confidence : 0,
      reasoning: out.reasoning || "",
      extracted: {
        name: out.name || undefined,
        vehicle: out.vehicle || undefined,
        branch_raw: out.branch_raw || undefined,
        time_raw: out.time_raw || undefined,
        baemin_id: out.baemin_id || undefined,
        experience: out.experience || undefined,
      },
    };
  } catch (e) {
    console.error("[baemin-triage] exception", e);
    return {
      is_baemin: false,
      confidence: 0,
      reasoning: e instanceof Error ? e.message : "unknown",
      extracted: {},
    };
  }
}
