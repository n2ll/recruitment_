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

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 종료성/위험 동작이면 true → 확인 버튼을 danger 톤으로 */
  destructive?: boolean;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = React.createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(
  null
);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<Resolver | null>(null);

  const confirm = React.useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(open) => !open && settle(false)}>
        {opts ? (
          <DialogContent className="max-w-md" guardClose={false}>
            <DialogHeader>
              <DialogTitle>{opts.title}</DialogTitle>
              {opts.description ? (
                <DialogDescription>{opts.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => settle(false)}>
                {opts.cancelText ?? "취소"}
              </Button>
              <Button
                variant={opts.destructive ? "danger" : "primary"}
                size="sm"
                onClick={() => settle(true)}
                autoFocus
              >
                {opts.confirmText ?? "확인"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}
