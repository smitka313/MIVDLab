import * as React from "react";
import { AlertTriangle, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/data/adapter";
import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center", className)}>
      {Icon && (
        <div className="mb-1 rounded-full bg-secondary p-3 text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-8 text-center", className)}>
      <AlertTriangle className="size-5 text-destructive" aria-hidden />
      <p className="font-medium">Couldn&apos;t load this data</p>
      <p className="max-w-md text-sm text-muted-foreground">{friendlyError(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      )}
    </div>
  );
}
