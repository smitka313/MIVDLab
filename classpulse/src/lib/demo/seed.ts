import type { Activity, Row, TableName } from "@/lib/types";
import { TABLE_ORDER } from "@/lib/types";
import { defaultConfigRows } from "@/lib/defaults";
import { addDays, parseISODate, seededRandom, shuffle, toISODate, uuid } from "@/lib/utils";

/**
 * Generates a FICTIONAL demonstration classroom. Every name is invented and
 * every record is marked/derived from `is_demo` students. Never use for real data.
 */

const FIRST = [
  "Avery", "Jordan", "Mateo", "Priya", "Elijah", "Sofia", "Malik", "Hana", "Lucas", "Imani", "Noah", "Valeria",
  "Ethan", "Aaliyah", "Diego", "Mei", "Caleb", "Zara", "Owen", "Leila", "Isaac", "Nadia", "Gabriel", "Chloe",
  "Julian", "Amara", "Xavier", "Riya", "Miles", "Camila", "Theo", "Fatima", "Adrian", "Grace", "Rowan", "Yusuf",
  "Elena", "Marcus", "Lina", "Dominic", "Skye", "Andre", "Maya", "Kai", "Bianca", "Tobias", "Simone", "Felix",
  "Naomi", "Hugo", "Keira", "Darius", "Ivy", "Emmett", "Luz", "Reid", "Tessa", "Omar", "Paige", "Jonah",
];
const LAST = [
  "Alvarez", "Brooks", "Chen", "Delgado", "Ellison", "Farouk", "Garcia", "Hollis", "Iverson", "Jensen", "Kowalski",
  "Lindqvist", "Morales", "Nakamura", "Okafor", "Petrova", "Quinlan", "Ramirez", "Sato", "Thornton", "Umeh",
  "Vasquez", "Whitfield", "Xu", "Yilmaz", "Zielinski", "Abernathy", "Bishop", "Castillo", "Dunmore", "Espinoza",
  "Fairbanks", "Grayson", "Haddad", "Ingram", "Juarez", "Kim", "Lacroix", "Mbeki", "Novak", "Ortega", "Patel",
  "Reyes", "Sullivan", "Tran", "Underwood", "Varga", "Wolfe", "Yamamoto", "Zamora",
];
const NICKNAMES: Record<string, string> = { Elijah: "Eli", Gabriel: "Gabe", Dominic: "Dom", Valeria: "Val", Tobias: "Toby" };

const CLASSES = [
  { course: "Biology", period: "1", room: "214", start: "07:45", end: "08:40", color: "teal", grade: 9, arrangement: "rows" as const },
  { course: "Biology", period: "2", room: "214", start: "08:46", end: "09:41", color: "emerald", grade: 9, arrangement: "pods" as const },
  { course: "Intro to Engineering Design", period: "3", room: "118 (Lab)", start: "09:47", end: "10:42", color: "indigo", grade: 10, arrangement: "tables" as const },
  { course: "STEM Research Lab", period: "4", room: "118 (Lab)", start: "11:20", end: "12:15", color: "violet", grade: 11, arrangement: "lab" as const },
  { course: "Principles of Engineering", period: "5", room: "118 (Lab)", start: "12:21", end: "13:16", color: "blue", grade: 11, arrangement: "tables" as const },
  { course: "AP Biology", period: "6", room: "214", start: "13:22", end: "14:17", color: "amber", grade: 12, arrangement: "rows" as const },
];

type AnyRow = Record<string, unknown> & { id: string };
export type SeedData = Record<TableName, AnyRow[]>;

/** School days (Mon–Fri) strictly before `today`, most recent last. */
export function previousSchoolDays(today: string, count: number): string[] {
  const out: string[] = [];
  let d = today;
  while (out.length < count) {
    d = addDays(d, -1);
    const wd = parseISODate(d).getDay();
    if (wd !== 0 && wd !== 6) out.unshift(d);
  }
  return out;
}

function at(date: string, hhmm: string, plusMin: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = parseISODate(date);
  d.setHours(h, m + plusMin, 0, 0);
  return d.toISOString();
}

export function generateDemoData(opts: { teacherId: string; today?: Date; seed?: number; schoolDays?: number }): SeedData {
  const rand = seededRandom(opts.seed ?? 20261110);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const chance = (p: number) => rand() < p;
  const today = toISODate(opts.today ?? new Date());
  const nowIso = (opts.today ?? new Date()).toISOString();
  const T = opts.teacherId;
  const data = Object.fromEntries([...TABLE_ORDER, "audit_logs"].map((t) => [t, [] as AnyRow[]])) as SeedData;
  const add = (table: TableName, row: Record<string, unknown>) => {
    const r = { id: uuid(), teacher_id: T, created_at: nowIso, updated_at: nowIso, ...row } as AnyRow;
    data[table].push(r);
    return r;
  };

  // --- configuration -------------------------------------------------------
  const cfg = defaultConfigRows();
  cfg.categories.forEach((r) => add("observation_categories", r));
  cfg.behaviors.forEach((r) => add("observation_behaviors", r));
  cfg.statuses.forEach((r) => add("attendance_statuses", r));
  cfg.strategies.forEach((r) => add("intervention_strategies", r));
  cfg.roles.forEach((r) => add("team_roles", r));
  cfg.templates.forEach((r) => add("communication_templates", r));
  const catByKind = Object.fromEntries(cfg.categories.map((c) => [c.kind, c]));
  const behaviorsByCat = (catId: string) => cfg.behaviors.filter((b) => b.category_id === catId);
  const status = Object.fromEntries(cfg.statuses.map((s) => [s.counts_as, s]));

  // --- calendar --------------------------------------------------------------
  const year = parseISODate(today).getMonth() >= 6 ? parseISODate(today).getFullYear() : parseISODate(today).getFullYear() - 1;
  const ay = add("academic_years", { name: `${year}–${year + 1}`, start_date: `${year}-08-25`, end_date: `${year + 1}-06-11`, is_current: true });
  const fall = add("terms", { academic_year_id: ay.id, name: "Semester 1", start_date: `${year}-08-25`, end_date: `${year + 1}-01-23` });
  add("terms", { academic_year_id: ay.id, name: "Semester 2", start_date: `${year + 1}-01-26`, end_date: `${year + 1}-06-11` });

  // --- students ----------------------------------------------------------------
  const usedNames = new Set<string>();
  const makeStudent = (grade: number) => {
    let first: string, last: string;
    do {
      first = pick(FIRST);
      last = pick(LAST);
    } while (usedNames.has(first + last));
    usedNames.add(first + last);
    return add("students", {
      school_id: null,
      first_name: first,
      last_name: last,
      preferred_name: NICKNAMES[first] && chance(0.6) ? NICKNAMES[first] : null,
      grade_level: grade,
      school_student_id: `DEMO-${String(100000 + data.students.length * 37).slice(-6)}`,
      photo_path: null,
      is_demo: true,
      archived_at: null,
    });
  };

  const classes: AnyRow[] = [];
  const rosters = new Map<string, AnyRow[]>();
  for (const [i, c] of CLASSES.entries()) {
    const cls = add("classes", {
      school_id: null,
      academic_year_id: ay.id,
      term_id: fall.id,
      course_name: c.course,
      period: c.period,
      period_order: i + 1,
      room: c.room,
      meeting_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      start_time: c.start,
      end_time: c.end,
      color: c.color,
      description: c.course === "Biology" ? "Introductory biology: cells, genetics, evolution and ecology." : null,
      default_layout_id: null,
      archived_at: null,
    });
    classes.push(cls);
    const size = 22 + Math.floor(rand() * 7); // 22–28
    const roster: AnyRow[] = [];
    for (let k = 0; k < size; k++) {
      const g = Math.min(12, Math.max(9, c.grade + (chance(0.2) ? 1 : 0)));
      roster.push(makeStudent(g));
    }
    rosters.set(cls.id, roster);
  }
  // A few students take two of this teacher's classes (e.g. Engineering + STEM Lab).
  const p3 = rosters.get(classes[2].id)!;
  const p4 = rosters.get(classes[3].id)!;
  for (const s of p3.slice(0, 3)) p4.push(s);

  for (const cls of classes) {
    for (const s of rosters.get(cls.id)!) {
      add("enrollments", { class_id: cls.id, student_id: s.id, enrolled_at: `${year}-08-25`, dropped_at: null });
    }
  }

  // --- seating layouts -------------------------------------------------------
  const seatStudents = (layoutId: string, positions: { x: number; y: number; label?: string }[], roster: AnyRow[]) => {
    const order = shuffle(roster, rand);
    positions.forEach((p, idx) =>
      add("seats", { layout_id: layoutId, kind: "seat", x: p.x, y: p.y, w: 1, h: 1, label: p.label ?? null, student_id: order[idx]?.id ?? null }),
    );
  };
  const fixture = (layoutId: string, kind: string, x: number, y: number, w: number, h: number, label: string | null = null) =>
    add("seats", { layout_id: layoutId, kind, x, y, w, h, label, student_id: null });

  for (const [i, cls] of classes.entries()) {
    const roster = rosters.get(cls.id)!;
    const arrangement = CLASSES[i].arrangement;
    const layout = add("seating_layouts", { class_id: cls.id, name: { rows: "Rows", pods: "Pods", tables: "Design tables", lab: "Lab stations", custom: "Custom" }[arrangement], arrangement, cols: 12, rows: 10 });
    cls.default_layout_id = layout.id;
    fixture(layout.id, "board", 3, 0, 6, 1, "Whiteboard");
    fixture(layout.id, "teacher_desk", 10, 1, 2, 1, "Teacher");
    fixture(layout.id, "door", 0, 9, 1, 1, "Door");
    const pos: { x: number; y: number }[] = [];
    if (arrangement === "rows") {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) pos.push({ x: 1 + c + (c >= 3 ? 1 : 0), y: 3 + r });
    } else if (arrangement === "pods") {
      for (const [px, py] of [[1, 3], [4, 3], [7, 3], [1, 6], [4, 6], [7, 6], [10, 6]]) {
        pos.push({ x: px, y: py }, { x: px + 1, y: py }, { x: px, y: py + 1 }, { x: px + 1, y: py + 1 });
      }
    } else {
      // tables / lab benches with 4 students each
      for (const [px, py] of [[1, 3], [5, 3], [9, 3], [1, 6], [5, 6], [9, 6], [3, 8]]) {
        fixture(layout.id, arrangement === "lab" ? "lab_bench" : "table", px, py + 1, 2, 1, null);
        pos.push({ x: px, y: py }, { x: px + 1, y: py }, { x: px - 1 < 0 ? px + 2 : px - 1, y: py + 1 }, { x: px + 2, y: py + 1 });
      }
    }
    // de-duplicate positions that collide with fixtures
    const occupied = new Set(data.seats.filter((s) => s.layout_id === layout.id).flatMap((s) => {
      const cells: string[] = [];
      for (let dx = 0; dx < (s.w as number); dx++) for (let dy = 0; dy < (s.h as number); dy++) cells.push(`${(s.x as number) + dx},${(s.y as number) + dy}`);
      return cells;
    }));
    const free = pos.filter((p) => !occupied.has(`${p.x},${p.y}`) && p.x < 12 && p.y < 10).filter((p, idx, arr) => arr.findIndex((q) => q.x === p.x && q.y === p.y) === idx);
    seatStudents(layout.id, free.slice(0, Math.max(roster.length, Math.min(free.length, roster.length + 2))), roster);
    if (i === 0) {
      // A second layout for lab days.
      const lab = add("seating_layouts", { class_id: cls.id, name: "Lab day", arrangement: "lab", cols: 12, rows: 10 });
      fixture(lab.id, "board", 3, 0, 6, 1, "Whiteboard");
      fixture(lab.id, "door", 0, 9, 1, 1, "Door");
      const lpos: { x: number; y: number }[] = [];
      for (const [px, py] of [[1, 2], [5, 2], [9, 2], [1, 5], [5, 5], [9, 5], [1, 8], [5, 8]]) {
        fixture(lab.id, "lab_bench", px, py, 2, 1, `Station ${lpos.length / 4 + 1}`);
        lpos.push({ x: px - 1 < 0 ? 0 : px - 1, y: py + 1 }, { x: px, y: py + 1 }, { x: px + 1, y: py + 1 }, { x: px + 2, y: py + 1 });
      }
      seatStudents(lab.id, lpos.filter((p, idx, arr) => p.y < 10 && arr.findIndex((q) => q.x === p.x && q.y === p.y) === idx).slice(0, roster.length), roster);
    }
  }

  // --- daily records -----------------------------------------------------------
  const days = previousSchoolDays(today, opts.schoolDays ?? 20);
  const activities: Activity[] = ["direct_instruction", "independent_work", "group_work", "lab_activity", "assessment", "transition"];
  // Students who will need extra support (drives redirections + interventions).
  const focus = new Set<string>();
  for (const cls of classes) for (const s of shuffle(rosters.get(cls.id)!, rand).slice(0, 2)) focus.add(s.id);

  for (const [ci, cls] of classes.entries()) {
    const roster = rosters.get(cls.id)!;
    for (const day of days) {
      for (const s of roster) {
        const r = rand();
        const st = focus.has(s.id)
          ? r < 0.8 ? status.present : r < 0.88 ? status.tardy : r < 0.96 ? status.absent : status.excused
          : r < 0.93 ? status.present : r < 0.96 ? status.tardy : r < 0.985 ? status.absent : status.excused;
        add("attendance_records", { class_id: cls.id, student_id: s.id, date: day, status_id: st.id, note: null });
      }
      const n = 3 + Math.floor(rand() * 6);
      const activity = pick(activities);
      for (let k = 0; k < n; k++) {
        const s = chance(0.35) ? pick(roster.filter((x) => focus.has(x.id))) ?? pick(roster) : pick(roster);
        const kr = rand();
        const kind = focus.has(s.id)
          ? kr < 0.35 ? "positive" : kr < 0.75 ? "redirection" : "engagement"
          : kr < 0.5 ? "positive" : kr < 0.65 ? "redirection" : "engagement";
        const cat = catByKind[kind];
        const beh = pick(behaviorsByCat(cat.id!));
        add("observations", {
          student_id: s.id,
          class_id: cls.id,
          observed_at: at(day, CLASSES[ci].start, 5 + Math.floor(rand() * 45)),
          category_id: cat.id,
          behavior_id: beh.id,
          kind,
          category_name: cat.name,
          behavior_label: beh.label,
          context: null,
          note: kind === "redirection" && chance(0.3) ? "Responded well to a quiet reminder." : null,
          activity: chance(0.85) ? activity : null,
          intervention_used: kind === "redirection" && chance(0.4) ? pick(["Proximity", "Private redirection", "Clear written instructions"]) : null,
          follow_up_required: kind === "redirection" && chance(0.08),
          group_id: null,
        });
      }
    }
  }

  // --- private notes -----------------------------------------------------------
  const noteTexts = [
    "Mentioned they're working a part-time job most evenings; check in about homework load.",
    "Prefers written feedback over verbal feedback in front of peers.",
    "Excited about the robotics club — good hook for engagement.",
    "Asked for extra practice problems before the unit test.",
  ];
  for (const [i, s] of [...focus].slice(0, 4).entries()) {
    const cls = classes.find((c) => rosters.get(c.id)!.some((x) => x.id === s))!;
    add("student_notes", { student_id: s, class_id: cls.id, body: noteTexts[i], created_at: at(days[days.length - 3 - i], "15:00", 0) });
  }

  // --- interventions -------------------------------------------------------------
  const strategies = cfg.strategies;
  const statuses = ["active", "active", "active", "under_review", "planned", "completed", "active", "discontinued"] as const;
  const targets = [
    "Stays on task during independent work",
    "Phone stays put away during instruction",
    "Arrives prepared with materials",
    "Uses respectful language with peers",
    "Follows multi-step lab directions",
    "Participates in group discussions",
    "Begins warm-up within 3 minutes of the bell",
    "Asks for help when stuck",
  ];
  for (const [i, sid] of [...focus].slice(0, 8).entries()) {
    const cls = classes.find((c) => rosters.get(c.id)!.some((x) => x.id === sid))!;
    const strat = strategies[(i * 3) % strategies.length];
    const start = days[Math.max(0, days.length - 15 + i)];
    const plan = add("intervention_plans", {
      student_id: sid,
      class_id: cls.id,
      target_behavior: targets[i],
      goal: "Reduce redirections in this area to no more than one per class over two weeks.",
      baseline: "Before the plan: redirections in this area during most class periods (see observation history).",
      strategy_id: strat.id,
      strategy_name: strat.name,
      start_date: start,
      review_date: addDays(today, i % 3 === 0 ? -1 : 3 + i),
      status: statuses[i],
      notes: i === 0 ? "Discussed the plan with the student; they chose the seat themselves." : null,
    });
    if (statuses[i] !== "planned") {
      add("intervention_progress", { plan_id: plan.id, entry_date: addDays(start, 5), assessment: "too_early", note: "First week — student aware of the goal." });
      add("intervention_progress", {
        plan_id: plan.id,
        entry_date: addDays(start, 10),
        assessment: statuses[i] === "discontinued" ? "discontinue" : statuses[i] === "under_review" ? "needs_modification" : "helpful",
        note: statuses[i] === "discontinued" ? "Strategy not a good fit; trying a different approach." : "Fewer redirections this week.",
      });
    }
    if (statuses[i] === "active" || statuses[i] === "under_review") {
      add("reminders", { title: `Review intervention: ${targets[i]}`, description: null, kind: "intervention_review", student_id: sid, class_id: cls.id, due_date: plan.review_date, priority: "normal", completed_at: null });
    }
  }

  // --- groups & projects -----------------------------------------------------------
  const roles = cfg.roles;
  for (const cls of [classes[2], classes[3]]) {
    const set = add("group_sets", { class_id: cls.id, name: cls === classes[2] ? "Bridge challenge teams" : "Lab stations — Unit 3", archived_at: null });
    const roster = shuffle(rosters.get(cls.id)!, rand);
    const groupCount = Math.ceil(roster.length / 4);
    const groups = Array.from({ length: groupCount }, (_, g) =>
      add("groups", { group_set_id: set.id, name: `Team ${g + 1}`, station: cls === classes[3] ? `Station ${g + 1}` : null, sort_order: g }),
    );
    roster.forEach((s, idx) => {
      const g = groups[idx % groupCount];
      const slot = Math.floor(idx / groupCount);
      add("group_memberships", { group_id: g.id, student_id: s.id, role_id: roles[slot]?.id ?? null });
    });
    for (const g of groups.slice(0, 4)) {
      add("group_observations", { group_id: g.id, observed_at: at(days[days.length - 2], "10:00", 10), dimension: pick(["collaboration", "problem_solving", "communication", "challenge"]), note: "Divided tasks clearly and checked each other's measurements." });
    }
    if (cls === classes[2]) {
      const proj = add("projects", { class_id: cls.id, group_set_id: set.id, name: "Bridge Design Challenge", description: "Design, build and test a truss bridge from balsa wood that holds the maximum load per gram.", start_date: days[days.length - 10], due_date: addDays(today, 12), status: "active" });
      const ms = [
        ["Research truss types", -6, "done"],
        ["Sketch & calculations approved", -1, "done"],
        ["Prototype built", 5, "in_progress"],
        ["Load test & report", 12, "not_started"],
      ] as const;
      for (const [title, off, st] of ms) add("project_tasks", { project_id: proj.id, group_id: null, title, is_milestone: true, due_date: addDays(today, off), status: st });
      add("project_tasks", { project_id: proj.id, group_id: groups[0].id, title: "Re-cut top chord members", is_milestone: false, due_date: addDays(today, 2), status: "in_progress" });
    }
  }

  // --- communication -------------------------------------------------------------------
  const contactTypes = ["email", "phone", "in_person", "virtual", "student_conversation"] as const;
  for (const [i, sid] of [...focus].entries()) {
    if (i >= 12) break;
    const purpose = i % 3 === 0 ? "positive" : i % 3 === 1 ? "concern" : "attendance";
    const ct = contactTypes[i % contactTypes.length];
    const fu = purpose === "concern" && i % 2 === 1;
    add("communications", {
      student_id: sid,
      contact_type: ct,
      occurred_at: at(days[days.length - 1 - (i % 10)], "15:10", 0),
      recipient: ct === "student_conversation" ? "Student" : "Parent/guardian",
      purpose,
      subject: null,
      summary:
        purpose === "positive"
          ? "Shared recent leadership during group work. Parent appreciated the update."
          : purpose === "concern"
            ? "Discussed repeated off-task behavior during independent work. Agreed to check in again next week."
            : "Shared classroom attendance notes (not the official record). Parent will follow up with the office.",
      follow_up_required: fu,
      follow_up_date: fu ? addDays(today, i % 4 === 0 ? -2 : 4) : null,
      status: fu ? "follow_up_pending" : "completed",
    });
    if (fu) {
      add("reminders", { title: "Follow up with parent/guardian", description: "Check in on progress since last call.", kind: "parent_contact", student_id: sid, class_id: null, due_date: addDays(today, i % 4 === 0 ? -2 : 4), priority: "high", completed_at: null });
    }
  }

  add("reminders", { title: "Finish observation notes from lab day", description: null, kind: "documentation", student_id: null, class_id: classes[3].id, due_date: addDays(today, -1), priority: "normal", completed_at: null });
  add("reminders", { title: "Print seating charts for substitute", description: "Sub on Friday — print all period layouts.", kind: "general", student_id: null, class_id: null, due_date: addDays(today, 2), priority: "low", completed_at: null });
  add("reminders", { title: "Prepare bridge-test rubric", description: null, kind: "general", student_id: null, class_id: classes[2].id, due_date: addDays(today, 6), priority: "normal", completed_at: null });

  return data;
}
