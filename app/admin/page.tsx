"use client";

import { useState, useEffect, useCallback } from "react";

interface Applicant {
  id: number;
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
  screening: string | null;
  status: string;
  branch: string;
  source: string;
  filter_pass: string | null;
  note: string | null;
  last_message_at: string | null;
  unread_count: number;
  start_date: string | null;
  confirmed_slot: string | null;
  confirmed_branch: string | null;
  current_branch: string | null;
  churned_at: string | null;
  churn_reason: string | null;
}

interface Message {
  id: string;
  applicant_id: number | null;
  applicant_phone: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  sent_by: string | null;
  solapi_msg_id: string | null;
  created_at: string;
}

interface Heartbeat {
  device_id: string;
  last_seen_at: string;
  pending_count: number;
  battery_level: number;
  app_version: string | null;
}

type Tab = "dashboard" | "applicants" | "contact" | "hope-slots" | "confirmed-slots";

const STATUS_COLORS: Record<string, string> = {
  서류심사: "#6b7280",
  연락대기: "#2563eb",
  부적합: "#ef4444",
  확정: "#0ea5e9",
  대기: "#8b5cf6",
  온보딩: "#f59e0b",
  현장투입: "#10b981",
  이탈: "#475569",
};

const ALL_STATUSES = [
  "서류심사", "연락대기", "부적합", "확정", "대기", "온보딩", "현장투입", "이탈",
];

const BRANCHES = [
  "전체", "은평", "마포상암", "서대문신촌", "용산한남",
  "도봉쌍문", "중구명동", "성동옥수", "동대문제기",
  "강북미아", "노원중계", "중랑면목", "광진자양",
];

const BRANCH_NAMES = BRANCHES.slice(1);

const SLOTS = ["평일오전", "평일오후", "주말오전", "주말오후"] as const;
type SlotKey = typeof SLOTS[number];

// work_hours 텍스트(콤마 join된 4슬롯 중 선택값) → 슬롯 매칭
function matchesSlot(workHours: string | null | undefined, slot: SlotKey): boolean {
  if (!workHours) return false;
  const wantPyeongil = slot.startsWith("평일");
  const wantMorning = slot.endsWith("오전");
  return workHours.split(",").map((t) => t.trim()).some((tok) => {
    const dayOk = wantPyeongil ? tok.includes("평일") : tok.includes("주말");
    const timeOk = wantMorning ? tok.includes("오전") : tok.includes("오후");
    return dayOk && timeOk;
  });
}

const ACTIVE_STATUSES = ["서류심사", "연락대기", "확정", "대기", "온보딩", "현장투입"];
const CONFIRMED_STATUSES = ["확정", "온보딩", "현장투입"];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [data, setData] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sending, setSending] = useState<number | null>(null);

  // 문자 대화 관련 state
  const [chatApplicant, setChatApplicant] = useState<Applicant | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);

  // 전용 폰 heartbeat
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);

  // 슬롯 뷰 셀 선택 (drill-down 용)
  const [slotCell, setSlotCell] = useState<{ branch: string; slot: SlotKey } | null>(null);

  // 상세 패널 임시 편집 상태 (명시적 저장)
  const [editDraft, setEditDraft] = useState<Partial<Applicant>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  useEffect(() => { setEditDraft({}); }, [selectedId]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/applicants");
      const json = await res.json();
      setData(json.data || []);
    } catch {
      console.error("데이터 로딩 실패");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchHeartbeats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/heartbeat");
      const json = await res.json();
      setHeartbeats(json.data || []);
    } catch {
      console.error("Heartbeat 로딩 실패");
    }
  }, []);

  const patchApplicant = useCallback(
    async (id: number, updates: Partial<Applicant>) => {
      // 낙관적 업데이트
      setData((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
      try {
        const res = await fetch(`/api/admin/applicants/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        const json = await res.json();
        if (!json.success) {
          alert("저장 실패: " + (json.error || "알 수 없는 오류"));
          fetchData(true);
          return false;
        }
        setData((prev) => prev.map((a) => (a.id === id ? { ...a, ...json.data } : a)));
        return true;
      } catch (err) {
        console.error("[patchApplicant]", err);
        alert("네트워크 오류");
        fetchData(true);
        return false;
      }
    },
    [fetchData]
  );

  const openChat = async (applicant: Applicant) => {
    setChatApplicant(applicant);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/admin/messages/${applicant.id}`);
      const json = await res.json();
      setMessages(json.data || []);
      // unread_count 로컬 초기화
      setData((prev) =>
        prev.map((a) => (a.id === applicant.id ? { ...a, unread_count: 0 } : a))
      );
    } catch {
      console.error("대화 로딩 실패");
    } finally {
      setChatLoading(false);
    }
  };

  const closeChat = () => {
    setChatApplicant(null);
    setMessages([]);
    setMsgInput("");
  };

  const sendMessage = async () => {
    if (!chatApplicant || !msgInput.trim() || msgSending) return;
    setMsgSending(true);
    try {
      const res = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_id: chatApplicant.id,
          phone: chatApplicant.phone,
          body: msgInput.trim(),
          sent_by: "관리자",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessages((prev) => [...prev, json.message]);
        setMsgInput("");
      } else {
        alert("발송 실패: " + (json.error || "알 수 없는 오류"));
      }
    } catch {
      alert("발송 중 오류 발생");
    } finally {
      setMsgSending(false);
    }
  };

  // Realtime 구독 (대화 화면이 열려있을 때)
  useEffect(() => {
    if (!chatApplicant) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/messages/${chatApplicant.id}`);
        const json = await res.json();
        setMessages(json.data || []);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [chatApplicant]);

  useEffect(() => {
    fetchData();
    fetchHeartbeats();
    const dataInterval = setInterval(() => fetchData(true), 30000);
    const hbInterval = setInterval(fetchHeartbeats, 30000);
    return () => { clearInterval(dataInterval); clearInterval(hbInterval); };
  }, [fetchData, fetchHeartbeats]);

  // 전용 폰 상태 판별
  const phoneStatus = (() => {
    if (heartbeats.length === 0) return { online: false, label: "미연결", hb: null as Heartbeat | null };
    const latest = heartbeats[0];
    const diff = Date.now() - new Date(latest.last_seen_at).getTime();
    const online = diff < 10 * 60 * 1000; // 10분
    return { online, label: online ? "온라인" : "오프라인", hb: latest };
  })();

  const filtered = data.filter((a) => {
    if (branchFilter !== "전체" && a.branch !== branchFilter) return false;
    if (statusFilter !== "전체" && a.status !== statusFilter) return false;
    if (search && !a.name.includes(search) && !a.phone.includes(search)) return false;
    return true;
  });

  const screeningList = data.filter((a) => a.filter_pass === "Y" && a.status === "연락대기");

  const handleScreening = async (id: number) => {
    if (!confirm("스크리닝 완료 처리하고 문자를 발송하시겠습니까?")) return;
    setSending(id);
    try {
      const res = await fetch("/api/admin/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json.success) {
        alert("문자 발송 완료!");
        fetchData();
      } else {
        alert("실패: " + (json.error || "알 수 없는 오류"));
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setSending(null);
    }
  };

  const stats = {
    total: data.length,
    today: data.filter((a) => {
      const d = new Date(a.created_at);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).length,
    filterPass: data.filter((a) => a.filter_pass === "Y").length,
    screening: screeningList.length,
    onboarding: data.filter((a) => a.status === "온보딩").length,
    deployed: data.filter((a) => a.status === "현장투입").length,
  };

  const branchStats = BRANCHES.slice(1).map((b) => ({
    name: b,
    total: data.filter((a) => a.branch === b).length,
    pass: data.filter((a) => a.branch === b && a.filter_pass === "Y").length,
    screening: data.filter((a) => a.branch === b && a.status === "연락대기").length,
  }));

  const selected = data.find((a) => a.id === selectedId);

  return (
    <>
      <style>{css}</style>
      <div className="admin">
        {/* 사이드바 */}
        <nav className="sidebar">
          <div className="sidebar-logo">
            <img src="/logo.png" alt="옹고잉" className="logo-sm-img" />
            <span className="sidebar-title">옹고잉 관리자</span>
          </div>
          <button className={`nav-btn ${tab === "dashboard" ? "nav-active" : ""}`}
            onClick={() => setTab("dashboard")}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>
            대시보드
          </button>
          <button className={`nav-btn ${tab === "applicants" ? "nav-active" : ""}`}
            onClick={() => setTab("applicants")}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M13 15v-1.5a3 3 0 00-3-3H8a3 3 0 00-3 3V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>
            지원자 목록
            {stats.screening > 0 && <span className="badge">{stats.screening}</span>}
          </button>
          <button className={`nav-btn ${tab === "hope-slots" ? "nav-active" : ""}`}
            onClick={() => setTab("hope-slots")}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="2" fill="currentColor"/><rect x="2" y="8" width="14" height="2" fill="currentColor" opacity="0.6"/><rect x="2" y="12" width="14" height="2" fill="currentColor" opacity="0.3"/></svg>
            희망 슬롯
          </button>
          <button className={`nav-btn ${tab === "confirmed-slots" ? "nav-active" : ""}`}
            onClick={() => setTab("confirmed-slots")}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 2h5v5H2zM11 2h5v5h-5zM2 11h5v5H2zM11 11h5v5h-5z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
            확정 슬롯
          </button>
          <button className={`nav-btn ${tab === "contact" ? "nav-active" : ""}`}
            onClick={() => setTab("contact")}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4.5h14a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1v-8a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M1 4.5l8 5 8-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            배송원 컨택
            {data.reduce((s, a) => s + (a.unread_count || 0), 0) > 0 && <span className="badge">{data.reduce((s, a) => s + (a.unread_count || 0), 0)}</span>}
          </button>
          <div className="sidebar-footer">
            <button className="nav-btn" onClick={() => fetchData()}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M1.5 9a7.5 7.5 0 0113.1-5M16.5 9a7.5 7.5 0 01-13.1 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              새로고침
            </button>
          </div>
        </nav>

        {/* 메인 */}
        <main className="main">
          {/* 전용 폰 상태 바 */}
          <div className={`phone-bar ${phoneStatus.online ? "phone-online" : "phone-offline"}`}>
            <span className={`phone-dot ${phoneStatus.online ? "dot-green" : "dot-red"}`} />
            <span className="phone-label">전용 폰: {phoneStatus.label}</span>
            {phoneStatus.hb && (
              <>
                <span className="phone-info">배터리 {phoneStatus.hb.battery_level}%</span>
                <span className="phone-info">미전송 {phoneStatus.hb.pending_count}건</span>
                <span className="phone-info">
                  마지막 응답: {new Date(phoneStatus.hb.last_seen_at).toLocaleTimeString("ko-KR")}
                </span>
              </>
            )}
            {!phoneStatus.online && <span className="phone-warn">⚠ 10분 이상 미응답</span>}
          </div>

          {loading ? (
            <div className="loading">로딩 중...</div>
          ) : tab === "dashboard" ? (
            <div className="content">
              <h2 className="page-title">대시보드</h2>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num">{stats.total}</div><div className="stat-label">전체 지원자</div></div>
                <div className="stat-card accent"><div className="stat-num">{stats.today}</div><div className="stat-label">오늘 지원</div></div>
                <div className="stat-card"><div className="stat-num">{stats.filterPass}</div><div className="stat-label">필터 통과</div></div>
                <div className="stat-card warn"><div className="stat-num">{stats.screening}</div><div className="stat-label">스크리닝 대기</div></div>
                <div className="stat-card"><div className="stat-num">{stats.onboarding}</div><div className="stat-label">온보딩 중</div></div>
                <div className="stat-card success"><div className="stat-num">{stats.deployed}</div><div className="stat-label">현장투입</div></div>
              </div>

              <h3 className="section-title">지점별 현황</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>지점</th><th>전체</th><th>필터 통과</th><th>스크리닝 대기</th><th>통과율</th></tr>
                  </thead>
                  <tbody>
                    {branchStats.map((b) => (
                      <tr key={b.name}>
                        <td className="td-bold">{b.name}</td>
                        <td>{b.total}</td>
                        <td>{b.pass}</td>
                        <td>{b.screening > 0 ? <span className="td-warn">{b.screening}</span> : 0}</td>
                        <td>{b.total > 0 ? Math.round((b.pass / b.total) * 100) + "%" : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === "applicants" ? (
            <div className="content">
              <h2 className="page-title">지원자 목록 <span className="count">{filtered.length}명</span></h2>
              <div className="filters">
                <select className="filter-select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
                <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  {["전체", ...ALL_STATUSES].map((s) => <option key={s}>{s}</option>)}
                </select>
                <input className="filter-input" placeholder="이름 또는 전화번호 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>성함</th><th>연락처</th><th>지점</th><th>차량</th><th>면허</th><th>시작가능일</th><th>상태</th><th>채널</th><th>지원일</th><th>액션</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => {
                      const canScreen = a.filter_pass === "Y" && a.status === "연락대기";
                      return (
                      <tr key={a.id} className={`clickable ${selectedId === a.id ? "row-selected" : ""}`} onClick={() => setSelectedId(selectedId === a.id ? null : a.id)}>
                        <td className="td-bold">
                          <span className="name-link" onClick={(e) => { e.stopPropagation(); openChat(a); }}>{a.name}</span>
                          {a.note === "중복지원" && <span className="dup-tag">중복</span>}
                        </td>
                        <td>{a.phone}</td>
                        <td>{a.branch}</td>
                        <td>{a.own_vehicle}</td>
                        <td>{a.license_type}</td>
                        <td>{a.available_date}</td>
                        <td><span className="status-badge" style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}>{a.status}</span></td>
                        <td>{a.source}</td>
                        <td>{new Date(a.created_at).toLocaleDateString("ko-KR")}</td>
                        <td>
                          {canScreen && (
                            <button
                              className={`row-action-btn ${sending === a.id ? "row-action-loading" : ""}`}
                              onClick={(e) => { e.stopPropagation(); handleScreening(a.id); }}
                              disabled={sending === a.id}
                            >
                              {sending === a.id ? "발송 중..." : "1차 스크리닝 완료"}
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selected && (() => {
                const draftVal = <K extends keyof Applicant>(key: K): Applicant[K] =>
                  (key in editDraft ? editDraft[key] : selected[key]) as Applicant[K];
                const setDraft = <K extends keyof Applicant>(key: K, value: Applicant[K]) =>
                  setEditDraft((prev) => ({ ...prev, [key]: value }));
                const hasChanges = Object.keys(editDraft).length > 0;
                const currentStatus = (draftVal("status") as string) || "";
                const saveEdits = async () => {
                  if (!hasChanges || savingEdit) return;
                  setSavingEdit(true);
                  const ok = await patchApplicant(selected.id, editDraft);
                  setSavingEdit(false);
                  if (ok) setEditDraft({});
                };
                const cancelEdits = () => setEditDraft({});

                return (
                <div className="detail-panel">
                  <div className="detail-header">
                    <h3>
                      {selected.name} 상세 정보
                      {hasChanges && <span className="dirty-tag">변경됨</span>}
                    </h3>
                    <div className="detail-actions">
                      <button
                        className="cancel-btn"
                        onClick={cancelEdits}
                        disabled={!hasChanges || savingEdit}
                      >
                        취소
                      </button>
                      <button
                        className="save-btn"
                        onClick={saveEdits}
                        disabled={!hasChanges || savingEdit}
                      >
                        {savingEdit ? "저장 중..." : "저장"}
                      </button>
                      <button className="close-btn" onClick={() => setSelectedId(null)}>X</button>
                    </div>
                  </div>

                  {/* 편집 가능 영역 (명시적 저장) */}
                  <div className="edit-grid">
                    <label className="edit-field">
                      <span className="dl">진행 상태</span>
                      <select
                        className="edit-select"
                        value={currentStatus}
                        onChange={(e) => setDraft("status", e.target.value)}
                      >
                        {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label className="edit-field">
                      <span className="dl">확정 슬롯</span>
                      <select
                        className="edit-select"
                        value={(draftVal("confirmed_slot") as string) || ""}
                        onChange={(e) => setDraft("confirmed_slot", e.target.value || null)}
                      >
                        <option value="">—</option>
                        {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label className="edit-field">
                      <span className="dl">확정 지점</span>
                      <select
                        className="edit-select"
                        value={(draftVal("confirmed_branch") as string) || ""}
                        onChange={(e) => setDraft("confirmed_branch", e.target.value || null)}
                      >
                        <option value="">—</option>
                        {BRANCH_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </label>
                    <label className="edit-field">
                      <span className="dl">현재 근무 지점</span>
                      <select
                        className="edit-select"
                        value={(draftVal("current_branch") as string) || ""}
                        onChange={(e) => setDraft("current_branch", e.target.value || null)}
                      >
                        <option value="">— (비근무)</option>
                        {BRANCH_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </label>
                    <label className="edit-field">
                      <span className="dl">시작일</span>
                      <input
                        type="date"
                        className="edit-select edit-date"
                        value={(draftVal("start_date") as string) || ""}
                        onChange={(e) => setDraft("start_date", e.target.value || null)}
                        onClick={(e) => {
                          const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                          try { el.showPicker?.(); } catch { /* unsupported */ }
                        }}
                      />
                    </label>
                    {currentStatus === "이탈" && (
                      <label className="edit-field edit-field-wide">
                        <span className="dl">이탈 사유</span>
                        <input
                          type="text"
                          className="edit-select"
                          placeholder="사유 입력"
                          value={(draftVal("churn_reason") as string) || ""}
                          onChange={(e) => setDraft("churn_reason", e.target.value || null)}
                        />
                      </label>
                    )}
                  </div>

                  <div className="detail-grid">
                    <div><span className="dl">거주지</span>{selected.location}</div>
                    <div><span className="dl">차종</span>{selected.vehicle_type}</div>
                    <div><span className="dl">희망지점</span>{selected.branch1}{selected.branch2 ? ` / ${selected.branch2}` : ""}</div>
                    <div><span className="dl">희망시간</span>{selected.work_hours}</div>
                    <div><span className="dl">본인명의</span>{selected.self_ownership}</div>
                    <div><span className="dl">필터</span>{selected.filter_pass === "Y" ? "통과" : "탈락"}</div>
                  </div>
                  <div className="detail-section">
                    <span className="dl">자기소개</span>
                    <p className="detail-text">{selected.introduction}</p>
                  </div>
                  {selected.experience && (
                    <div className="detail-section">
                      <span className="dl">경력</span>
                      <p className="detail-text">{selected.experience}</p>
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          ) : tab === "hope-slots" ? (
            <div className="content">
              <h2 className="page-title">희망 슬롯 분포</h2>
              <p className="page-desc">
                지원자가 <strong>희망한</strong> 시간대·지점 기준 풀 분포입니다.
                셀을 클릭하면 해당 조건의 지원자 목록이 표시됩니다.
                (필터 통과 + 활성 상태만 집계)
              </p>

              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th>지점 \ 슬롯</th>
                      {SLOTS.map((s) => <th key={s}>{s}</th>)}
                      <th>지점 합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BRANCH_NAMES.map((b) => {
                      const rowTotal = data.filter(
                        (a) =>
                          a.filter_pass === "Y" &&
                          ACTIVE_STATUSES.includes(a.status) &&
                          (a.branch1 === b || a.branch2 === b)
                      ).length;
                      return (
                        <tr key={b}>
                          <td className="td-bold">{b}</td>
                          {SLOTS.map((s) => {
                            const n = data.filter(
                              (a) =>
                                a.filter_pass === "Y" &&
                                ACTIVE_STATUSES.includes(a.status) &&
                                (a.branch1 === b || a.branch2 === b) &&
                                matchesSlot(a.work_hours, s)
                            ).length;
                            const active = slotCell?.branch === b && slotCell?.slot === s;
                            return (
                              <td
                                key={s}
                                className={`matrix-cell ${n === 0 ? "cell-zero" : n >= 3 ? "cell-hot" : "cell-some"} ${active ? "cell-active" : ""}`}
                                onClick={() => setSlotCell(active ? null : { branch: b, slot: s })}
                              >
                                {n}
                              </td>
                            );
                          })}
                          <td className="td-total">{rowTotal}</td>
                        </tr>
                      );
                    })}
                    <tr className="matrix-total-row">
                      <td className="td-bold">슬롯 합계</td>
                      {SLOTS.map((s) => (
                        <td key={s} className="td-total">
                          {data.filter(
                            (a) =>
                              a.filter_pass === "Y" &&
                              ACTIVE_STATUSES.includes(a.status) &&
                              matchesSlot(a.work_hours, s)
                          ).length}
                        </td>
                      ))}
                      <td className="td-total">
                        {data.filter(
                          (a) => a.filter_pass === "Y" && ACTIVE_STATUSES.includes(a.status)
                        ).length}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {slotCell && (() => {
                const list = data.filter(
                  (a) =>
                    a.filter_pass === "Y" &&
                    ACTIVE_STATUSES.includes(a.status) &&
                    (a.branch1 === slotCell.branch || a.branch2 === slotCell.branch) &&
                    matchesSlot(a.work_hours, slotCell.slot)
                );
                return (
                  <div className="slot-drill">
                    <div className="slot-drill-header">
                      <h3>{slotCell.branch} · {slotCell.slot} · {list.length}명</h3>
                      <button className="close-btn" onClick={() => setSlotCell(null)}>X</button>
                    </div>
                    {list.length === 0 ? (
                      <div className="empty">해당 조건의 지원자가 없습니다.</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr><th>성함</th><th>연락처</th><th>희망지점</th><th>상태</th><th>시작가능일</th><th>희망시간</th></tr>
                          </thead>
                          <tbody>
                            {list.map((a) => (
                              <tr key={a.id} className="clickable" onClick={() => { setTab("applicants"); setSelectedId(a.id); }}>
                                <td className="td-bold">{a.name}</td>
                                <td>{a.phone}</td>
                                <td>{a.branch1}{a.branch2 ? ` / ${a.branch2}` : ""}</td>
                                <td><span className="status-badge" style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}>{a.status}</span></td>
                                <td>{a.available_date}</td>
                                <td className="td-slim">{a.work_hours}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : tab === "confirmed-slots" ? (
            <div className="content">
              <h2 className="page-title">확정 슬롯 현황</h2>
              <p className="page-desc">
                실제 <strong>확정된 배치</strong> 기준 현황입니다. 각 슬롯 정원: <strong>확정 2 · 대기 1</strong>.
                셀을 클릭하면 배치된 인원이 표시됩니다.
              </p>

              <div className="matrix-legend">
                <span className="lg-dot lg-full" /> 정원 충족 (2+1)
                <span className="lg-dot lg-half" /> 확정만 충족 (2+0)
                <span className="lg-dot lg-short" /> 확정 부족 (&lt;2)
                <span className="lg-dot lg-zero" /> 빈 슬롯
              </div>

              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th>지점 \ 슬롯</th>
                      {SLOTS.map((s) => <th key={s}>{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {BRANCH_NAMES.map((b) => (
                      <tr key={b}>
                        <td className="td-bold">{b}</td>
                        {SLOTS.map((s) => {
                          const confirmed = data.filter(
                            (a) =>
                              CONFIRMED_STATUSES.includes(a.status) &&
                              a.confirmed_slot === s &&
                              a.confirmed_branch === b
                          ).length;
                          const waiting = data.filter(
                            (a) =>
                              a.status === "대기" &&
                              a.confirmed_slot === s &&
                              a.confirmed_branch === b
                          ).length;
                          const cellClass =
                            confirmed >= 2 && waiting >= 1 ? "cell-full"
                            : confirmed >= 2 ? "cell-half"
                            : confirmed === 0 && waiting === 0 ? "cell-zero"
                            : "cell-short";
                          const active = slotCell?.branch === b && slotCell?.slot === s;
                          return (
                            <td
                              key={s}
                              className={`matrix-cell ${cellClass} ${active ? "cell-active" : ""}`}
                              onClick={() => setSlotCell(active ? null : { branch: b, slot: s })}
                            >
                              <div className="conf-main">{confirmed}/2</div>
                              <div className="conf-sub">대기 {waiting}/1</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {slotCell && (() => {
                const list = data.filter(
                  (a) =>
                    a.confirmed_slot === slotCell.slot &&
                    a.confirmed_branch === slotCell.branch &&
                    [...CONFIRMED_STATUSES, "대기"].includes(a.status)
                );
                return (
                  <div className="slot-drill">
                    <div className="slot-drill-header">
                      <h3>{slotCell.branch} · {slotCell.slot} · 배치된 {list.length}명</h3>
                      <button className="close-btn" onClick={() => setSlotCell(null)}>X</button>
                    </div>
                    {list.length === 0 ? (
                      <div className="empty">배치된 인원이 없습니다. 지원자 목록에서 확정 슬롯/지점을 지정해주세요.</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr><th>성함</th><th>연락처</th><th>상태</th><th>시작일</th><th>현재 근무지</th></tr>
                          </thead>
                          <tbody>
                            {list.map((a) => (
                              <tr key={a.id} className="clickable" onClick={() => { setTab("applicants"); setSelectedId(a.id); }}>
                                <td className="td-bold">{a.name}</td>
                                <td>{a.phone}</td>
                                <td><span className="status-badge" style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}>{a.status}</span></td>
                                <td>{a.start_date || "-"}</td>
                                <td>{a.current_branch || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : tab === "contact" ? (
            <div className="content">
              <h2 className="page-title">배송원 컨택 <span className="count">{data.filter((a) => a.last_message_at || a.unread_count > 0).length}명</span></h2>
              <p className="page-desc">지원자와의 문자 대화를 관리합니다. 이름을 클릭하면 대화창이 열립니다.</p>

              <div className="filters">
                <select className="filter-select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
                <input className="filter-input" placeholder="이름 또는 전화번호 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <div className="contact-list">
                {(() => {
                  const contactList = data
                    .filter((a) => {
                      if (branchFilter !== "전체" && a.branch !== branchFilter) return false;
                      if (search && !a.name.includes(search) && !a.phone.includes(search)) return false;
                      return true;
                    })
                    .sort((a, b) => {
                      // 안읽음 있는 사람 먼저
                      if ((b.unread_count || 0) !== (a.unread_count || 0)) return (b.unread_count || 0) - (a.unread_count || 0);
                      // 그 다음 최근 문자 순
                      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                      if (tb !== ta) return tb - ta;
                      // 문자 없는 사람은 지원일 순
                      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    });

                  return contactList.length === 0 ? (
                    <div className="empty">해당하는 지원자가 없습니다.</div>
                  ) : (
                    contactList.map((a) => (
                      <div key={a.id} className={`contact-card ${a.unread_count > 0 ? "contact-unread" : ""}`} onClick={() => openChat(a)}>
                        <div className="contact-left">
                          <div className="contact-name-row">
                            <span className="contact-name">{a.name}</span>
                            <span className="status-badge" style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}>{a.status}</span>
                            {a.unread_count > 0 && <span className="unread-badge">{a.unread_count}</span>}
                          </div>
                          <div className="contact-meta">{a.phone} | {a.branch}</div>
                        </div>
                        <div className="contact-right">
                          {a.last_message_at ? (
                            <span className="contact-time">{new Date(a.last_message_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          ) : (
                            <span className="contact-time" style={{ color: "#d1d5db" }}>대화 없음</span>
                          )}
                        </div>
                      </div>
                    ))
                  );
                })()}
              </div>
            </div>
          ) : null}
          {/* 대화 패널 (카카오톡 스타일) */}
          {chatApplicant && (
            <div className="chat-overlay">
              <div className="chat-panel">
                <div className="chat-header">
                  <div>
                    <h3 className="chat-name">{chatApplicant.name}</h3>
                    <span className="chat-phone">{chatApplicant.phone}</span>
                  </div>
                  <button className="close-btn" onClick={closeChat}>✕</button>
                </div>

                <div className="chat-messages" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                  {chatLoading ? (
                    <div className="chat-loading">로딩 중...</div>
                  ) : messages.length === 0 ? (
                    <div className="chat-empty">대화 내역이 없습니다.</div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`chat-bubble-wrap ${msg.direction === "outbound" ? "bubble-right" : "bubble-left"}`}>
                        <div className={`chat-bubble ${msg.direction === "outbound" ? "bubble-out" : "bubble-in"}`}>
                          <p className="bubble-body">{msg.body}</p>
                          <div className="bubble-meta">
                            {msg.sent_by && <span>{msg.sent_by}</span>}
                            <span>{new Date(msg.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="chat-input-area">
                  <textarea
                    className="chat-input"
                    placeholder="메시지를 입력하세요..."
                    value={msgInput}
                    onChange={(e) => setMsgInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={2}
                  />
                  <button
                    className={`chat-send-btn ${msgSending ? "sc-btn-loading" : ""}`}
                    onClick={sendMessage}
                    disabled={msgSending || !msgInput.trim()}
                  >
                    {msgSending ? "발송중" : "발송"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans KR', sans-serif; background: #f5f5f0; color: #1a1a1a; }

  .admin { display: flex; min-height: 100vh; }

  .sidebar {
    width: 220px; background: #1a1a1a; color: #fff;
    padding: 20px 12px; display: flex; flex-direction: column; gap: 4px;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 10;
  }
  .sidebar-logo { display: flex; align-items: center; gap: 10px; padding: 8px; margin-bottom: 20px; }
  .logo-sm-img {
    height: 28px; width: auto; max-width: 80px;
    object-fit: contain;
    background: #fff; border-radius: 6px; padding: 3px 6px;
  }
  .sidebar-title { font-size: 14px; font-weight: 700; }
  .nav-btn {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    border: none; background: none; color: #9ca3af; font-size: 13px;
    font-family: inherit; cursor: pointer; border-radius: 8px;
    transition: all 0.15s; width: 100%; text-align: left; font-weight: 500;
  }
  .nav-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
  .nav-active { background: rgba(245,197,24,0.15); color: #F5C518; }
  .badge {
    background: #ef4444; color: #fff; font-size: 11px; font-weight: 700;
    padding: 1px 6px; border-radius: 10px; margin-left: auto;
  }
  .sidebar-footer { margin-top: auto; }

  .main { margin-left: 220px; flex: 1; min-height: 100vh; }
  .content { padding: 32px; max-width: 1200px; }
  .loading { padding: 100px; text-align: center; color: #9ca3af; font-size: 15px; }

  .page-title { font-size: 20px; font-weight: 700; margin-bottom: 24px; }
  .page-desc { font-size: 13px; color: #6b7280; margin: -16px 0 24px; }
  .count { font-size: 14px; font-weight: 500; color: #9ca3af; margin-left: 8px; }

  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .stat-card {
    background: #fff; border-radius: 12px; padding: 20px;
    border: 1px solid #e8e8e0;
  }
  .stat-card.accent { border-left: 3px solid #2563eb; }
  .stat-card.warn { border-left: 3px solid #f59e0b; }
  .stat-card.success { border-left: 3px solid #10b981; }
  .stat-num { font-size: 28px; font-weight: 700; color: #1a1a1a; }
  .stat-label { font-size: 12px; color: #9ca3af; margin-top: 4px; font-weight: 500; }

  .section-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }

  .filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-select, .filter-input {
    padding: 8px 12px; border: 1.5px solid #e8e8e0; border-radius: 8px;
    font-size: 13px; font-family: inherit; background: #fff; outline: none;
  }
  .filter-select:focus, .filter-input:focus { border-color: #F5C518; }
  .filter-input { min-width: 200px; }

  .table-wrap { overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #e8e8e0; }
  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th {
    text-align: left; padding: 12px 14px; font-weight: 600; font-size: 12px;
    color: #6b7280; border-bottom: 1px solid #e8e8e0; background: #fafaf7;
    white-space: nowrap;
  }
  .table td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; white-space: nowrap; }
  .table tbody tr:last-child td { border-bottom: none; }
  .clickable { cursor: pointer; transition: background 0.1s; }
  .clickable:hover { background: #FFFBEB; }
  .row-selected { background: #FFFBEB; }
  .td-bold { font-weight: 600; }
  .td-warn { color: #f59e0b; font-weight: 700; }

  .status-badge {
    display: inline-block; padding: 2px 8px; border-radius: 6px;
    font-size: 11px; font-weight: 600; color: #fff;
  }
  .dup-tag {
    display: inline-block; padding: 1px 5px; border-radius: 4px;
    font-size: 10px; font-weight: 600; color: #ef4444; background: #fef2f2;
    margin-left: 6px;
  }

  .detail-panel {
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 20px; margin-top: 16px;
  }
  .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .detail-header h3 { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .close-btn {
    border: none; background: none; font-size: 16px; cursor: pointer;
    color: #9ca3af; font-weight: 700; padding: 4px 8px;
  }
  .detail-actions { display: flex; gap: 8px; align-items: center; }
  .save-btn {
    padding: 7px 16px; background: #F5C518; color: #3D2B00;
    border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; transition: background 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: #E6B800; }
  .save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cancel-btn {
    padding: 7px 14px; background: #fff; color: #6b7280;
    border: 1.5px solid #E8E8E0; border-radius: 8px; font-size: 13px; font-weight: 600;
    font-family: inherit; cursor: pointer; transition: background 0.15s;
  }
  .cancel-btn:hover:not(:disabled) { background: #f9fafb; }
  .cancel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .dirty-tag {
    background: #ef4444; color: #fff; font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 10px; letter-spacing: 0.02em;
  }
  .edit-date { cursor: pointer; }
  .edit-date::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .dl { font-size: 11px; color: #9ca3af; display: block; margin-bottom: 2px; font-weight: 600; }
  .detail-section { margin-bottom: 12px; }
  .detail-text { font-size: 13px; line-height: 1.6; color: #374151; white-space: pre-wrap; }

  .empty { text-align: center; padding: 60px; color: #9ca3af; font-size: 14px; }

  /* 편집 가능 영역 */
  .edit-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px; padding: 16px; background: #FFFBEB; border: 1px solid #F5C518;
    border-radius: 10px; margin-bottom: 16px;
  }
  .edit-field { display: flex; flex-direction: column; gap: 6px; }
  .edit-field-wide { grid-column: 1 / -1; }
  .edit-select {
    padding: 8px 10px; border: 1.5px solid #E8E8E0; border-radius: 8px;
    font-size: 13px; font-family: inherit; background: #fff; outline: none;
    transition: border-color 0.15s;
  }
  .edit-select:focus { border-color: #B8860B; }

  /* 슬롯 매트릭스 */
  .matrix-wrap { overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #e8e8e0; margin-bottom: 20px; }
  .matrix {
    width: 100%; border-collapse: collapse; font-size: 13px;
    table-layout: fixed;
  }
  .matrix th {
    text-align: center; padding: 12px 8px; font-weight: 600; font-size: 12px;
    color: #6b7280; border-bottom: 1px solid #e8e8e0; background: #fafaf7;
    white-space: nowrap;
  }
  .matrix th:first-child { text-align: left; padding-left: 14px; width: 140px; }
  .matrix td {
    padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: center;
    vertical-align: middle;
  }
  .matrix td:first-child { text-align: left; padding-left: 14px; font-weight: 600; }
  .matrix-cell {
    cursor: pointer; font-weight: 700; transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .matrix-cell:hover { opacity: 0.8; transform: scale(0.98); }
  .cell-zero { color: #d1d5db; background: #fafafa; }
  .cell-some { color: #3d2b00; background: #fff8dc; }
  .cell-hot { color: #92400e; background: #fef3c7; }
  .cell-full { color: #064e3b; background: #d1fae5; }
  .cell-half { color: #1e3a8a; background: #dbeafe; }
  .cell-short { color: #991b1b; background: #fee2e2; }
  .cell-active { outline: 2px solid #F5C518; outline-offset: -2px; }
  .conf-main { font-size: 14px; font-weight: 700; }
  .conf-sub { font-size: 10px; font-weight: 500; opacity: 0.7; margin-top: 2px; }
  .td-total { font-weight: 700; color: #6b7280; background: #fafaf7; }
  .matrix-total-row td { border-top: 2px solid #e8e8e0; background: #fafaf7; }

  .matrix-legend {
    display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px;
    font-size: 12px; color: #6b7280; align-items: center;
  }
  .lg-dot {
    width: 12px; height: 12px; border-radius: 3px; display: inline-block;
    margin-right: 4px; vertical-align: middle;
  }
  .lg-full { background: #d1fae5; border: 1px solid #10b981; }
  .lg-half { background: #dbeafe; border: 1px solid #3b82f6; }
  .lg-short { background: #fee2e2; border: 1px solid #ef4444; }
  .lg-zero { background: #fafafa; border: 1px solid #d1d5db; }

  .slot-drill {
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 16px; margin-top: 12px;
  }
  .slot-drill-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px;
  }
  .slot-drill-header h3 { font-size: 14px; font-weight: 700; }
  .td-slim { font-size: 11px; color: #6b7280; max-width: 280px; white-space: normal; }

  .screening-list { display: flex; flex-direction: column; gap: 12px; }
  .screening-card {
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 18px; transition: box-shadow 0.15s;
  }
  .screening-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
  .sc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .sc-name { font-size: 15px; font-weight: 700; }
  .sc-info { font-size: 12px; color: #6b7280; margin-top: 2px; }
  .sc-details { font-size: 12px; color: #9ca3af; margin-bottom: 6px; display: flex; gap: 16px; }
  .sc-intro { font-size: 12px; color: #6b7280; line-height: 1.5; }
  .sc-btn {
    padding: 8px 16px; background: #F5C518; color: #3D2B00;
    border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    transition: background 0.15s;
  }
  .sc-btn:hover { background: #E6B800; }
  .sc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .sc-btn-loading { background: #d4a50e; }

  .row-action-btn {
    padding: 5px 10px; background: #F5C518; color: #3D2B00;
    border: none; border-radius: 6px; font-size: 11px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    transition: background 0.15s;
  }
  .row-action-btn:hover:not(:disabled) { background: #E6B800; }
  .row-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .row-action-loading { background: #d4a50e; }

  /* 전용 폰 상태 바 */
  .phone-bar {
    display: flex; align-items: center; gap: 10px; padding: 8px 20px;
    font-size: 12px; border-bottom: 1px solid #e8e8e0;
  }
  .phone-online { background: #f0fdf4; }
  .phone-offline { background: #fef2f2; }
  .phone-dot {
    width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0;
  }
  .dot-green { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
  .dot-red { background: #ef4444; animation: blink 1s infinite; }
  @keyframes blink { 50% { opacity: 0.4; } }
  .phone-label { font-weight: 600; }
  .phone-info { color: #6b7280; }
  .phone-warn { color: #ef4444; font-weight: 700; margin-left: auto; }

  /* 컨택 리스트 */
  .contact-list { display: flex; flex-direction: column; gap: 8px; }
  .contact-card {
    display: flex; justify-content: space-between; align-items: center;
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 16px 20px; cursor: pointer; transition: all 0.15s;
  }
  .contact-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); border-color: #F5C518; }
  .contact-unread { border-left: 3px solid #ef4444; background: #fffbfb; }
  .contact-left { flex: 1; }
  .contact-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .contact-name { font-size: 15px; font-weight: 700; }
  .contact-meta { font-size: 12px; color: #6b7280; }
  .contact-right { text-align: right; flex-shrink: 0; margin-left: 16px; }
  .contact-time { font-size: 12px; color: #9ca3af; }

  /* 이름 링크 */
  .name-link { cursor: pointer; color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
  .name-link:hover { color: #1d4ed8; }

  /* 안읽음 배지 */
  .unread-badge {
    display: inline-block; background: #ef4444; color: #fff;
    font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px;
  }

  /* 대화 패널 오버레이 */
  .chat-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4); z-index: 100;
    display: flex; align-items: center; justify-content: center;
  }
  .chat-panel {
    width: 440px; max-width: 95vw; height: 80vh; background: #fff;
    border-radius: 16px; display: flex; flex-direction: column;
    overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.2);
  }
  .chat-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid #e8e8e0; background: #fafaf7;
  }
  .chat-name { font-size: 16px; font-weight: 700; }
  .chat-phone { font-size: 12px; color: #6b7280; }

  .chat-messages {
    flex: 1; overflow-y: auto; padding: 16px; background: #e8e4d9;
    display: flex; flex-direction: column; gap: 8px;
  }
  .chat-loading, .chat-empty {
    text-align: center; color: #9ca3af; padding: 40px; font-size: 13px;
  }

  .chat-bubble-wrap { display: flex; }
  .bubble-left { justify-content: flex-start; }
  .bubble-right { justify-content: flex-end; }
  .chat-bubble {
    max-width: 75%; padding: 10px 14px; border-radius: 16px;
    font-size: 13px; line-height: 1.5; word-break: break-word;
  }
  .bubble-in {
    background: #fff; color: #1a1a1a;
    border-top-left-radius: 4px;
  }
  .bubble-out {
    background: #F5C518; color: #3D2B00;
    border-top-right-radius: 4px;
  }
  .bubble-body { margin: 0; white-space: pre-wrap; }
  .bubble-meta {
    display: flex; gap: 8px; justify-content: flex-end;
    font-size: 10px; color: rgba(0,0,0,0.4); margin-top: 4px;
  }

  .chat-input-area {
    display: flex; gap: 8px; padding: 12px 16px;
    border-top: 1px solid #e8e8e0; background: #fff;
  }
  .chat-input {
    flex: 1; border: 1.5px solid #e8e8e0; border-radius: 10px;
    padding: 10px 12px; font-size: 13px; font-family: inherit;
    resize: none; outline: none;
  }
  .chat-input:focus { border-color: #F5C518; }
  .chat-send-btn {
    padding: 10px 20px; background: #F5C518; color: #3D2B00;
    border: none; border-radius: 10px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    align-self: flex-end;
  }
  .chat-send-btn:hover { background: #E6B800; }
  .chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 768px) {
    .sidebar { width: 60px; padding: 12px 6px; }
    .sidebar-title, .nav-btn span:not(.badge) { display: none; }
    .nav-btn { justify-content: center; padding: 10px; }
    .main { margin-left: 60px; }
    .content { padding: 16px; }
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
    .detail-grid { grid-template-columns: 1fr; }
  }
`;
