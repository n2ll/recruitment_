import { useMemo } from "react";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Candidate, ModeConfig, stageBadge, statusTone } from "../danggeun-types";

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function shortWorkHours(wh: string | null): string {
  if (!wh || wh === "미확인") return "";
  const parts = wh.split(",").map((s) => s.trim()).filter(Boolean);
  const out = parts
    .map((p) => {
      const day = p.includes("주말") ? "주말" : p.includes("평일") ? "평일" : "";
      const time = p.includes("오전") ? "오전" : p.includes("오후") ? "오후" : "";
      return day + time;
    })
    .filter(Boolean);
  return Array.from(new Set(out)).join(", ");
}

interface DanggeunListPaneProps {
  cfg: ModeConfig;
  candidates: Candidate[];
  branches: string[];
  branchFilter: string;
  setBranchFilter: (b: string) => void;
  search: string;
  setSearch: (s: string) => void;
  listLoading: boolean;
  listError: boolean;
  fetchCandidates: () => void;
  selectedId: number | null;
  setSelectedId: (id: number) => void;
}

export default function DanggeunListPane({
  cfg,
  candidates,
  branches,
  branchFilter,
  setBranchFilter,
  search,
  setSearch,
  listLoading,
  listError,
  fetchCandidates,
  selectedId,
  setSelectedId,
}: DanggeunListPaneProps) {
  const filteredCandidates = useMemo(() => {
    const q = search.trim();
    const filtered = candidates.filter((c) => {
      if (c.status === "부적합" || c.status === "이탈") return false;
      if (branchFilter !== "전체") {
        if (branchFilter === "미배정") {
          if (c.branch) return false;
        } else if (c.branch !== branchFilter) {
          return false;
        }
      }
      if (q && !(c.name.includes(q) || c.phone.includes(q.replace(/-/g, ""))))
        return false;
      return true;
    });
    return filtered.slice().sort((a, b) => {
      const aHas = !!a.last_message_at;
      const bHas = !!b.last_message_at;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      const ta = new Date(a.last_message_at ?? a.created_at).getTime();
      const tb = new Date(b.last_message_at ?? b.created_at).getTime();
      return tb - ta;
    });
  }, [candidates, search, branchFilter]);

  return (
    <aside className="flex-1 max-w-[480px] min-w-[320px] flex flex-col gap-2 bg-paper-white border border-bone rounded-xl p-3">
      <div className="flex gap-1.5 items-center">
        <select
          className="flex-none w-[130px] py-[7px] px-2 text-xs cursor-pointer border border-stone-border rounded-lg bg-paper-white text-ink-black focus:outline-none focus:border-deep-violet focus:ring-2 focus:ring-deep-violet/20"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          title="지점 필터"
        >
          <option value="전체">전체 지점</option>
          <option value="미배정">미배정</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <input
          className="flex-1 min-w-0 py-2 px-2.5 border border-stone-border rounded-lg text-[13px] bg-paper-white text-ink-black focus:outline-none focus:border-deep-violet focus:ring-2 focus:ring-deep-violet/20"
          placeholder="이름 / 전화번호 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0">
        {listLoading ? (
          <LoadingState label="후보 불러오는 중…" />
        ) : listError ? (
          <ErrorState onRetry={() => fetchCandidates()} />
        ) : filteredCandidates.length === 0 ? (
          candidates.length === 0 ? (
            <EmptyState
              title={`아직 ${cfg.channelLabel} 후보가 없어요`}
              hint={`[지원자 목록 → + 지원자 추가]에서 지원경로를 '${cfg.channelLabel}'으로 등록하면 여기 나타나요.`}
            />
          ) : (
            <EmptyState title="검색 결과가 없어요" hint="검색어를 바꿔보세요." />
          )
        ) : (
          filteredCandidates.map((c) => {
            const sb = stageBadge(c.agent_stage);
            const isActive = selectedId === c.id;
            return (
              <button
                key={c.id}
                className={`text-left border rounded-lg py-2.5 px-3 cursor-pointer flex flex-col gap-1 transition-colors ${
                  isActive
                    ? "bg-lavender-soft border-deep-violet"
                    : "bg-paper-white border-transparent hover:bg-bone/30"
                }`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[13px] text-ink-black flex-1">
                    {c.name}
                  </span>
                  {(c.status === "확정인력" || c.status === "대기자") && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-pill font-bold inline-block whitespace-nowrap"
                      style={{
                        background: statusTone(c.status).bg,
                        color: statusTone(c.status).fg,
                      }}
                      title={c.status}
                    >
                      {c.status}
                    </span>
                  )}
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-pill font-bold inline-block"
                    style={{ background: sb.bg, color: sb.fg }}
                  >
                    {sb.label}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="bg-burgundy text-white text-[10px] px-1.5 py-[1px] rounded-pill font-bold">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-graphite flex gap-1 items-center flex-wrap">
                  <span>{formatPhone(c.phone)}</span>
                  <span>·</span>
                  <span>{c.branch ?? "-"}</span>
                  {shortWorkHours(c.work_hours) && (
                    <>
                      <span>·</span>
                      <span className="text-honey-gold font-semibold">
                        🕑 {shortWorkHours(c.work_hours)}
                      </span>
                    </>
                  )}
                  {c.last_message_at && (
                    <>
                      <span>·</span>
                      <span>{timeAgo(c.last_message_at)}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
