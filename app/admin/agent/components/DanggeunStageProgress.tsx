import { STAGE_LABEL } from "../danggeun-types";

// progress 2단계 — 스크리닝 중 → 스크리닝 완료.
// 내부적으로 onboarding/active도 모두 '스크리닝 완료' 노드(=onboarding)에 매핑된다.
const STAGE_FLOW = ["screening", "onboarding"] as const;
type FlowStage = (typeof STAGE_FLOW)[number];

export default function DanggeunStageProgress({
  stage,
  onStageClick,
  busy = false,
}: {
  stage: string | null;
  onStageClick?: (target: FlowStage) => void;
  busy?: boolean;
}) {
  // paused / abort는 별도 표시
  const isPaused = stage === "paused";
  const isAbort = stage === "abort";
  // exploration → screening 노드. active도 onboarding 노드(='스크리닝 완료')에 매핑.
  const effective =
    stage === "exploration"
      ? "screening"
      : stage === "active"
      ? "onboarding"
      : stage;
  const currentIdx = STAGE_FLOW.indexOf(effective as FlowStage);
  const clickable = !!onStageClick && !isAbort && !busy; // abort/처리 중엔 단계 변경 불가

  return (
    <div className="flex items-center px-6 pt-3.5 pb-2.5 bg-paper-white border-b border-bone relative">
      {STAGE_FLOW.map((s, i) => {
        const done = currentIdx > i;
        const current = currentIdx === i;
        const isClickable = clickable && !current;
        return (
          <div
            key={s}
            className={`flex items-center relative ${
              i === STAGE_FLOW.length - 1 ? "flex-none" : "flex-1"
            } ${isClickable ? "cursor-pointer group" : ""}`}
            onClick={isClickable ? () => onStageClick(s) : undefined}
            role={isClickable ? "button" : undefined}
            title={isClickable ? `'${STAGE_LABEL[s]}' 단계로 이동` : undefined}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 transition-transform duration-75 ${
                isClickable ? "group-hover:scale-110" : ""
              } ${
                done
                  ? "bg-deep-violet text-white"
                  : current
                  ? "bg-honey-gold text-ink-black shadow-[0_0_0_3px_rgba(228,185,118,0.35)]"
                  : "bg-bone text-mist-gray"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <div
              className={`ml-1.5 text-xs whitespace-nowrap transition-colors ${
                isClickable ? "group-hover:text-deep-violet group-hover:underline" : ""
              } ${
                current
                  ? "text-burnt-amber font-bold"
                  : done
                  ? "text-deep-violet font-semibold"
                  : "text-mist-gray font-medium"
              }`}
            >
              {STAGE_LABEL[s]}
            </div>
            {i < STAGE_FLOW.length - 1 && (
              <div
                className={`flex-1 h-[2px] mx-2 min-w-[20px] ${
                  done ? "bg-deep-violet" : "bg-bone"
                }`}
              />
            )}
          </div>
        );
      })}
      {(isPaused || isAbort) && (
        <div
          className={`absolute right-6 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-pill text-[11px] font-bold ${
            isAbort ? "bg-ink-black text-white" : "bg-rose-soft text-burgundy"
          }`}
        >
          {isPaused ? "⏸ 매니저 인계" : "⛔ 중단"}
        </div>
      )}
    </div>
  );
}
