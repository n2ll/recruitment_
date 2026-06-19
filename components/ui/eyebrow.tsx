import * as React from "react";
import { cn } from "@/lib/cn";

interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  bullet?: boolean;
}

export function Eyebrow({ className, bullet = true, children, ...props }: EyebrowProps) {
  return (
    <span
      className={cn("ob-eyebrow", bullet && "before:mr-1.5 before:content-['•']", className)}
      {...props}
    >
      {children}
    </span>
  );
}
