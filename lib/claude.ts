/**
 * Claude API — 구인 공고 텍스트에서 구조화된 정보 추출 (Tool Use)
 */

export interface ExtractedJobInfo {
  address: string;
  vehicle_required: boolean;
  schedule?: string;
  summary?: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

interface AnthropicResponse {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; name: string; input: ExtractedJobInfo }
  >;
  stop_reason?: string;
}

export async function extractJobInfo(posting: string): Promise<ExtractedJobInfo | null> {
  const apiKey = process.env.CLAUDE_API;
  if (!apiKey) {
    console.error("[claude] CLAUDE_API env missing");
    return null;
  }

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    tools: [
      {
        name: "extract_job_info",
        description:
          "구인 공고 텍스트에서 배송원 매칭에 필요한 정보를 추출합니다.",
        input_schema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description:
                "상차지/근무지 주소. 시/도 + 시/군/구 + 동/면/리 단위까지 추출 (예: '서울 마포구 상암동'). 도로명·지번까지 명시되면 함께 포함.",
            },
            vehicle_required: {
              type: "boolean",
              description:
                "자기 명의 차량 필요 여부. 공고에 '차량 필요', '자차 필수' 등이 있으면 true. '차량 무관', '도보 가능' 등이면 false. 명시 안 됐으면 true(기본값).",
            },
            schedule: {
              type: "string",
              description:
                "근무 시간대 (예: '평일 오전', '월~금 08:00~13:00'). 명시 안 됐으면 빈 문자열.",
            },
            summary: {
              type: "string",
              description: "공고 한 줄 요약 (최대 60자).",
            },
          },
          required: ["address", "vehicle_required"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_job_info" },
    messages: [{ role: "user", content: posting }],
  };

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[claude] HTTP", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as AnthropicResponse;
    const block = data.content?.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      console.error("[claude] no tool_use block", JSON.stringify(data));
      return null;
    }
    return block.input;
  } catch (err) {
    console.error("[claude] exception", err);
    return null;
  }
}
