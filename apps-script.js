/**
 * 구글 시트 앱스크립트
 *
 * 설치 방법:
 * 1. 구글 시트 → 확장 프로그램 → Apps Script
 * 2. 이 코드 전체 복사 → 붙여넣기
 * 3. 저장 (Ctrl+S)
 * 4. 트리거 설정: 왼쪽 시계 아이콘 → 트리거 추가
 *    - 함수: onEditTrigger
 *    - 이벤트: 스프레드시트에서 → 수정 시
 */

// ─── 설정 ────────────────────────────────────────────────
var SOLAPI_API_KEY = "NCSCNULV6PZJVMQF";
var SOLAPI_API_SECRET = "7HWC9Q63PU9IH6MM6SLV0K3KQEJTX9WU";
var SOLAPI_FROM = "01035037252";

var SCREENING_SHEET = "스크리닝 관리";
var APPLICANT_SHEET = "지원자 명단";

// 컬럼 위치 (스크리닝 관리 시트)
var COL_NAME = 1;       // A: 성함
var COL_PHONE = 2;      // B: 휴대폰 번호
var COL_BRANCH = 3;     // C: 지점
var COL_STATUS = 5;     // E: 진행상황
var COL_CHECKBOX = 6;   // F: 스크리닝 완료
var COL_MSG_SENT = 7;   // G: msg_sent

// ─── 메인 트리거 ─────────────────────────────────────────
function onEditTrigger(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  // 스크리닝 관리 시트의 체크박스(F열)만 감지
  if (sheet.getName() !== SCREENING_SHEET) return;
  if (range.getColumn() !== COL_CHECKBOX) return;
  if (range.getValue() !== true) return;

  var row = range.getRow();
  if (row <= 1) return; // 헤더 무시

  // 이미 발송된 경우 스킵
  var msgSent = sheet.getRange(row, COL_MSG_SENT).getValue();
  if (msgSent === "Y") return;

  // 데이터 읽기
  var name = sheet.getRange(row, COL_NAME).getValue();
  var phone = sheet.getRange(row, COL_PHONE).getValue();

  if (!name || !phone) {
    Logger.log("이름 또는 전화번호 없음 — row " + row);
    return;
  }

  // 전화번호 정리 (하이픈 제거)
  phone = String(phone).replace(/-/g, "").trim();

  // 메시지 생성
  var message = name + "님, 함께하게 되어 반갑습니다!\n" +
    "아래 순서로 진행 부탁드립니다.\n\n" +
    "1. 배민 커넥트 앱 설치 후 가입\n" +
    "2. 앱 가입 시 안전보건교육 영상(2시간) 필수 시청\n" +
    "3. 가입 및 교육 수료 후\n" +
    "   마이페이지 > 내 정보에서 아이디 확인 후\n" +
    "   아이디 회신 부탁드립니다.\n\n" +
    "문의사항은 편하게 말씀주세요.\n\n" +
    "[가입 가이드 영상]\n" +
    "https://www.youtube.com/watch?v=bMM112zT7JY";

  // SOLAPI 문자 발송
  var success = sendSMS(phone, message);

  if (success) {
    // 스크리닝 관리 시트 업데이트
    sheet.getRange(row, COL_MSG_SENT).setValue("Y");
    sheet.getRange(row, COL_STATUS).setValue("온보딩");

    // 지원자 명단 시트에도 동기화
    syncToApplicantSheet(phone, "온보딩");

    Logger.log("문자 발송 완료: " + name + " (" + phone + ")");
  } else {
    Logger.log("문자 발송 실패: " + name + " (" + phone + ")");
  }
}

// ─── SOLAPI 문자 발송 ────────────────────────────────────
function sendSMS(to, message) {
  var date = new Date().toISOString();
  var salt = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "").substring(0, 32);
  var baseString = date + salt;

  var signatureBytes = Utilities.computeHmacSha256Signature(baseString, SOLAPI_API_SECRET);
  var signature = signatureBytes.map(function(b) {
    return ("0" + (b & 0xFF).toString(16)).slice(-2);
  }).join("");

  var headers = {
    "Authorization": "HMAC-SHA256 apiKey=" + SOLAPI_API_KEY + ", date=" + date + ", salt=" + salt + ", signature=" + signature,
    "Content-Type": "application/json"
  };

  var payload = {
    messages: [
      {
        to: to,
        from: SOLAPI_FROM,
        text: message
      }
    ]
  };

  var options = {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch("https://api.solapi.com/messages/v4/send-many/detail", options);
    var result = JSON.parse(response.getContentText());
    Logger.log("Solapi 응답: " + response.getContentText());
    return response.getResponseCode() === 200;
  } catch (e) {
    Logger.log("Solapi 오류: " + e.toString());
    return false;
  }
}

// ─── 지원자 명단 시트 동기화 ─────────────────────────────
function syncToApplicantSheet(phone, newStatus) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(APPLICANT_SHEET);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();

  // 휴대폰 번호로 행 찾기 (D열 = index 3)
  for (var i = 1; i < data.length; i++) {
    var cellPhone = String(data[i][3]).replace(/-/g, "").trim();
    if (cellPhone === phone) {
      // Q열 = 진행상황 (index 16, 열번호 17)
      sheet.getRange(i + 1, 17).setValue(newStatus);
      // V열 = msg2_sent (index 21, 열번호 22)
      sheet.getRange(i + 1, 22).setValue("Y");
      break;
    }
  }
}
