"use client";

import * as React from "react";
import { RecommendationCards } from "@/components/admin/RecommendationCards";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

interface RecommendResponse {
  success: boolean;
  job: {
    address: string;
    lat: number;
    lng: number;
    sigungu?: string | null;
    vehicle_required: boolean;
    schedule?: string;
    summary?: string;
  };
  poolSize: number;
  candidates: Array<{
    id: number;
    source: "applicant" | "legacy";
    name: string;
    phone: string;
    sigungu?: string | null;
    location?: string | null;
    own_vehicle?: string | null;
    created_at: string;
    birth_date?: string | null;
    score: {
      total: number;
      distance: number;
      vehicle: number;
      recency: number;
      distanceKm: number;
    };
  }>;
}

const candidateKey = (c: { source: string; id: number }) => `${c.source}-${c.id}`;

function ageFromBirthDate(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const d = birth.replace(/\D/g, "");
  if (d.length !== 6) return null;
  const yy = parseInt(d.slice(0, 2), 10);
  const mm = parseInt(d.slice(2, 4), 10);
  const dd = parseInt(d.slice(4, 6), 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return null;
  const now = new Date();
  const currentYY = now.getFullYear() % 100;
  const fullYear = yy <= currentYY ? 2000 + yy : 1900 + yy;
  let age = now.getFullYear() - fullYear;
  const beforeBirthday =
    now.getMonth() + 1 < mm || (now.getMonth() + 1 === mm && now.getDate() < dd);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function RecommendView() {
  const confirm = useConfirm();
  const toast = useToast();

  const [recPosting, setRecPosting] = React.useState("");
  const [recManualAddr, setRecManualAddr] = React.useState("");
  const [recVehicleRequired, setRecVehicleRequired] = React.useState(true);
  const [recLoading, setRecLoading] = React.useState(false);
  const [recResult, setRecResult] = React.useState<RecommendResponse | null>(null);
  const [recSelected, setRecSelected] = React.useState<Set<string>>(new Set());
  const [recSending, setRecSending] = React.useState(false);
  const [recRough, setRecRough] = React.useState("");
  const [recGenerating, setRecGenerating] = React.useState(false);
  const [recGenMissing, setRecGenMissing] = React.useState<string[]>([]);

  const generateRecPosting = async () => {
    if (!recRough.trim()) {
      toast({ title: "간단한 메모를 입력해주세요", tone: "info" });
      return;
    }
    setRecGenerating(true);
    setRecGenMissing([]);
    try {
      const res = await fetch("/api/admin/recommend/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rough: recRough }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: json.error || "공고 생성에 실패했어요", tone: "error" });
        return;
      }
      setRecPosting(json.posting || "");
      setRecGenMissing(Array.isArray(json.missing) ? json.missing : []);
    } catch (e) {
      console.error(e);
      toast({ title: "공고 생성 중 오류가 발생했어요", tone: "error" });
    } finally {
      setRecGenerating(false);
    }
  };

  const runRecommend = async () => {
    if (!recPosting.trim()) {
      toast({ title: "공고 내용을 입력해주세요", tone: "info" });
      return;
    }
    setRecLoading(true);
    setRecResult(null);
    setRecSelected(new Set());
    try {
      const res = await fetch("/api/admin/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting: recPosting,
          manualAddress: recManualAddr || undefined,
          manualVehicleRequired: recVehicleRequired,
          topN: 10,
        }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.success) {
        toast({ title: "추천에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
        return;
      }
      setRecResult(json);
      setRecSelected(new Set(json.candidates.map(candidateKey)));
    } catch {
      toast({ title: "네트워크 오류가 발생했어요", tone: "error" });
    } finally {
      setRecLoading(false);
    }
  };

  const loadMoreRec = async () => {
    if (!recResult || recLoading) return;
    const currentCount = recResult.candidates.length;
    const newTopN = currentCount + 10;
    if (newTopN > 50) {
      toast({ title: "최대 50명까지 표시할 수 있어요", tone: "info" });
      return;
    }
    setRecLoading(true);
    try {
      const res = await fetch("/api/admin/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting: recPosting,
          manualAddress: recManualAddr || undefined,
          manualVehicleRequired: recVehicleRequired,
          topN: newTopN,
        }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.success) {
        toast({ title: "추가 추천에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
        return;
      }
      const previouslyShown = new Set(recResult.candidates.map(candidateKey));
      const next = new Set(recSelected);
      for (const c of json.candidates) {
        const k = candidateKey(c);
        if (!previouslyShown.has(k)) next.add(k);
      }
      setRecResult(json);
      setRecSelected(next);
    } catch {
      toast({ title: "네트워크 오류가 발생했어요", tone: "error" });
    } finally {
      setRecLoading(false);
    }
  };

  const toggleRecPick = (key: string) => {
    setRecSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sendRecMessages = async () => {
    if (!recResult) return;
    const picked = recResult.candidates.filter((c) => recSelected.has(candidateKey(c)));
    if (picked.length === 0) {
      toast({ title: "발송 대상을 선택해주세요", tone: "info" });
      return;
    }
    const ok = await confirm({
      title: `${picked.length}명에게 공고 SMS를 발송할까요?`,
      description: "실제 문자가 즉시 나가고, 발송된 메시지는 회수할 수 없어요.",
      confirmText: `${picked.length}명에게 발송`,
    });
    if (!ok) return;
    setRecSending(true);
    try {
      const res = await fetch("/api/admin/messages/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: picked.map((c) => ({
            phone: c.phone,
            applicant_id: c.source === "applicant" ? c.id : null,
          })),
          body: recPosting,
        }),
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: `발송 완료 — 성공 ${json.sent}건 / 실패 ${json.failed}건`, tone: "success" });
      } else {
        toast({ title: "발송에 실패했어요", description: json.error || "", tone: "error" });
      }
    } catch {
      toast({ title: "네트워크 오류가 발생했어요", tone: "error" });
    } finally {
      setRecSending(false);
    }
  };

  return (
    <div className="content">
      <h2 className="page-title">배송원 추천</h2>
      <p className="page-desc">
        공고 내용을 붙여넣으면 Claude가 상차지 주소를 추출하고, 등록된 후보 풀에서 점수 상위 10명을 추천합니다.
        선택 후 공고 내용을 그대로 SMS로 일괄 발송할 수 있습니다.
      </p>

      <div className="rec-input-wrap">
        <details className="rec-generate" open={!recPosting}>
          <summary>✨ 공고 자동 생성 (대충 입력하면 Claude가 다듬어줍니다)</summary>
          <div className="rec-generate-body">
            <textarea
              className="rec-input"
              placeholder="예) 강북미아 토일 장보기 자차, 시급 1.5~2만, 픽업 도봉로 34"
              rows={3}
              value={recRough}
              onChange={(e) => setRecRough(e.target.value)}
            />
            <button
              className="rec-btn-secondary rec-gen-btn"
              onClick={generateRecPosting}
              disabled={recGenerating}
            >
              {recGenerating ? "생성 중..." : "공고 생성하기"}
            </button>
            {recGenMissing.length > 0 && (
              <div className="rec-gen-missing">
                ⚠️ 메모에 빠진 항목이 있어 <code>[?]</code>로 표시했습니다 — 직접 채워주세요:&nbsp;
                {recGenMissing.map((m) => (
                  <span key={m} className="rec-missing-chip">{m}</span>
                ))}
              </div>
            )}
          </div>
        </details>

        <label className="rec-label">공고 내용 <span className="req">*</span></label>
        <textarea
          className="rec-textarea"
          placeholder="예) [내이루리] 마포구 상암동 평일 오전 자차 배송원 1명 급구 — 시급 25,000원..."
          rows={10}
          value={recPosting}
          onChange={(e) => setRecPosting(e.target.value)}
        />

        <div className="rec-row">
          <label className="rec-label">차량 필요 여부 <span className="req">*</span></label>
          <div className="radio-group">
            {[
              { v: true, label: "차량 필요" },
              { v: false, label: "차량 불필요" },
            ].map((opt) => (
              <button
                key={String(opt.v)}
                type="button"
                className={`radio-btn ${recVehicleRequired === opt.v ? "radio-on" : ""}`}
                onClick={() => setRecVehicleRequired(opt.v)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <details className="rec-advanced">
          <summary>상차지 주소 (Claude 자동 추출 건너뛰기)</summary>
          <input
            className="rec-input"
            placeholder="예) 서울 마포구 상암동"
            value={recManualAddr}
            onChange={(e) => setRecManualAddr(e.target.value)}
          />
        </details>

        <button className="rec-btn-primary" onClick={runRecommend} disabled={recLoading}>
          {recLoading ? "추천 중..." : "추천 받기"}
        </button>
      </div>

      {recResult && (
        <div className="rec-result">
          <div className="rec-job-info">
            <div><span className="dl">상차지 주소</span>{recResult.job.address}</div>
            <div><span className="dl">시군구</span>{recResult.job.sigungu || "-"}</div>
            <div><span className="dl">차량 필요</span>{recResult.job.vehicle_required ? "필요" : "불필요"}</div>
            {recResult.job.schedule && <div><span className="dl">시간대</span>{recResult.job.schedule}</div>}
            <div><span className="dl">전체 풀</span>{recResult.poolSize}명</div>
          </div>

          <div className="rec-actions">
            <button
              className="rec-btn-secondary"
              onClick={() => setRecSelected(new Set(recResult.candidates.map(candidateKey)))}
            >
              전체 선택
            </button>
            <button
              className="rec-btn-secondary"
              onClick={() => setRecSelected(new Set())}
            >
              전체 해제
            </button>
            <span className="rec-count">{recSelected.size} / {recResult.candidates.length}명 선택됨</span>
            {recResult.candidates.length < 50 && (
              <button
                className="rec-btn-secondary"
                onClick={loadMoreRec}
                disabled={recLoading}
              >
                {recLoading ? "불러오는 중..." : "10명 더 받기"}
              </button>
            )}
          </div>

          <RecommendationCards
            candidates={recResult.candidates}
            selectedKeys={recSelected}
            keyOf={candidateKey}
            onToggle={toggleRecPick}
            ageOf={ageFromBirthDate}
          />
        </div>
      )}

      {recResult && (
        <div className="rec-preview-inline">
          <h3 className="section-title">📤 발송 미리보기</h3>
          <div className="rec-preview-meta">
            SMS로 발송됩니다. 한 번 발송된 메시지는 회수할 수 없습니다.
          </div>
          <div className="rec-message-preview">{recPosting || "(공고 내용을 입력하세요)"}</div>

          {recSelected.size > 0 ? (
            <div className="rec-recipients-preview">
              <strong>수신자 ({recSelected.size}명):</strong>
              <div className="rec-recipients-list">
                {recResult.candidates
                  .filter((c) => recSelected.has(candidateKey(c)))
                  .map((c) => (
                    <span key={candidateKey(c)} className="rec-recipient-chip">
                      {c.name}
                    </span>
                  ))}
              </div>
            </div>
          ) : (
            <div className="rec-empty-recipients">위 표에서 발송 대상을 체크해주세요.</div>
          )}

          <button
            className="rec-btn-primary rec-send-btn"
            onClick={sendRecMessages}
            disabled={recSending || recSelected.size === 0}
          >
            {recSending
              ? "발송 중..."
              : recSelected.size === 0
              ? "발송 대상 선택 필요"
              : `${recSelected.size}명에게 발송`}
          </button>
        </div>
      )}
    </div>
  );
}
