"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Presentation, Plus, Search, User } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useRows } from "@/components/providers/data-provider";
import { useQuickLog } from "@/features/observations/quick-log";
import { classLabel, sortClasses } from "@/lib/hooks";
import { classHref, studentHref } from "@/lib/paths";
import { byName, cn, displayName } from "@/lib/utils";

type Item = { id: string; kind: "student" | "class" | "page" | "action"; label: string; hint?: string; keywords: string; run: () => void; log?: () => void };

const PAGES: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/classroom", "Classroom"],
  ["/students", "Students"],
  ["/attendance", "Attendance"],
  ["/behavior", "Behavior & Engagement"],
  ["/interventions", "Interventions"],
  ["/groups", "Groups & Projects"],
  ["/communication", "Communication"],
  ["/reports", "Reports & Analytics"],
  ["/tasks", "Tasks & reminders"],
  ["/settings", "Settings"],
  ["/students/import", "Import roster (CSV / Schoology)"],
  ["/classroom/sub-packet", "Substitute packet"],
  ["/settings#backup", "Backup & restore"],
];

const PaletteCtx = React.createContext<() => void>(() => {});
export const useCommandPalette = () => React.useContext(PaletteCtx);

/** Ctrl/⌘+K: jump to any student, class or page, or log for a student. */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const show = React.useCallback(() => setOpen(true), []);
  return (
    <PaletteCtx.Provider value={show}>
      {children}
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
          <D.Content aria-describedby={undefined} className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
            <D.Title className="sr-only">Search ClassPulse</D.Title>
            {open && <Palette close={() => setOpen(false)} />}
          </D.Content>
        </D.Portal>
      </D.Root>
    </PaletteCtx.Provider>
  );
}

function Palette({ close }: { close: () => void }) {
  const router = useRouter();
  const quickLog = useQuickLog();
  const students = useRows("students");
  const classes = useRows("classes");
  const enrollments = useRows("enrollments");
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const items = React.useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const c of classes.rows.filter((c) => !c.archived_at).sort(sortClasses)) {
      out.push({ id: `c-${c.id}`, kind: "class", label: classLabel(c), hint: c.room ? `Room ${c.room}` : undefined, keywords: `${c.course_name} period ${c.period} p${c.period} ${c.room ?? ""}`, run: () => go(classHref(c.id)) });
    }
    for (const s of students.rows.filter((s) => !s.archived_at).sort(byName)) {
      const classId = enrollments.rows.find((e) => e.student_id === s.id && !e.dropped_at)?.class_id;
      out.push({
        id: `s-${s.id}`,
        kind: "student",
        label: displayName(s),
        hint: [s.preferred_name && `${s.first_name} ${s.last_name}`, s.grade_level && `Grade ${s.grade_level}`].filter(Boolean).join(" · ") || undefined,
        keywords: `${s.first_name} ${s.last_name} ${s.preferred_name ?? ""} ${s.school_student_id ?? ""}`,
        run: () => go(studentHref(s.id)),
        log: classId
          ? () => {
              close();
              quickLog({ studentId: s.id, classId });
            }
          : undefined,
      });
    }
    out.push({ id: "a-log", kind: "action", label: "Quick log", hint: "L", keywords: "record observation log", run: () => { close(); quickLog(); } });
    for (const [href, label] of PAGES) out.push({ id: `p-${href}`, kind: "page", label, keywords: label, run: () => go(href) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.rows, classes.rows, enrollments.rows]);

  const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = (terms.length ? items.filter((it) => terms.every((t) => `${it.label} ${it.keywords}`.toLowerCase().includes(t))) : items.filter((it) => it.kind !== "student")).slice(0, 30);
  const sel = Math.min(active, Math.max(0, results.length - 1));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((sel + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((sel - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter" && results[sel]) {
      e.preventDefault();
      if (e.shiftKey && results[sel].log) results[sel].log!();
      else results[sel].run();
    }
  };

  const Icon = { student: User, class: Presentation, page: FileText, action: Plus };
  return (
    <div>
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[sel] ? `${listId}-${results[sel].id}` : undefined}
          aria-label="Search students, classes and pages"
          placeholder="Search students, classes, pages…"
          className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto p-1.5">
        {results.map((it, i) => {
          const I = Icon[it.kind];
          return (
            <li
              key={it.id}
              id={`${listId}-${it.id}`}
              role="option"
              aria-selected={i === sel}
              onMouseMove={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm", i === sel && "bg-secondary")}
              onClick={() => it.run()}
            >
              <I className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {it.label}
                {it.hint && <span className="ml-2 text-xs text-muted-foreground">{it.hint}</span>}
              </span>
              {it.log && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    it.log!();
                  }}
                  className="rounded-md border bg-card px-2 py-0.5 text-xs hover:bg-secondary"
                >
                  Log
                </button>
              )}
              {i === sel && <CornerDownLeft className="size-3.5 text-muted-foreground" aria-hidden />}
            </li>
          );
        })}
        {!results.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>}
      </ul>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        <kbd className="rounded border px-1">↑</kbd> <kbd className="rounded border px-1">↓</kbd> to move · <kbd className="rounded border px-1">Enter</kbd> to open · <kbd className="rounded border px-1">Shift</kbd>+<kbd className="rounded border px-1">Enter</kbd> to log for a student
      </p>
    </div>
  );
}
