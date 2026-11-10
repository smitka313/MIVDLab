"use client";

import * as React from "react";
import { useData, useRows } from "@/components/providers/data-provider";
import type { Activity, ClassSection, Student } from "@/lib/types";
import { byName } from "@/lib/utils";
import { format } from "date-fns";

export function sortClasses(a: ClassSection, b: ClassSection) {
  return a.period_order - b.period_order || a.period.localeCompare(b.period, undefined, { numeric: true });
}

export function classLabel(c: Pick<ClassSection, "period" | "course_name">) {
  return `P${c.period} · ${c.course_name}`;
}

export function useActiveClasses() {
  const classes = useRows("classes");
  const rows = React.useMemo(() => classes.rows.filter((c) => !c.archived_at).sort(sortClasses), [classes.rows]);
  return { ...classes, rows, all: classes.rows };
}

export function useStudentMap() {
  const students = useRows("students");
  return React.useMemo(() => new Map(students.rows.map((s) => [s.id, s])), [students.rows]);
}

export function useClassMap() {
  const classes = useRows("classes");
  return React.useMemo(() => new Map(classes.rows.map((c) => [c.id, c])), [classes.rows]);
}

/** Active (not dropped, not archived) students in a class, sorted by name. */
export function useRoster(classId: string | null | undefined): Student[] {
  const students = useRows("students");
  const enrollments = useRows("enrollments");
  return React.useMemo(() => {
    if (!classId) return [];
    const ids = new Set(enrollments.rows.filter((e) => e.class_id === classId && !e.dropped_at).map((e) => e.student_id));
    return students.rows.filter((s) => ids.has(s.id) && !s.archived_at).sort(byName);
  }, [classId, students.rows, enrollments.rows]);
}

function minutes(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** The class meeting right now (by schedule), if any. */
export function classInSession(classes: ClassSection[], now = new Date()): ClassSection | undefined {
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  const m = now.getHours() * 60 + now.getMinutes();
  return classes.find((c) => {
    const s = minutes(c.start_time);
    const e = minutes(c.end_time);
    return s != null && e != null && c.meeting_days.includes(day) && m >= s - 5 && m <= e;
  });
}

// When the teacher last picked a period by hand (per device).
const PICKED_KEY = "classpulse.periodPickedAt";
const MANUAL_HOLD_MS = 15 * 60_000;

function pickedAt(): number {
  try {
    return Number(window.localStorage.getItem(PICKED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Re-render every `ms` so time-based choices (the class in session) stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Start of a class's period today, as epoch ms (or null if it has no start time). */
function periodStart(c: ClassSection, now: Date) {
  const m = minutes(c.start_time);
  if (m == null) return null;
  const d = new Date(now);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime() - 5 * 60_000;
}

/**
 * Selected class period. Follows the bell schedule: while a class is in
 * session it becomes current automatically, unless the teacher picked a
 * different period by hand within the last 15 minutes (or since this period
 * began). Falls back to the saved choice, then the first class.
 */
export function useCurrentClass() {
  const { prefs, updatePrefs } = useData();
  const { rows } = useActiveClasses();
  const now = useNow();
  const saved = rows.find((c) => c.id === prefs.current_class_id) ?? null;
  const inSession = classInSession(rows, now) ?? null;
  let current = saved ?? inSession ?? rows[0] ?? null;
  let following = false;
  if (inSession && inSession.id !== saved?.id) {
    const picked = pickedAt();
    const start = periodStart(inSession, now) ?? 0;
    const manualHold = picked > start && now.getTime() - picked < MANUAL_HOLD_MS;
    if (!manualHold) {
      current = inSession;
      following = true;
    }
  } else if (inSession && inSession.id === saved?.id) {
    following = true;
  }
  const setCurrent = React.useCallback(
    (id: string) => {
      try {
        window.localStorage.setItem(PICKED_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      void updatePrefs({ current_class_id: id }).catch(() => undefined);
    },
    [updatePrefs],
  );
  return { current, setCurrent, classes: rows, inSession, following };
}

// Current instructional activity: a per-device convenience that tags quick-logged observations.
const ACTIVITY_KEY = "classpulse.currentActivity";
const activityListeners = new Set<() => void>();
function readActivity(): Activity | null {
  try {
    return (window.localStorage.getItem(ACTIVITY_KEY) as Activity | null) || null;
  } catch {
    return null;
  }
}
export function useCurrentActivity() {
  const value = React.useSyncExternalStore(
    (cb) => {
      activityListeners.add(cb);
      return () => activityListeners.delete(cb);
    },
    readActivity,
    () => null,
  );
  const set = React.useCallback((a: Activity | null) => {
    try {
      if (a) window.localStorage.setItem(ACTIVITY_KEY, a);
      else window.localStorage.removeItem(ACTIVITY_KEY);
    } catch {
      /* storage unavailable: ignore */
    }
    activityListeners.forEach((l) => l());
  }, []);
  return [value, set] as const;
}

/** Date/time formatting that honours the teacher's preferences. */
export function useFormat() {
  const { prefs } = useData();
  return React.useMemo(() => {
    const timeFmt = prefs.time_format === "24h" ? "HH:mm" : "h:mm a";
    const toDate = (v: string) => (v.length === 10 ? parseLocal(v) : new Date(v));
    return {
      date: (v: string | null | undefined) => (v ? format(toDate(v), prefs.date_format) : "—"),
      time: (v: string | null | undefined) => (v ? format(toDate(v), timeFmt) : "—"),
      dateTime: (v: string | null | undefined) => (v ? format(toDate(v), `${prefs.date_format} ${timeFmt}`) : "—"),
      short: (v: string | null | undefined) => (v ? format(toDate(v), "MMM d") : "—"),
      weekday: (v: string | null | undefined) => (v ? format(toDate(v), "EEE, MMM d") : "—"),
    };
  }, [prefs.date_format, prefs.time_format]);
}

function parseLocal(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
