"use client";

/**
 * 매니저 미분류 인박스 — Haiku triage가 자신없게 분류한(pending) 인입 메시지를
 * 매니저가 [✓ 배민 지원자] / [⛔ 기타]로 수동 분류하는 화면.
 *
 * 배민으로 분류 시: applicants(source='baemin', status='스크리닝') 자동 생성 +
 *                 job_candidates(stage='screening') 생성 + 즉시 router 호출.
 * 기타로 분류 시:   해당 메시지만 classification='other' 마킹.
 */

import { useCallback, useEffect, useState } from "react";

interface PendingMessage {
  id: string;
  applicant_phone: string;
  body: string;
  created_at: string;
  sent_by: string | null;
}

function formatPhone(raw: string): string {
  const d = raw.replace(/[^\d]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export default function PendingInboxView() {
  const [items, setItems] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/inbox/pending", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setItems(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      console.error("[pending inbox load]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const classify = async (id: string, action: "baemin" | "other") => {
    if (acting) return;
    if (action === "baemin") {
      if (!confirm("배민 지원자로 분류합니다.\n\n• 자동으로 후보 생성 + AI 응대 시작\n• 동일 번호의 다른 미분류 메시지도 같이 배민으로 분류됨\n\n진행할까요?")) return;
    }
    setActing(id);
    try {
      const res = await fetch(`/api/admin/inbox/${id}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "분류 실패");
        return;
      }
      await fetchPending();
    } catch (e) {
      alert(e instanceof Error ? e.message : "분류 실패");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="content">
      <div className="pi-head">
        <h2 className="page-title">
          미분류 인박스 <span className="count">{items.length}건</span>
        </h2>
        <button className="pi-refresh" onClick={fetchPending} disabled={loading}>
          {loading ? "로딩 중..." : "새로고침"}
        </button>
      </div>
      <p className="page-desc">
        AI가 분류에 자신 없는 인입 메시지입니다. 직접 보고 [✓ 배민 지원자] 또는 [⛔ 기타]로 처리해주세요.<br />
        명백한 스팸(광고/URL/은행 등)은 자동으로 제외되어 여기 안 옴.
      </p>

      {loading ? (
        <div className="loading">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="pi-empty">미분류 메시지가 없습니다 ✨</div>
      ) : (
        <div className="pi-list">
          {items.map((m) => (
            <div key={m.id} className="pi-card">
              <div className="pi-card-head">
                <span className="pi-phone">{formatPhone(m.applicant_phone)}</span>
                <span className="pi-time">
                  {new Date(m.created_at).toLocaleString("ko-KR", {
                    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="pi-body">{m.body}</div>
              <div className="pi-actions">
                <button
                  className="pi-btn pi-btn-primary"
                  onClick={() => classify(m.id, "baemin")}
                  disabled={acting === m.id}
                >
                  ✓ 배민 지원자
                </button>
                <button
                  className="pi-btn pi-btn-ghost"
                  onClick={() => classify(m.id, "other")}
                  disabled={acting === m.id}
                >
                  ⛔ 기타
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{css}</style>
    </div>
  );
}

const css = `
.pi-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.pi-head .page-title { margin-bottom: 0; }
.pi-refresh {
  background: transparent; border: 1px solid #d1d5db; color: #374151;
  padding: 6px 12px; border-radius: 6px; font-size: 12px;
  cursor: pointer; font-family: inherit;
}
.pi-refresh:hover { background: #f3f4f6; }
.pi-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

.pi-empty {
  text-align: center; padding: 60px 20px; color: #9CA3AF;
  border: 2px dashed #E5E7EB; border-radius: 12px; background: #FAFAF8;
}

.pi-list { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.pi-card {
  border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px 16px;
  background: #fff;
}
.pi-card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.pi-phone { font-weight: 700; color: #111827; font-size: 14px; }
.pi-time { color: #9CA3AF; font-size: 11px; }
.pi-body {
  white-space: pre-wrap; color: #374151; font-size: 13px;
  background: #F9FAFB; padding: 10px 12px; border-radius: 6px;
  margin-bottom: 10px;
}
.pi-actions { display: flex; gap: 8px; }
.pi-btn {
  padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit; border: none;
}
.pi-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pi-btn-primary { background: #15803D; color: #fff; }
.pi-btn-primary:hover { background: #166534; }
.pi-btn-ghost { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
.pi-btn-ghost:hover { background: #e5e7eb; color: #111827; }
`;
