"use client";

import { NamedListEditor } from "@/features/settings/list-editor";

export function StrategyLibrary() {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Edit the starter strategies or add your own. Switched-off strategies stay on existing plans but aren&apos;t offered for new ones.</p>
      <NamedListEditor table="intervention_strategies" noun="strategy" />
    </div>
  );
}
