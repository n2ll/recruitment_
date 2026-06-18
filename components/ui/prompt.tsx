"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import { Button } from "./button";
import { Input, Textarea } from "./input";

interface PromptAction {
  label: string;
  /** resolve 값 — 이 버튼을 누르면 Promise가 이 값으로 풀린다 */
  value: string;
  variant?: "primary" | "danger" | "ghost" | "outline";
}

interface PromptOptions {
  title: string;
  description?: React.ReactNode;
  /** actions가 있으면 선택형(버튼들), 없으면 텍스트 입력형 */
  actions?: PromptAction[];
  // ── 텍스트 입력형 옵션 ──
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  confirmText?: string;
  cancelText?: string;
}

/** 텍스트 입력은 입력값(빈 문자열 가능), 선택형은 선택한 value. 취소/닫기는 null. */
type Resolver = (value: string | null) => void;

const PromptContext = React.createContext<
  ((o: PromptOptions) => Promise<string | null>) | null
>(null);

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = React.useState<PromptOptions | null>(null);
  const [value, setValue] = React.useState("");
  const resolverRef = React.useRef<Resolver | null>(null);

  const prompt = React.useCallback((o: PromptOptions) => {
    setOpts(o);
    setValue(o.defaultValue ?? "");
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (result: string | null) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOpts(null);
  };

  const isChoice = !!opts?.actions?.length;

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <Dialog open={!!opts} onOpenChange={(open) => !open && settle(null)}>
        {opts ? (
          <DialogContent className="max-w-md" guardClose={false}>
            <DialogHeader>
              <DialogTitle>{opts.title}</DialogTitle>
              {opts.description ? (
                <DialogDescription>{opts.description}</DialogDescription>
              ) : null}
            </DialogHeader>

            {!isChoice && (
              <div className="px-1">
                {opts.multiline ? (
                  <Textarea
                    autoFocus
                    placeholder={opts.placeholder}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                ) : (
                  <Input
                    autoFocus
                    placeholder={opts.placeholder}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        settle(value);
                      }
                    }}
                  />
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => settle(null)}>
                {opts.cancelText ?? "취소"}
              </Button>
              {isChoice ? (
                opts.actions!.map((a) => (
                  <Button
                    key={a.value}
                    variant={a.variant ?? "primary"}
                    size="sm"
                    onClick={() => settle(a.value)}
                  >
                    {a.label}
                  </Button>
                ))
              ) : (
                <Button variant="primary" size="sm" onClick={() => settle(value)}>
                  {opts.confirmText ?? "확인"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  const ctx = React.useContext(PromptContext);
  if (!ctx) throw new Error("usePrompt must be used within <PromptProvider>");
  return ctx;
}
