import * as React from "react";
import { Card } from "./card";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/labels";

export function Stat({ label, value, sub, icon: Icon, color }: { label: string; value: React.ReactNode; sub?: string; icon?: React.ComponentType<{ className?: string }>; color?: string }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className={cn("size-3.5", color && colorClasses(color).text)} aria-hidden />}
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", color && colorClasses(color).text)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}
