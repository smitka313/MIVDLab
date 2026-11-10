import type { Observation } from "@/lib/types";

/** Fill a communication template from factual, teacher-selected records (pure; unit tested). */
export function fillTemplate(
  text: string,
  ctx: { studentFirst: string; studentName: string; teacherName: string; className: string; date: string; observations: Pick<Observation, "observed_at" | "behavior_label" | "note">[]; formatDate: (iso: string) => string },
) {
  const obsText = ctx.observations.length
    ? [...ctx.observations]
        .sort((a, b) => a.observed_at.localeCompare(b.observed_at))
        .map((o) => `- ${ctx.formatDate(o.observed_at)}: ${o.behavior_label}${o.note ? ` — ${o.note}` : ""}`)
        .join("\n")
    : "[Add specific, factual examples here]";
  const values: Record<string, string> = {
    student_first: ctx.studentFirst,
    student_name: ctx.studentName,
    teacher_name: ctx.teacherName || "[Your name]",
    class_name: ctx.className || "class",
    date: ctx.date,
    observations: obsText,
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

export const TEMPLATE_PLACEHOLDERS = ["{student_first}", "{student_name}", "{teacher_name}", "{class_name}", "{date}", "{observations}"];

/** Build a mailto: URL. Only adds a recipient when it is a plausible email address. */
export function mailtoUrl(to: string | null | undefined, subject: string, body: string) {
  const addr = to && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to.trim()) ? encodeURIComponent(to.trim()) : "";
  return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
