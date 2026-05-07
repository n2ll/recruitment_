"use client";

/**
 * /admin → 현장 매니저 탭.
 *
 * site_managers 테이블의 1:1 직접 편집 UI.
 * - GET 으로 목록 로드
 * - 행 단위 인라인 편집 후 [저장] 버튼으로 PATCH
 * - [+ 매니저 추가] / 행별 [삭제] 버튼
 * - branch 셀렉트는 부모에서 활성 지점 목록을 prop으로 받음
 */

import { useCallback, useEffect, useMemo, useState } from "react";

interface SiteManagerRow {
  id: number;
  name: string;
  phone: string;
  branch: string | null;
  role: string | null;
  note: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  branches: string[]; // 활성 지점명 목록
}

const EMPTY_NEW = {
  name: "",
  phone: "",
  branch: "",
};

export default function SiteManagersView({ branches }: Props) {
  const [rows, setRows] = useState<SiteManagerRow[]>([]);
  const [localRows, setLocalRows] = useState<SiteManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null); // 저장 중인 row id
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState(EMPTY_NEW);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/site-managers", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setRows(json.data);
        setLocalRows(json.data);
      } else {
        alert(json.error || "매니저 목록 로드 실패");
      }
    } catch (e) {
      alert("매니저 목록 로드 실패");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const updateLocal = (id: number, patch: Partial<SiteManagerRow>) => {
    setLocalRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const isDirty = useCallback(
    (id: number) => {
      const a = rows.find((r) => r.id === id);
      const b = localRows.find((r) => r.id === id);
      if (!a || !b) return false;
      return (
        a.name !== b.name ||
        a.phone !== b.phone ||
        (a.branch ?? "") !== (b.branch ?? "") ||
        a.active !== b.active
      );
    },
    [rows, localRows]
  );

  const saveRow = async (id: number) => {
    const row = localRows.find((r) => r.id === id);
    if (!row) return;
    if (!row.name.trim() || !row.phone.trim()) {
      alert("이름과 전화번호는 필수입니다.");
      return;
    }
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/site-managers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.name,
          phone: row.phone,
          branch: row.branch,
          active: row.active,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "저장 실패");
        return;
      }
      // server 응답으로 sync
      setRows((prev) => prev.map((r) => (r.id === id ? (json.data as SiteManagerRow) : r)));
      setLocalRows((prev) => prev.map((r) => (r.id === id ? (json.data as SiteManagerRow) : r)));
    } catch (e) {
      alert("저장 실패");
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  const deleteRow = async (id: number, name: string) => {
    if (!confirm(`'${name}' 매니저를 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/admin/site-managers/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "삭제 실패");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      setLocalRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert("삭제 실패");
      console.error(e);
    }
  };

  const addRow = async () => {
    if (!newRow.name.trim() || !newRow.phone.trim()) {
      alert("이름과 전화번호는 필수입니다.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/site-managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRow.name,
          phone: newRow.phone,
          branch: newRow.branch || null,
          active: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "추가 실패");
        return;
      }
      const created = json.data as SiteManagerRow;
      setRows((prev) => [...prev, created]);
      setLocalRows((prev) => [...prev, created]);
      setNewRow(EMPTY_NEW);
    } catch (e) {
      alert("추가 실패");
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const branchOptions = useMemo(() => ["", ...branches], [branches]);

  return (
    <div className="content">
      <h2 className="page-title">
        현장 매니저 <span className="count">{localRows.filter((r) => r.active).length}명 활성</span>
      </h2>
      <p className="page-desc">
        만남장소 안내·슬랙 알림·라인 담당 정보의 출처. 새 매니저를 추가하거나 기존 정보를 편집한 뒤 행별 [저장] 버튼을 눌러주세요.
      </p>

      {/* 추가 행 */}
      <div className="sm-add-row">
        <input
          className="filter-input"
          placeholder="이름 (예: 홍석범)"
          value={newRow.name}
          onChange={(e) => setNewRow((r) => ({ ...r, name: e.target.value }))}
        />
        <input
          className="filter-input"
          placeholder="전화 (010-0000-0000)"
          value={newRow.phone}
          onChange={(e) => setNewRow((r) => ({ ...r, phone: e.target.value }))}
        />
        <select
          className="filter-select"
          value={newRow.branch}
          onChange={(e) => setNewRow((r) => ({ ...r, branch: e.target.value }))}
        >
          {branchOptions.map((b) => (
            <option key={b} value={b}>
              {b || "지점 미배정"}
            </option>
          ))}
        </select>
        <button className="rec-btn-secondary" onClick={addRow} disabled={adding}>
          {adding ? "추가 중..." : "+ 매니저 추가"}
        </button>
      </div>

      {loading ? (
        <div className="loading">로딩 중...</div>
      ) : localRows.length === 0 ? (
        <div className="sm-empty">등록된 매니저가 없습니다. 위 입력란에서 추가해주세요.</div>
      ) : (
        <div className="table-wrap">
          <table className="table sm-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>전화</th>
                <th>담당 지점</th>
                <th style={{ width: 80 }}>활성</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {localRows.map((r) => {
                const dirty = isDirty(r.id);
                const isSaving = saving === r.id;
                return (
                  <tr key={r.id} className="sm-row" style={{ opacity: r.active ? 1 : 0.55 }}>
                    <td>
                      <input
                        type="text"
                        className="sm-input"
                        value={r.name}
                        disabled={isSaving}
                        onChange={(e) => updateLocal(r.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="sm-input"
                        value={r.phone}
                        disabled={isSaving}
                        onChange={(e) => updateLocal(r.id, { phone: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="sm-input"
                        value={r.branch ?? ""}
                        disabled={isSaving}
                        onChange={(e) =>
                          updateLocal(r.id, { branch: e.target.value || null })
                        }
                      >
                        {branchOptions.map((b) => (
                          <option key={b} value={b}>
                            {b || "(미배정)"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={r.active}
                          disabled={isSaving}
                          onChange={(e) => updateLocal(r.id, { active: e.target.checked })}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td className="sm-actions">
                      <button
                        className="rec-btn-primary sm-btn-sm"
                        disabled={!dirty || isSaving}
                        onClick={() => saveRow(r.id)}
                      >
                        {isSaving ? "..." : "저장"}
                      </button>
                      <button
                        className="rec-btn-secondary sm-btn-sm"
                        disabled={isSaving}
                        onClick={() => deleteRow(r.id, r.name)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .sm-add-row {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          align-items: center;
          flex-wrap: wrap;
        }
        .sm-add-row .filter-input,
        .sm-add-row .filter-select {
          flex: 1;
          min-width: 110px;
        }
        .sm-narrow {
          max-width: 90px;
        }
        .sm-empty {
          padding: 40px;
          text-align: center;
          color: #9ca3af;
          font-size: 13px;
          background: #fff;
          border: 1px dashed #e8e8e0;
          border-radius: 8px;
        }
        .sm-input {
          width: 100%;
          padding: 6px 8px;
          border: 1.5px solid transparent;
          border-radius: 6px;
          font-family: inherit;
          font-size: 13px;
          background: transparent;
          outline: none;
        }
        .sm-input:focus {
          border-color: #F5C518;
          background: #fff;
        }
        .sm-input:hover:not(:disabled):not(:focus) {
          background: #fafaf5;
        }
        .sm-actions {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }
        .sm-btn-sm {
          flex: 1;
          min-width: 60px;
          padding: 6px 10px;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
