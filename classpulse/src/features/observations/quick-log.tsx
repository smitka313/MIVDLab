"use client";

import * as React from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrentClass, useRoster, classLabel } from "@/lib/hooks";
import { cn, displayName, initials } from "@/lib/utils";
import { StudentActionPanel } from "@/features/classroom/student-actions";

interface Opts {
  classId?: string;
  studentId?: string;
  tab?: string;
}
const QuickLogCtx = React.createContext<(o?: Opts) => void>(() => {});
export const useQuickLog = () => React.useContext(QuickLogCtx);

/** Global "Quick Log" — pick a student, then one click records an observation. Shortcut: L */
export function QuickLogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [opts, setOpts] = React.useState<Opts>({});
  const openLog = React.useCallback((o: Opts = {}) => {
    setOpts(o);
    setOpen(true);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() === "l" && !e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        openLog();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openLog]);

  return (
    <QuickLogCtx.Provider value={openLog}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Quick log" description="Choose a student, then tap an observation." className="max-w-xl">
          {open && <QuickLogBody initial={opts} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </QuickLogCtx.Provider>
  );
}

function QuickLogBody({ initial, onDone }: { initial: Opts; onDone: () => void }) {
  const { current, classes } = useCurrentClass();
  const [classId, setClassId] = React.useState(initial.classId ?? current?.id ?? "");
  const [studentId, setStudentId] = React.useState(initial.studentId ?? "");
  const [q, setQ] = React.useState("");
  const roster = useRoster(classId);
  const student = roster.find((s) => s.id === studentId);
  const filtered = roster.filter((s) => `${s.first_name} ${s.last_name} ${s.preferred_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  if (!classes.length) return <p className="text-sm text-muted-foreground">Create a class first (Classroom → New class).</p>;

  if (student) {
    return (
      <div className="grid gap-3">
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setStudentId("")}>
          <ArrowLeft /> Choose another student
        </Button>
        <StudentActionPanel student={student} classId={classId} onDone={onDone} defaultTab={initial.tab} />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <Select aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {classLabel(c)}
            </option>
          ))}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            aria-label="Search students"
            placeholder="Search students"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length === 1) setStudentId(filtered[0].id);
            }}
          />
        </div>
      </div>
      <ul className="grid max-h-[50vh] grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3" aria-label="Students">
        {filtered.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setStudentId(s.id)}
              className={cn("flex w-full items-center gap-2 rounded-lg border bg-card px-2 py-2 text-left text-sm hover:bg-secondary")}
            >
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">
                {initials(s)}
              </span>
              <span className="truncate">{displayName(s)}</span>
            </button>
          </li>
        ))}
        {!filtered.length && <li className="col-span-full py-6 text-center text-sm text-muted-foreground">No matching students in this class.</li>}
      </ul>
    </div>
  );
}
