import * as React from "react";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/labels";

export function Badge({ className, color, ...props }: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  const c = color ? colorClasses(color) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        c ? `${c.soft} ${c.border} ${c.text}` : "border-border bg-secondary text-secondary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", colorClasses(color).dot, className)} />;
}
