import { google } from "googleapis";

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

/**
 * Supabase에 저장된 데이터를 구글 시트에 추가
 * Supabase row 데이터를 그대로 받아서 시트에 맞게 변환
 */
export async function appendToSheet(data: {
  created_at: string;
  name: string;
  birth_date: string;
  phone: string;
  location: string;
  own_vehicle: string;
  license_type: string;
  vehicle_type: string;
  branch1: string;
  branch2: string | null;
  work_hours: string;
  introduction: string;
  experience: string | null;
  available_date: string;
  self_ownership: string;
  status: string;
  branch: string;
  source: string;
  note: string | null;
}) {
  const sheets = getSheets();

  const timestamp = new Date(data.created_at).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

  const row = [
    timestamp,
    data.name,
    data.birth_date,
    data.phone,
    data.location,
    data.own_vehicle,
    data.license_type,
    data.vehicle_type,
    data.branch1,
    data.branch2 || "",
    data.work_hours,
    data.introduction,
    data.experience || "",
    data.available_date,
    data.self_ownership,
    "",               // 전화스크리닝 (담당자 수동)
    data.status,      // 진행상황
    data.branch,      // branch
    data.source,      // source
    "",               // filter_pass
    "",               // msg1_sent
    "",               // msg2_sent
    data.note || "",  // 비고
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}
