import * as React from "react";
import { cn } from "@/lib/cn";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="ob-scroll w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-[14px]", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-bone last:border-0 transition-colors", className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "ob-eyebrow whitespace-nowrap px-3 py-2.5 text-left font-medium",
        className
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle text-ink-black", className)} {...props} />;
}

/** 빈/에러 상태 행 — 로드 실패와 빈 상태를 분리해서 보여줄 때 사용 */
export function TableEmpty({
  colSpan,
  title,
  hint,
  action,
}: {
  colSpan: number;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-14 text-center">
        <div className="flex flex-col items-center gap-2">
          <p className="text-[14px] font-medium text-slate-gray">{title}</p>
          {hint ? <p className="text-[13px] text-mist-gray">{hint}</p> : null}
          {action}
        </div>
      </td>
    </tr>
  );
}
