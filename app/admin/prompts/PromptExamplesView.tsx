"use client";

/**
 * 톤 가이드 / AI 참고자료 — prompt_examples 테이블 CRUD.
 *
 * 매니저가 자유롭게 추가/수정/삭제. 같은 데이터가 AI 프롬프트에도 자동 주입됨.
 * - conversation: 일반 대화 예시 (모든 stage에 톤 가이드로)
 * - screening: 스크리닝 단계 운영 항목/문구
 * - facts: AI가 사실로 인용 가능한 운영 정보 (지점·시급·정책 등)
 *
 * categories prop으로 표시 카테고리를 제한 가능 (탭 분리용).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Category = "conversation" | "screening" | "facts" | "system_message";

interface PromptExample {
  id: number;
  category: Category;
  title: string;
  body: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  conversation: "대화 톤",
  screening: "스크리닝 운영 문구",
  facts: "운영 정보",
  system_message: "시스템 발송 문구",
};

const CATEGORY_DESC: Record<Category, string> = {
  conversation:
    "매니저가 실제로 보낸 메시지 예시. AI가 이 톤·길이·말투를 그대로 모방합니다.",
  screening:
    "지원/스크리닝/온보딩 단계의 운영 문구 모음. AI가 톤을 흡수해 자연스럽게 풀어냅니다.",
  facts:
    "AI가 지원자에게 사실로 인용 가능한 운영 정보. 예) '마포상암 — 평일오전 구인중, 시급 15,000원, 픽업 마포구 ...' 형태로 행마다 하나의 사실 단위.",
  system_message:
    "시스템이 자동 발송하는 고정 문구. 제목=정해진 키(danggeun_start/apply_received/screening_announce/onboarding_guide/first_day_rules), 본문에 {{이름}} 쓰면 발송 시 지원자 이름으로 치환됩니다. 제목은 바꾸지 마세요.",
};

interface EditorState {
  mode: "create" | "edit";
  id?: number;
  category: Category;
  title: string;
  body: string;
}

interface PromptExamplesViewProps {
  categories?: Category[];
  pageTitle?: string;
  pageDesc?: string;
  showSeed?: boolean;
}

export default function PromptExamplesView({
  categories = ["facts", "screening", "conversation", "system_message"],
  pageTitle = "클로드 조련하기",
  pageDesc = "AI 프롬프트에 자동 주입되는 퓨샷 예시 + 사실 정보입니다. 여기서 수정하면 60초 이내 모든 stage에 반영됩니다.",
  showSeed = true,
}: PromptExamplesViewProps) {
  const isFactsOnly = categories.length === 1 && categories[0] === "facts";
  const isCombined = categories.length > 1;
  const themeColor = isFactsOnly ? "#2563EB" : isCombined ? "#7C3AED" : "#D97706";
  const themeBg = isFactsOnly ? "#EFF6FF" : isCombined ? "#F5F3FF" : "#FFFBEB";
  const themeBorder = isFactsOnly ? "#BFDBFE" : isCombined ? "#DDD6FE" : "#F5C518";
  const themeEmoji = isFactsOnly ? "📋" : isCombined ? "🧠" : "🎨";
  const themeKind = isFactsOnly ? "사실 데이터" : isCombined ? "클로드 조련 — 사실 / 운영문구 / 말투" : "퓨샷 예시 / 말투";
  const [items, setItems] = useState<PromptExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Category>(categories[0]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const singleCategory = categories.length === 1;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prompt-examples", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setItems(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      console.error("[prompt-examples list]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(
    () => items.filter((it) => it.category === tab),
    [items, tab]
  );

  const handleSeed = async () => {
    if (!confirm("빠져 있는 기본값만 추가합니다. (이미 있는 항목은 그대로 유지) 진행할까요?")) {
      return;
    }
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/prompt-examples", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "시드 실패");
        return;
      }
      alert(json.inserted > 0 ? `${json.inserted}건 추가됨.` : (json.message || "추가할 기본값이 없습니다."));
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "시드 실패");
    } finally {
      setSeeding(false);
    }
  };

  const handleSave = async () => {
    if (!editor) return;
    if (!editor.title.trim() || !editor.body.trim()) {
      alert("제목과 본문을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const isEdit = editor.mode === "edit" && editor.id != null;
      const url = isEdit
        ? `/api/admin/prompt-examples/${editor.id}`
        : "/api/admin/prompt-examples";
      const method = isEdit ? "PUT" : "POST";
      const payload: Record<string, unknown> = {
        title: editor.title,
        body: editor.body,
      };
      if (!isEdit) payload.category = editor.category;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "저장 실패");
        return;
      }
      setEditor(null);
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 예시를 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/admin/prompt-examples/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "삭제 실패");
        return;
      }
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const handleReorder = async (it: PromptExample, direction: "up" | "down") => {
    const sameCategory = filtered;
    const idx = sameCategory.findIndex((x) => x.id === it.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameCategory.length) return;
    const other = sameCategory[swapIdx];

    try {
      await Promise.all([
        fetch(`/api/admin/prompt-examples/${it.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: other.sort_order }),
        }),
        fetch(`/api/admin/prompt-examples/${other.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: it.sort_order }),
        }),
      ]);
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "순서 변경 실패");
    }
  };

  return (
    <div className="content">
      <style>{css}</style>

      <div
        className="pe-banner"
        style={{ background: themeBg, borderColor: themeBorder, color: themeColor }}
      >
        <span className="pe-banner-emoji">{themeEmoji}</span>
        <div>
          <div className="pe-banner-kind">{themeKind}</div>
          <div className="pe-banner-msg">
            {isFactsOnly
              ? "여기는 AI가 사실로 인용할 운영 정보(지점·시급·정책 등) 전용입니다."
              : isCombined
              ? "AI가 학습할 모든 정보를 한 곳에서. 참고자료(사실) · 스크리닝 운영 문구 · 대화 톤 세 카테고리로 관리합니다."
              : "여기는 AI 말투/대화 톤 예시 전용입니다."}
          </div>
        </div>
      </div>

      <div className="pe-header">
        <div>
          <h2 className="page-title">{pageTitle}</h2>
          <p className="page-desc">{pageDesc}</p>
        </div>
        <div className="pe-header-actions">
          {showSeed && !loading && (
            <button className="pe-btn pe-btn-ghost-bordered" onClick={handleSeed} disabled={seeding}>
              {seeding ? "추가 중..." : "기본값 채우기"}
            </button>
          )}
          <button
            className="pe-btn pe-btn-primary"
            onClick={() =>
              setEditor({ mode: "create", category: tab, title: "", body: "" })
            }
          >
            + 새 항목
          </button>
        </div>
      </div>

      {!singleCategory && (
        <div className="pe-tabs">
          {categories.map((c) => (
            <button
              key={c}
              className={`pe-tab ${tab === c ? "pe-tab-active" : ""}`}
              onClick={() => setTab(c)}
            >
              {CATEGORY_LABELS[c]}{" "}
              <span className="pe-tab-count">
                {items.filter((x) => x.category === c).length}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="pe-cat-desc">{CATEGORY_DESC[tab]}</p>

      {loading ? (
        <div className="pe-empty">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="pe-empty">
          {items.length === 0
            ? "아직 예시가 없습니다. 상단의 '기본 예시 가져오기'로 시작하세요."
            : "이 카테고리에는 예시가 없습니다."}
        </div>
      ) : (
        <div className="pe-list">
          {filtered.map((it, idx) => (
            <div key={it.id} className="pe-card">
              <div className="pe-card-head">
                <div className="pe-card-title">{it.title}</div>
                <div className="pe-card-actions">
                  <button
                    className="pe-btn-ghost"
                    onClick={() => handleReorder(it, "up")}
                    disabled={idx === 0}
                    title="위로"
                  >
                    ↑
                  </button>
                  <button
                    className="pe-btn-ghost"
                    onClick={() => handleReorder(it, "down")}
                    disabled={idx === filtered.length - 1}
                    title="아래로"
                  >
                    ↓
                  </button>
                  <button
                    className="pe-btn-ghost"
                    onClick={() =>
                      setEditor({
                        mode: "edit",
                        id: it.id,
                        category: it.category,
                        title: it.title,
                        body: it.body,
                      })
                    }
                  >
                    편집
                  </button>
                  <button
                    className="pe-btn-ghost pe-btn-danger"
                    onClick={() => handleDelete(it.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
              <pre className="pe-card-body">{it.body}</pre>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <div className="pe-modal-bg" onClick={() => !saving && setEditor(null)}>
          <div className="pe-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pe-modal-head">
              <h3 className="pe-modal-title">
                {editor.mode === "create" ? "새 예시 추가" : "예시 편집"}
              </h3>
              <button className="pe-btn-ghost" onClick={() => setEditor(null)}>
                ×
              </button>
            </div>

            {!singleCategory ? (
              <div className="pe-field">
                <label className="pe-label">카테고리</label>
                {editor.mode === "create" ? (
                  <select
                    className="pe-input"
                    value={editor.category}
                    onChange={(e) =>
                      setEditor({ ...editor, category: e.target.value as Category })
                    }
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="pe-readonly">{CATEGORY_LABELS[editor.category]}</div>
                )}
              </div>
            ) : null}

            <div className="pe-field">
              <label className="pe-label">제목</label>
              <input
                className="pe-input"
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                placeholder="예: 대화 9 — 첫 응대 인사"
              />
            </div>

            <div className="pe-field">
              <label className="pe-label">본문</label>
              <textarea
                className="pe-input pe-textarea"
                value={editor.body}
                onChange={(e) => setEditor({ ...editor, body: e.target.value })}
                placeholder="에이전트: 안녕하세요 ㅇㅇ님...&#10;구직자: 네 안녕하세요..."
                rows={14}
              />
            </div>

            <div className="pe-modal-actions">
              <button
                className="pe-btn pe-btn-ghost-bordered"
                onClick={() => setEditor(null)}
                disabled={saving}
              >
                취소
              </button>
              <button
                className="pe-btn pe-btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const css = `
  .pe-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid;
    margin-bottom: 16px;
    font-size: 13px;
  }
  .pe-banner-emoji { font-size: 22px; }
  .pe-banner-kind {
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }
  .pe-banner-msg { font-size: 12px; opacity: 0.85; line-height: 1.5; }

  .pe-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }
  .pe-header-actions { display: flex; gap: 8px; }
  .pe-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 8px;
  }
  .pe-tab {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 14px;
    font-weight: 600;
    color: #6b7280;
    cursor: pointer;
    font-family: inherit;
  }
  .pe-tab:hover { color: #111827; }
  .pe-tab-active {
    color: #92650A;
    border-bottom-color: #F5C518;
  }
  .pe-tab-count {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 99px;
    background: #f3f4f6;
    color: #6b7280;
    margin-left: 6px;
    font-weight: 600;
  }
  .pe-tab-active .pe-tab-count {
    background: #FEF3C7;
    color: #92650A;
  }
  .pe-cat-desc {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 16px;
  }
  .pe-empty {
    padding: 40px;
    text-align: center;
    color: #9ca3af;
    background: #fff;
    border: 1px dashed #e5e7eb;
    border-radius: 10px;
  }
  .pe-list { display: flex; flex-direction: column; gap: 10px; }
  .pe-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 14px;
  }
  .pe-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .pe-card-title { font-weight: 700; font-size: 14px; color: #111827; }
  .pe-card-actions { display: flex; gap: 4px; }
  .pe-card-body {
    margin: 0;
    padding: 10px 12px;
    background: #f9fafb;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.6;
    color: #374151;
    white-space: pre-wrap;
    font-family: inherit;
    word-break: break-word;
  }
  .pe-btn {
    padding: 8px 14px;
    border-radius: 6px;
    border: 1px solid transparent;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .pe-btn-primary { background: #1f2937; color: #fff; }
  .pe-btn-primary:hover:not(:disabled) { background: #111827; }
  .pe-btn-primary:disabled { background: #9ca3af; cursor: not-allowed; }
  .pe-btn-ghost {
    background: transparent;
    border: none;
    color: #6b7280;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .pe-btn-ghost:hover:not(:disabled) { background: #f3f4f6; color: #111827; }
  .pe-btn-ghost:disabled { opacity: 0.3; cursor: not-allowed; }
  .pe-btn-ghost-bordered {
    background: #fff;
    border: 1px solid #d1d5db;
    color: #374151;
  }
  .pe-btn-ghost-bordered:hover { background: #f3f4f6; }
  .pe-btn-danger { color: #dc2626; }
  .pe-btn-danger:hover:not(:disabled) { background: #fee2e2; color: #991b1b; }

  .pe-modal-bg {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }
  .pe-modal {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    width: 100%;
    max-width: 640px;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pe-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pe-modal-title { margin: 0; font-size: 16px; font-weight: 700; color: #111827; }
  .pe-field { display: flex; flex-direction: column; gap: 4px; }
  .pe-label { font-size: 12px; font-weight: 600; color: #374151; }
  .pe-input {
    width: 100%;
    padding: 9px 11px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    color: #111827;
    background: #fff;
  }
  .pe-input:focus {
    outline: none;
    border-color: #F5C518;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }
  .pe-textarea { resize: vertical; min-height: 200px; line-height: 1.6; }
  .pe-readonly {
    padding: 9px 11px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 13px;
    color: #6b7280;
    background: #f9fafb;
  }
  .pe-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
`;
