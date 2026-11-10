import type { AttendanceCountsAs, AttendanceRecord, AttendanceStatus, Observation } from "@/lib/types";
import { addDays, isoDateOf, parseISODate, toISODate } from "@/lib/utils";

/** Aggregations used by profiles, dashboard and reports (pure; unit tested). */

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  tardy: number;
  excused: number;
  /** Share of recorded days the student attended (present or tardy). null when nothing recorded. */
  rate: number | null;
}

export function summarizeAttendance(records: AttendanceRecord[], statuses: Map<string, AttendanceStatus>): AttendanceSummary {
  const s: AttendanceSummary = { total: 0, present: 0, absent: 0, tardy: 0, excused: 0, rate: null };
  for (const r of records) {
    const st = statuses.get(r.status_id);
    if (!st) continue;
    s.total++;
    s[st.counts_as as AttendanceCountsAs]++;
  }
  s.rate = s.total ? (s.present + s.tardy) / s.total : null;
  return s;
}

export function countKinds(obs: Pick<Observation, "kind">[]) {
  const c = { positive: 0, redirection: 0, engagement: 0 };
  for (const o of obs) c[o.kind]++;
  return c;
}

export function inRange(dateISO: string, from?: string, to?: string) {
  return (!from || dateISO >= from) && (!to || dateISO <= to);
}

export function observationsInRange<T extends Pick<Observation, "observed_at">>(obs: T[], from?: string, to?: string) {
  return obs.filter((o) => inRange(isoDateOf(o.observed_at), from, to));
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string) {
  const d = parseISODate(iso);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toISODate(d);
}

/**
 * Bucket observations by week (or day) between from and to, including empty
 * buckets so gaps in documentation are visible rather than hidden.
 */
export function bucketObservations(obs: Pick<Observation, "observed_at" | "kind">[], from: string, to: string, unit: "day" | "week" = "week") {
  const keyOf = (iso: string) => (unit === "week" ? weekStart(iso) : iso);
  const buckets = new Map<string, { key: string; positive: number; redirection: number; engagement: number }>();
  for (let d = keyOf(from); d <= to; d = addDays(d, unit === "week" ? 7 : 1)) buckets.set(d, { key: d, positive: 0, redirection: 0, engagement: 0 });
  for (const o of obs) {
    const day = isoDateOf(o.observed_at);
    if (day < from || day > to) continue;
    const b = buckets.get(keyOf(day));
    if (b) b[o.kind]++;
  }
  return [...buckets.values()];
}

export function percent(n: number | null, digits = 0) {
  return n == null ? "—" : `${(n * 100).toFixed(digits)}%`;
}

/** Days in [from,to] (Mon–Fri) on which a class had no attendance recorded — shows missing data. */
export function schoolDaysWithoutAttendance(records: Pick<AttendanceRecord, "date">[], from: string, to: string) {
  const recorded = new Set(records.map((r) => r.date));
  const missing: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = parseISODate(d).getDay();
    if (wd !== 0 && wd !== 6 && !recorded.has(d)) missing.push(d);
  }
  return missing;
}
