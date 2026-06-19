import * as React from "react";
import { cn } from "@/lib/cn";

interface DisplayHeadlineProps extends React.HTMLAttributes<HTMLHeadingElement> {
  size?: "lg" | "md";
  eyebrow?: React.ReactNode;
}

export function DisplayHeadline({ className, size = "md", eyebrow, children, ...props }: DisplayHeadlineProps) {
  return (
    <div className="flex flex-col">
      {eyebrow && (
        <div className="mb-4">
          {typeof eyebrow === "string" ? (
            <span className="ob-eyebrow font-semibold text-mist-gray before:mr-2 before:content-['•']">{eyebrow}</span>
          ) : (
            eyebrow
          )}
        </div>
      )}
      <h1
        className={cn(
          "text-ink-black",
          size === "lg" ? "ob-display-lg" : "ob-display",
          className
        )}
        {...props}
      >
        {children}
      </h1>
    </div>
  );
}
