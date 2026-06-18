"use client";

import * as React from "react";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CommandAction {
  id: string;
  label: string;
  group?: string;
  keywords?: string;
  icon?: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  commands,
  open: openProp,
  onOpenChange,
}: {
  commands: CommandAction[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = React.useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setOpenState(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const groups = React.useMemo(() => {
    const map = new Map<string, CommandAction[]>();
    for (const c of commands) {
      const g = c.group ?? "이동";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    }
    return Array.from(map.entries());
  }, [commands]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-ink-black/35 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          aria-label="명령 팔레트"
          className="fixed left-1/2 top-[18vh] z-[90] w-[min(92vw,560px)] -translate-x-1/2 overflow-hidden rounded-[14px] border border-bone bg-paper-white"
        >
          <DialogPrimitive.Title className="sr-only">명령 팔레트</DialogPrimitive.Title>
          <Command className="w-full" loop>
            <div className="flex items-center gap-2 border-b border-bone px-4">
              <Search className="h-4 w-4 text-mist-gray" />
              <Command.Input
                autoFocus
                placeholder="화면 이동 · 검색…"
                className="h-12 w-full bg-transparent text-[15px] text-ink-black placeholder:text-mist-gray outline-none"
              />
              <kbd className="hidden rounded-[6px] border border-bone px-1.5 py-0.5 text-[11px] text-mist-gray sm:block">
                ESC
              </kbd>
            </div>
            <Command.List className="ob-scroll max-h-[320px] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-[14px] text-mist-gray">
                일치하는 항목이 없어요
              </Command.Empty>
              {groups.map(([group, items]) => (
                <Command.Group
                  key={group}
                  heading={<span className="ob-eyebrow px-2">{group}</span>}
                  className="mb-1"
                >
                  {items.map((c) => (
                    <Command.Item
                      key={c.id}
                      value={`${c.label} ${c.keywords ?? ""}`}
                      onSelect={() => {
                        setOpen(false);
                        c.run();
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 text-[14px] text-ink-black outline-none",
                        "data-[selected=true]:bg-bone/70"
                      )}
                    >
                      {c.icon ? <span className="text-slate-gray">{c.icon}</span> : null}
                      {c.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
