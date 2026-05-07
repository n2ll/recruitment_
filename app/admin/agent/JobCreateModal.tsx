"use client";

/**
 * 공고 작성 모달.
 *
 * 흐름 (단일 폼, 단계 X):
 *   1. 메모 입력 → [✨ 공고 자동 생성] → Claude가 본문 다듬어 채움 + 픽업 주소 추출
 *   2. 매니저가 본문/메타(지점·슬롯·시작일·정원·차량필요) 검토·수정
 *   3. [후보 추천 받기] → 점수 상위 N명 표시, 체크박스 선택
 *   4. [공고 저장 + 발송] → POST /api/admin/jobs → POST /api/admin/jobs/[id]/dispatch
 */

import { useEffect, useState } from "react";

interface SiteManager {
  id: number;
  name: string;
  phone: string;
  branch: string | null;
  active: boolean;
}

interface RecCandidate {
  id: number;
  source: "applicant" | "legacy";
  name: string;
  phone: string;
  sigungu?: string | null;
  birth_date?: string | null;
  own_vehicle?: string | null;
  score: { total: number; distance: number; vehicle: number; recency: number; distanceKm: number };
}

interface JobCreateModalProps {
  branches: string[];
  onClose: () => void;
  onCreated: (jobId: number) => void;
}

const SLOTS = ["평일오전", "평일오후", "주말오전", "주말오후"] as const;

function ageFromBirth(b: string | null | undefined): number | null {
  if (!b) return null;
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(b);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  return new Date().getFullYear() - year;
}

export default function JobCreateModal({ branches, onClose, onCreated }: JobCreateModalProps) {
  const [rough, setRough] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateMissing, setGenerateMissing] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [branch, setBranch] = useState<string>("");
  const [slot, setSlot] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [vehicleRequired, setVehicleRequired] = useState(true);
  const [pickupAddress, setPickupAddress] = useState("");
  const [siteManagerId, setSiteManagerId] = useState<number | null>(null);
  const [siteManagers, setSiteManagers] = useState<SiteManager[]>([]);

  // 매니저 목록 로드
  useEffect(() => {
    fetch("/api/admin/site-managers", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.data)) {
          setSiteManagers((j.data as SiteManager[]).filter((m) => m.active));
        }
      })
      .catch((e) => console.error("[JobCreateModal] site-managers load", e));
  }, []);

  const [recLoading, setRecLoading] = useState(false);
  const [candidates, setCandidates] = useState<RecCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidateKey = (c: RecCandidate) => `${c.source}-${c.id}`;

  const generateBody = async () => {
    if (!rough.trim()) {
      alert("메모를 입력해주세요.");
      return;
    }
    setGenerating(true);
    setGenerateMissing([]);
    try {
      const res = await fetch("/api/admin/recommend/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rough }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "공고 생성 실패");
        return;
      }
      setBody(json.posting || "");
      setGenerateMissing(Array.isArray(json.missing) ? json.missing : []);

      // 첫 줄을 title로 자동 추출
      const firstLine = (json.posting as string).split("\n")[0]?.replace(/[\[\]]/g, "").trim();
      if (firstLine && !title) setTitle(firstLine.slice(0, 60));
    } catch (e) {
      console.error(e);
      alert("공고 생성 중 오류");
    } finally {
      setGenerating(false);
    }
  };

  const fetchRecommendations = async () => {
    if (!body.trim()) {
      alert("공고 본문을 먼저 작성해주세요.");
      return;
    }
    setRecLoading(true);
    try {
      const res = await fetch("/api/admin/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          posting: body,
          vehicle_required: vehicleRequired,
          manual_address: pickupAddress || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "추천 실패");
        return;
      }
      setCandidates(json.candidates || []);
      // 픽업 주소가 비어있었으면 추천 응답에서 추출된 값으로 채움
      if (!pickupAddress && json.job?.address) setPickupAddress(json.job.address);
    } catch (e) {
      console.error(e);
      alert("추천 중 오류");
    } finally {
      setRecLoading(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) setSelected(new Set());
    else setSelected(new Set(candidates.map(candidateKey)));
  };

  const toggleOne = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const submit = async () => {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError("제목과 본문은 필수입니다.");
      return;
    }
    if (selected.size === 0) {
      setError("발송할 후보를 1명 이상 선택해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      // 1) 공고 저장
      const createRes = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          branch: branch || null,
          slot: slot || null,
          start_date: startDate || null,
          vehicle_required: vehicleRequired,
          pickup_address: pickupAddress || null,
          capacity,
          site_manager_id: siteManagerId,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.job?.id) {
        throw new Error(createJson.error || "공고 저장 실패");
      }
      const jobId = createJson.job.id as number;

      // 2) 선택된 후보들의 applicant_id (legacy 포함 — 향후 legacy도 처리하려면 백엔드 보강)
      const applicantIds = candidates
        .filter((c) => selected.has(candidateKey(c)) && c.source === "applicant")
        .map((c) => c.id);

      if (applicantIds.length === 0) {
        throw new Error("발송 가능한 신규 후보가 없습니다 (legacy는 현재 미지원).");
      }

      // 3) 후보 등록
      await fetch(`/api/admin/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicant_ids: applicantIds }),
      });

      // 4) 일괄 발송
      const dispatchRes = await fetch(`/api/admin/jobs/${jobId}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicant_ids: applicantIds }),
      });
      const dispatchJson = await dispatchRes.json();
      if (!dispatchRes.ok) {
        throw new Error(dispatchJson.error || "발송 실패");
      }

      alert(
        `공고 생성 완료.\n발송 ${dispatchJson.sent}명 / 스킵 ${dispatchJson.skipped}명${
          dispatchJson.conflicts?.length ? `\n⚠️ 다른 공고 진행 중 ${dispatchJson.conflicts.length}명 보류됨` : ""
        }`
      );
      onCreated(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ajm-overlay" onClick={onClose}>
      <div className="ajm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ajm-header">
          <h2>새 공고 작성</h2>
          <button className="ajm-close" onClick={onClose}>✕</button>
        </div>

        <div className="ajm-body">
          {/* 1) 자동 생성 */}
          <details className="ajm-gen" open={!body}>
            <summary>✨ 공고 자동 생성 (메모 던지면 Claude가 다듬어줌)</summary>
            <div className="ajm-gen-body">
              <textarea
                className="ajm-textarea"
                placeholder="예) 강북미아 토일 장보기 자차, 시급 1.5~2만, 픽업 도봉로 34"
                rows={3}
                value={rough}
                onChange={(e) => setRough(e.target.value)}
              />
              <button className="ajm-btn-secondary" onClick={generateBody} disabled={generating}>
                {generating ? "생성 중..." : "공고 생성하기"}
              </button>
              {generateMissing.length > 0 && (
                <div className="ajm-missing">
                  ⚠️ 빠진 항목 (본문에 [?]로 표기됨, 직접 채우세요):{" "}
                  {generateMissing.map((m) => (
                    <span key={m} className="ajm-missing-chip">{m}</span>
                  ))}
                </div>
              )}
            </div>
          </details>

          {/* 2) 본문 + 메타 */}
          <label className="ajm-label">제목 <span className="ajm-req">*</span></label>
          <input
            className="ajm-input"
            placeholder="강북미아 평일오전 자차 5/12 시작"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="ajm-label">공고 본문 (이 텍스트가 SMS로 발송됩니다) <span className="ajm-req">*</span></label>
          <textarea
            className="ajm-textarea"
            rows={10}
            placeholder="공고 본문..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="ajm-meta-grid">
            <label className="ajm-meta">
              <span>지점</span>
              <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">선택 안함</option>
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="ajm-meta">
              <span>슬롯</span>
              <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                <option value="">선택 안함</option>
                {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="ajm-meta">
              <span>시작일</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="ajm-meta">
              <span>모집 인원</span>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label className="ajm-meta ajm-meta-wide">
              <span>차량</span>
              <div className="ajm-radio-row">
                <button
                  type="button"
                  className={`ajm-radio ${vehicleRequired ? "on" : ""}`}
                  onClick={() => setVehicleRequired(true)}
                >차량 필요</button>
                <button
                  type="button"
                  className={`ajm-radio ${!vehicleRequired ? "on" : ""}`}
                  onClick={() => setVehicleRequired(false)}
                >차량 불필요</button>
              </div>
            </label>
            <label className="ajm-meta ajm-meta-wide">
              <span>픽업 주소 (자동 추출됨)</span>
              <input
                type="text"
                placeholder="예) 서울 강북구 도봉로 34"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
              />
            </label>
            <label className="ajm-meta ajm-meta-wide">
              <span>현장 매니저 (만남장소 안내·확정 알림에 사용)</span>
              <select
                value={siteManagerId ?? ""}
                onChange={(e) => setSiteManagerId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">선택 안함</option>
                {siteManagers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.phone}){m.branch ? ` — ${m.branch}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 3) 후보 추천 */}
          <div className="ajm-rec-row">
            <button className="ajm-btn-secondary" onClick={fetchRecommendations} disabled={recLoading || !body.trim()}>
              {recLoading ? "추천 중..." : "후보 추천 받기"}
            </button>
            {candidates.length > 0 && (
              <span className="ajm-rec-count">
                {selected.size} / {candidates.length}명 선택됨
                <button className="ajm-link" onClick={toggleAll}>
                  {selected.size === candidates.length ? "전체 해제" : "전체 선택"}
                </button>
              </span>
            )}
          </div>

          {candidates.length > 0 && (
            <div className="ajm-table-wrap">
              <table className="ajm-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>#</th>
                    <th>이름</th>
                    <th>나이</th>
                    <th>출처</th>
                    <th>거리</th>
                    <th>차량</th>
                    <th>점수</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, idx) => {
                    const k = candidateKey(c);
                    const age = ageFromBirth(c.birth_date);
                    return (
                      <tr key={k}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(k)}
                            onChange={() => toggleOne(k)}
                            disabled={c.source === "legacy"}
                          />
                        </td>
                        <td className="ajm-bold">#{idx + 1}</td>
                        <td>
                          {c.name} <span className="ajm-meta-text">{c.phone}</span>
                        </td>
                        <td>{age !== null ? `${age}세` : "-"}</td>
                        <td>
                          <span className={`ajm-src ${c.source === "legacy" ? "ajm-src-legacy" : ""}`}>
                            {c.source === "legacy" ? "레거시" : "신규"}
                          </span>
                        </td>
                        <td>{c.score.distanceKm.toFixed(1)}km</td>
                        <td>{c.own_vehicle || "-"}</td>
                        <td className="ajm-bold">{c.score.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {error && <div className="ajm-error">⚠️ {error}</div>}
        </div>

        <div className="ajm-footer">
          <button className="ajm-btn-secondary" onClick={onClose} disabled={submitting}>취소</button>
          <button
            className="ajm-btn-primary"
            onClick={submit}
            disabled={submitting || !body.trim() || !title.trim() || selected.size === 0}
          >
            {submitting
              ? "발송 중..."
              : `공고 저장 + ${selected.size}명에게 발송`}
          </button>
        </div>
      </div>

      <style jsx>{`
        .ajm-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000;
        }
        .ajm-modal {
          background: #fff;
          border-radius: 14px;
          width: 880px;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 32px);
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
        }
        .ajm-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 18px 24px;
          border-bottom: 1px solid #e8e8e0;
        }
        .ajm-header h2 { font-size: 17px; font-weight: 700; }
        .ajm-close {
          border: none; background: none; cursor: pointer;
          font-size: 18px; color: #6b7280;
        }
        .ajm-body { padding: 20px 24px; overflow-y: auto; flex: 1; }

        .ajm-gen {
          background: #fffbea;
          border: 1px solid #fde68a;
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 16px;
        }
        .ajm-gen summary { cursor: pointer; font-size: 13px; font-weight: 600; color: #92400e; }
        .ajm-gen-body { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .ajm-missing { font-size: 12px; color: #92400e; }
        .ajm-missing-chip {
          display: inline-block; margin: 2px 4px;
          background: #fef3c7; padding: 2px 8px; border-radius: 8px;
        }

        .ajm-label {
          display: block; font-size: 12px; font-weight: 600;
          color: #4b5563; margin: 14px 0 6px;
        }
        .ajm-req { color: #ef4444; }
        .ajm-input, .ajm-textarea {
          width: 100%; font-family: inherit; font-size: 13px;
          padding: 8px 12px; border: 1.5px solid #e8e8e0; border-radius: 8px;
          background: #fff; outline: none;
        }
        .ajm-input:focus, .ajm-textarea:focus { border-color: #F5C518; }
        .ajm-textarea { resize: vertical; min-height: 60px; line-height: 1.55; }

        .ajm-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px 16px;
          margin-top: 14px;
        }
        .ajm-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
        .ajm-meta > span { color: #6b7280; font-weight: 600; }
        .ajm-meta input, .ajm-meta select {
          padding: 7px 10px; border: 1.5px solid #e8e8e0; border-radius: 8px;
          font-family: inherit; font-size: 13px; background: #fff; outline: none;
        }
        .ajm-meta-wide { grid-column: span 2; }
        .ajm-radio-row { display: flex; gap: 6px; }
        .ajm-radio {
          padding: 7px 14px; border: 1.5px solid #e8e8e0; background: #fff;
          border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 13px;
        }
        .ajm-radio.on { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }

        .ajm-rec-row {
          display: flex; align-items: center; gap: 12px;
          margin: 18px 0 8px;
        }
        .ajm-rec-count { font-size: 12px; color: #6b7280; }
        .ajm-link {
          background: none; border: none; cursor: pointer;
          color: #2563eb; font-size: 12px; margin-left: 8px;
          text-decoration: underline;
        }

        .ajm-table-wrap {
          border: 1px solid #e8e8e0; border-radius: 10px;
          overflow: hidden; max-height: 280px; overflow-y: auto;
        }
        .ajm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .ajm-table th {
          background: #f9fafb; padding: 8px 10px; text-align: left;
          font-weight: 600; color: #4b5563; border-bottom: 1px solid #e8e8e0;
          position: sticky; top: 0; z-index: 1;
        }
        .ajm-table td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
        .ajm-bold { font-weight: 700; }
        .ajm-meta-text { color: #9ca3af; font-size: 11px; margin-left: 4px; }
        .ajm-src {
          padding: 2px 6px; border-radius: 6px; font-size: 11px;
          background: #dbeafe; color: #1e40af;
        }
        .ajm-src-legacy { background: #f3e8ff; color: #6b21a8; }

        .ajm-footer {
          padding: 14px 24px;
          border-top: 1px solid #e8e8e0;
          display: flex; justify-content: flex-end; gap: 8px;
        }
        .ajm-btn-primary, .ajm-btn-secondary {
          padding: 9px 18px; border-radius: 8px;
          font-family: inherit; font-size: 13px; font-weight: 600;
          cursor: pointer; border: 1.5px solid;
        }
        .ajm-btn-primary {
          background: #1a1a1a; color: #fff; border-color: #1a1a1a;
        }
        .ajm-btn-primary:disabled {
          background: #9ca3af; border-color: #9ca3af; cursor: not-allowed;
        }
        .ajm-btn-secondary {
          background: #fff; color: #1a1a1a; border-color: #e8e8e0;
        }
        .ajm-btn-secondary:disabled { color: #9ca3af; cursor: not-allowed; }

        .ajm-error {
          margin-top: 12px; padding: 10px 14px;
          background: #fee2e2; color: #991b1b;
          border-radius: 8px; font-size: 12px;
        }
      `}</style>
    </div>
  );
}
