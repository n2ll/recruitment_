"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  LayoutGrid,
  Building2,
  Mail,
  Inbox,
  Bot,
  BarChart3,
  Sparkles,
  UserCog,
  FlaskConical,
  RefreshCw,
  Pin,
  PinOff,
  Command as CommandIcon,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Wordmark } from "@/components/brand/Wordmark";
import { CommandPalette, type CommandAction } from "@/components/ui/command-palette";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  id: string;
  label: string;
  collapsible?: boolean;
  items: NavItem[];
}

const ic = "h-[18px] w-[18px]";
const emoji = (e: string) => (
  <span className="inline-flex h-[18px] w-[18px] items-center justify-center text-[16px] leading-none">
    {e}
  </span>
);

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "ats",
    label: "채용 운영",
    items: [
      { id: "dashboard", label: "대시보드", icon: <LayoutDashboard className={ic} /> },
      { id: "applicants", label: "인재풀·파이프라인", icon: <Users className={ic} /> },
      { id: "recommend", label: "AI 추천", icon: <Sparkles className={ic} /> },
      { id: "confirmed-slots", label: "확정 슬롯", icon: <LayoutGrid className={ic} /> },
      { id: "branches", label: "지점 관리", icon: <Building2 className={ic} /> },
    ],
  },
  {
    id: "messaging",
    label: "메시지·스크리닝",
    items: [
      { id: "danggeun", label: "당근마켓구인", icon: emoji("🥕") },
      { id: "baemin", label: "배달의민족구인", icon: emoji("📱") },
      { id: "klod", label: "클로드 조련하기", icon: emoji("🧠") },
    ],
  },
  {
    id: "other",
    label: "기타·설정",
    collapsible: true,
    items: [
      { id: "contact", label: "배송원 컨택", icon: <Mail className={ic} /> },
      { id: "inbox", label: "미분류 인박스", icon: <Inbox className={ic} /> },
      { id: "danggeun-practice", label: "당근마켓구인 (연습용)", icon: emoji("🧪") },
      { id: "agent", label: "구인 에이전트", icon: <Bot className={ic} /> },
      { id: "hope-slots", label: "희망 슬롯", icon: <BarChart3 className={ic} /> },
      { id: "site-managers", label: "현장 매니저", icon: <UserCog className={ic} /> },
      { id: "playground", label: "플레이그라운드", icon: <FlaskConical className={ic} /> },
    ],
  },
];

const FLAT_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

function activeLabel(active: string): string {
  return FLAT_ITEMS.find((i) => i.id === active)?.label ?? "옹보딩";
}

interface AppShellProps {
  active: string;
  onNavigate: (id: string) => void;
  pinned: boolean;
  onTogglePin: () => void;
  showOther: boolean;
  onToggleOther: () => void;
  badges?: Record<string, number | undefined>;
  onRefresh?: () => void;
  children: React.ReactNode;
}

export function AppShell({
  active,
  onNavigate,
  pinned,
  onTogglePin,
  showOther,
  onToggleOther,
  badges = {},
  onRefresh,
  children,
}: AppShellProps) {
  const [hovered, setHovered] = React.useState(false);
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const expanded = pinned || hovered;

  const commands: CommandAction[] = React.useMemo(
    () =>
      NAV_GROUPS.flatMap((g) =>
        g.items.map((it) => ({
          id: it.id,
          label: it.label,
          group: g.label,
          icon: it.icon,
          run: () => onNavigate(it.id),
        }))
      ),
    [onNavigate]
  );

  const renderItem = (it: NavItem) => {
    const isActive = active === it.id;
    const badge = badges[it.id];
    return (
      <button
        key={it.id}
        onClick={() => onNavigate(it.id)}
        title={it.label}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-colors",
          expanded ? "justify-start" : "justify-center",
          isActive
            ? "bg-lavender-soft text-deep-violet"
            : "text-slate-gray hover:bg-bone/60 hover:text-ink-black"
        )}
      >
        {isActive ? (
          <motion.span
            layoutId="nav-active"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-deep-violet"
          />
        ) : null}
        <span className="shrink-0">{it.icon}</span>
        {expanded ? <span className="truncate">{it.label}</span> : null}
        {badge && badge > 0 ? (
          <span
            className={cn(
              "ml-auto inline-flex min-w-[18px] items-center justify-center rounded-pill bg-burgundy px-1.5 text-[11px] font-semibold text-paper-white",
              !expanded && "absolute right-1 top-1 ml-0 px-1"
            )}
          >
            {badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen bg-paper-white text-ink-black">
      <motion.nav
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        animate={{ width: expanded ? 248 : 68 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="ob-scroll sticky top-0 z-20 flex h-screen shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto border-r border-bone bg-paper-white px-3 py-5"
      >
        <div className={cn("mb-4 flex items-center px-2", expanded ? "justify-start" : "justify-center")}>
          {expanded ? (
            <Wordmark suffix="ATS" size="sm" />
          ) : (
            <span className="ob-headline text-[20px] text-ink-black">옹</span>
          )}
        </div>

        {NAV_GROUPS.map((g) => {
          const collapsed = g.collapsible && !showOther;
          return (
            <div key={g.id} className="flex flex-col gap-0.5">
              {g.collapsible ? (
                expanded ? (
                  <button
                    onClick={onToggleOther}
                    className="flex items-center justify-between px-3 pb-1 pt-3 text-left"
                  >
                    <span className="ob-eyebrow">{g.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-mist-gray transition-transform",
                        showOther && "rotate-180"
                      )}
                    />
                  </button>
                ) : (
                  <div className="my-1 h-px bg-bone" />
                )
              ) : expanded ? (
                <div className="px-3 pb-1 pt-3">
                  <span className="ob-eyebrow">{g.label}</span>
                </div>
              ) : (
                <div className="my-1 h-px bg-bone" />
              )}
              {!collapsed ? g.items.map(renderItem) : null}
            </div>
          );
        })}

        <div className="mt-auto flex flex-col gap-0.5 pt-3">
          {onRefresh ? (
            <button
              onClick={onRefresh}
              title="새로고침"
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium text-slate-gray transition-colors hover:bg-bone/60 hover:text-ink-black",
                expanded ? "justify-start" : "justify-center"
              )}
            >
              <RefreshCw className={ic} />
              {expanded ? <span>새로고침</span> : null}
            </button>
          ) : null}
          <button
            onClick={onTogglePin}
            title={pinned ? "사이드바 펼침 고정 해제" : "사이드바 펼침 고정"}
            className={cn(
              "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium text-mist-gray transition-colors hover:bg-bone/60 hover:text-ink-black",
              expanded ? "justify-start" : "justify-center"
            )}
          >
            {pinned ? <Pin className={ic} /> : <PinOff className={ic} />}
            {expanded ? <span>{pinned ? "고정됨" : "사이드바 고정"}</span> : null}
          </button>
        </div>
      </motion.nav>

      <main className="ob-scroll flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-bone bg-paper-white/85 px-6 backdrop-blur">
          <div className="flex items-baseline gap-2">
            <span className="ob-eyebrow">옹보딩 ATS</span>
            <span className="text-[15px] font-medium tracking-tight text-ink-black">
              {activeLabel(active)}
            </span>
          </div>
          <button
            onClick={() => setCmdOpen(true)}
            className="inline-flex items-center gap-2 rounded-pill border border-bone px-3 py-1.5 text-[12.5px] text-slate-gray transition-colors hover:bg-bone/60"
          >
            <CommandIcon className="h-3.5 w-3.5" />
            <span>빠른 이동</span>
            <kbd className="rounded-[5px] border border-bone px-1 text-[11px] text-mist-gray">⌘K</kbd>
          </button>
        </header>

        <div className="min-w-0 flex-1">{children}</div>
      </main>

      <CommandPalette commands={commands} open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
