import * as React from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-[8px] border border-stone-border/30 bg-paper-white px-3 text-[14px] text-ink-black placeholder:text-mist-gray outline-none transition-colors focus-visible:border-deep-violet focus-visible:ring-2 focus-visible:ring-deep-violet/20 disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "min-h-20 resize-y py-2 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-[13px] font-medium text-slate-gray", className)}
      {...props}
    />
  );
}
