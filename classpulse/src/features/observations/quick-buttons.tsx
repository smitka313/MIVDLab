"use client";

import * as React from "react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { Activity, NewRow, ObservationBehavior, ObservationCategory, ObservationKind, Student } from "@/lib/types";
import { KIND_LABELS, colorClasses } from "@/lib/labels";
import { cn, displayName } from "@/lib/utils";
import { useCurrentActivity } from "@/lib/hooks";
import { Loader2 } from "lucide-react";

export function buildObservation(args: {
  student: Pick<Student, "id">;
  classId: string;
  category: ObservationCategory;
  behavior?: ObservationBehavior | null;
  label?: string;
  activity?: Activity | null;
  note?: string | null;
  context?: string | null;
  intervention_used?: string | null;
  follow_up_required?: boolean;
  observed_at?: string;
  group_id?: string | null;
}): NewRow<"observations"> {
  return {
    student_id: args.student.id,
    class_id: args.classId,
    observed_at: args.observed_at ?? new Date().toISOString(),
    category_id: args.category.id,
    behavior_id: args.behavior?.id ?? null,
    kind: args.category.kind,
    category_name: args.category.name,
    behavior_label: args.behavior?.label ?? args.label ?? args.category.name,
    context: args.context ?? null,
    note: args.note ?? null,
    activity: args.activity ?? null,
    intervention_used: args.intervention_used ?? null,
    follow_up_required: args.follow_up_required ?? false,
    group_id: args.group_id ?? null,
  };
}

/** Active categories with their active quick-log buttons, in display order. */
export function useQuickLogConfig() {
  const cats = useRows("observation_categories");
  const behaviors = useRows("observation_behaviors");
  return React.useMemo(() => {
    const active = cats.rows.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order);
    return active.map((c) => ({
      category: c,
      behaviors: behaviors.rows.filter((b) => b.category_id === c.id && b.is_active && b.is_quick).sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [cats.rows, behaviors.rows]);
}

/**
 * One-click behavior buttons. A single click records a timestamped observation
 * for the student/class, confirmed by a toast with Undo.
 */
export function QuickBehaviorButtons({
  student,
  classId,
  kinds,
  onLogged,
  compact,
}: {
  student: Student;
  classId: string;
  kinds?: ObservationKind[];
  onLogged?: () => void;
  compact?: boolean;
}) {
  const config = useQuickLogConfig();
  const store = useStore();
  const run = useAction();
  const [activity] = useCurrentActivity();
  const [busy, setBusy] = React.useState<string | null>(null);

  const log = async (category: ObservationCategory, behavior: ObservationBehavior) => {
    setBusy(behavior.id);
    const res = await run(() => store.insertOne("observations", buildObservation({ student, classId, category, behavior, activity })), {
      success: `${behavior.label} · ${displayName(student)}`,
      undo: (row) => store.remove("observations", [row.id]),
    });
    setBusy(null);
    if (res) onLogged?.();
  };

  const groups = config.filter((g) => !kinds || kinds.includes(g.category.kind));
  if (!groups.length) {
    return <p className="text-sm text-muted-foreground">No quick-log buttons are enabled. Add some in Settings → Behavior categories.</p>;
  }

  return (
    <div className="grid gap-3">
      {groups.map(({ category, behaviors }) => {
        const c = colorClasses(category.color);
        return (
          <section key={category.id} aria-label={`${category.name} observations`}>
            <h3 className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", c.text)}>
              <span aria-hidden className={cn("size-2 rounded-full", c.dot)} />
              {category.name}
              <span className="sr-only"> ({KIND_LABELS[category.kind]})</span>
            </h3>
            <div className={cn("grid gap-1.5", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
              {behaviors.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => log(category, b)}
                  className={cn(
                    "flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-sm leading-tight transition-colors hover:brightness-95 disabled:opacity-60",
                    c.soft,
                    c.border,
                  )}
                >
                  {busy === b.id && <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />}
                  {b.label}
                </button>
              ))}
              {!behaviors.length && <p className="col-span-full text-xs text-muted-foreground">No buttons in this category.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
