// app/api/apply/route.ts
// 필요한 패키지: npm install googleapis

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// ─── 환경변수 ─────────────────────────────────────────────
// .env.local에 아래 3개 추가 필요:
// GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
// GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
// GOOGLE_SHEET_ID=your_sheet_id_here

const SHEET_NAME = "지원자 명단";

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      name,
      birthDate,
      phone,
      location,
      ownVehicle,
      licenseType,
      vehicleType,
      branch1,
      branch2,
      workHours,
      introduction,
      experience,
      source,
    } = body;

    // ── 필수 필드 검증 ─────────────────────────────────────
    if (!name || !birthDate || !phone || !location || !ownVehicle || !licenseType || !vehicleType || !branch1 || !workHours?.length || !introduction) {
      return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }

    // ── 중복 지원 체크 ──────────────────────────────────────
    const sheets = getSheets();
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!D:D`, // 휴대폰 번호 컬럼
    });

    const phones = existing.data.values?.flat() ?? [];
    const isDuplicate = phones.includes(phone);

    // ── 시트에 행 추가 ──────────────────────────────────────
    const timestamp = new Date().toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });

    const row = [
      timestamp,                          // 타임스탬프
      name,                               // 성함
      birthDate,                          // 생년월일 6자리
      phone,                              // 휴대폰 번호
      location,                           // 거주지
      ownVehicle,                         // 차량 여부
      licenseType,                        // 면허 종류
      vehicleType,                        // 차종
      branch1,                            // 희망지점 1지망
      branch2 || "",                      // 희망지점 2지망
      Array.isArray(workHours) ? workHours.join(", ") : workHours, // 희망 근무 시간대
      introduction,                       // 자기소개
      experience || "",                   // 경력
      "",                                 // 전화스크리닝 (빈칸)
      "서류심사",                          // 진행상황 (기본값)
      branch1,                            // branch (1지망으로 태깅)
      source || "direct",                 // source
      "",                                 // filter_pass (Make가 처리)
      "",                                 // msg1_sent
      "",                                 // msg2_sent
      isDuplicate ? "중복지원" : "",       // 비고
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:A`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    return NextResponse.json({
      success: true,
      duplicate: isDuplicate,
    });
  } catch (err) {
    console.error("[apply API error]", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
