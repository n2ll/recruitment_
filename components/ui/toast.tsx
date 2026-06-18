"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

const ToastContext = React.createContext<((t: ToastInput) => void) | null>(null);

const TONE_ICON: Record<ToastTone, React.ElementType> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const TONE_ACCENT: Record<ToastTone, string> = {
  success: "text-deep-violet",
  error: "text-burgundy",
  info: "text-slate-gray",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const remove = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (t: ToastInput) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, tone: t.tone ?? "info", title: t.title, description: t.description }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(92vw,360px)] flex-col gap-2">
        {items.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-[12px] border border-bone bg-paper-white px-4 py-3"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_ACCENT[t.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-ink-black">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 text-[13px] leading-snug text-slate-gray">{t.description}</p>
                ) : null}
              </div>
              <button
                aria-label="닫기"
                onClick={() => remove(t.id)}
                className="rounded-pill p-0.5 text-mist-gray transition-colors hover:text-ink-black"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
