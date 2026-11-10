"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, Plus, Printer, Shuffle, Trash2, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm";
import { NamedListEditor } from "@/features/settings/list-editor";
import { ProjectsPanel } from "@/features/groups/projects";
import { assignRoles, makeRandomGroups } from "@/features/groups/group-logic";
import { classLabel, useCurrentClass, useFormat, useRoster } from "@/lib/hooks";
import { DIMENSION_LABELS } from "@/lib/labels";
import type { ClassSection, GroupDimension, GroupSet, Student } from "@/lib/types";
import { displayName, toISODate } from "@/lib/utils";
import type { Store } from "@/lib/data/store";

export default function GroupsPage() {
  const status = useTables("classes", "students", "enrollments", "group_sets", "groups", "group_memberships", "group_observations", "team_roles", "projects", "project_tasks");
  const { current, setCurrent, classes } = useCurrentClass();

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;
  if (!current)
    return (
      <>
        <PageHeader title="Groups & Projects" />
        <EmptyState icon={UsersRound} title="No classes yet" action={<Button asChild><Link href="/classroom">Create a class</Link></Button>} />
      </>
    );

  return (
    <>
      <PageHeader title="Groups & Projects" description="Build teams, assign roles and lab stations, and track collaborative projects." />
      <div className="no-print mb-4">
        <Select aria-label="Class" value={current.id} onChange={(e) => setCurrent(e.target.value)} className="w-auto">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {classLabel(c)}
            </option>
          ))}
        </Select>
      </div>
      <Tabs defaultValue="groups">
        <TabsList className="no-print">
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="roles">Team roles</TabsTrigger>
        </TabsList>
        <TabsContent value="groups">
          <GroupsPanel cls={current} />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsPanel cls={current} />
        </TabsContent>
        <TabsContent value="roles">
          <p className="mb-3 text-sm text-muted-foreground">Roles you can assign to group members. Switch a role off to stop offering it.</p>
          <NamedListEditor table="team_roles" noun="role" nameMax={40} />
        </TabsContent>
      </Tabs>
    </>
  );
}

async function createSet(store: Store, classId: string, name: string, groups: { name: string; station: string | null; members: { student_id: string; role_id: string | null }[] }[]) {
  const set = await store.insertOne("group_sets", { class_id: classId, name, archived_at: null });
  const created = await store.insert("groups", groups.map((g, i) => ({ group_set_id: set.id, name: g.name, station: g.station, sort_order: i })));
  const members = created.flatMap((g, i) => groups[i].members.map((m) => ({ group_id: g.id, student_id: m.student_id, role_id: m.role_id })));
  if (members.length) await store.insert("group_memberships", members);
  return set;
}

function GroupsPanel({ cls }: { cls: ClassSection }) {
  const sets = useRows("group_sets");
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const groups = useRows("groups");
  const memberships = useRows("group_memberships");
  const classSets = sets.rows.filter((s) => s.class_id === cls.id && !s.archived_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [setId, setSetId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const active = classSets.find((s) => s.id === setId) ?? classSets[0];

  const duplicate = async (s: GroupSet) => {
    const gs = groups.rows.filter((g) => g.group_set_id === s.id).sort((a, b) => a.sort_order - b.sort_order);
    const copy = await run(
      () =>
        createSet(
          store,
          cls.id,
          `${s.name} (copy)`.slice(0, 80),
          gs.map((g) => ({ name: g.name, station: g.station, members: memberships.rows.filter((m) => m.group_id === g.id).map((m) => ({ student_id: m.student_id, role_id: m.role_id })) })),
        ),
      { success: "Configuration duplicated" },
    );
    if (copy) setSetId(copy.id);
  };

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        {classSets.length > 0 && (
          <Select aria-label="Saved group configuration" value={active?.id} onChange={(e) => setSetId(e.target.value)} className="w-auto">
            {classSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        <Button onClick={() => setCreating(true)}>
          <Plus /> New groups
        </Button>
        {active && (
          <>
            <Button variant="outline" onClick={() => duplicate(active)}>
              <Copy /> Duplicate
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            <Button
              variant="ghost"
              aria-label="Delete configuration"
              onClick={async () => {
                if (await confirm({ title: `Delete “${active.name}”?`, description: "The groups, roles and group observations in this configuration will be deleted. Individual student observations are kept.", confirmLabel: "Delete", destructive: true }))
                  await run(() => store.remove("group_sets", [active.id]), { success: "Configuration deleted" });
              }}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
      {active ? <GroupBoard cls={cls} set={active} /> : <EmptyState icon={UsersRound} title="No groups yet" description="Create groups manually or generate random, balanced groups." action={<Button onClick={() => setCreating(true)}>New groups</Button>} />}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New groups">
          {creating && (
            <NewGroupsForm
              cls={cls}
              onCreate={async (name, gs) => {
                const s = await run(() => createSet(store, cls.id, name, gs), { success: "Groups created" });
                if (s) {
                  setSetId(s.id);
                  setCreating(false);
                }
              }}
              onCancel={() => setCreating(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewGroupsForm({ cls, onCreate, onCancel }: { cls: ClassSection; onCreate: (name: string, groups: { name: string; station: string | null; members: { student_id: string; role_id: string | null }[] }[]) => Promise<void>; onCancel: () => void }) {
  const roster = useRoster(cls.id);
  const roles = useRows("team_roles");
  const records = useRows("attendance_records");
  const statuses = useRows("attendance_statuses");
  const [name, setName] = React.useState("");
  const [method, setMethod] = React.useState<"random" | "manual">("random");
  const [mode, setMode] = React.useState<"size" | "count">("size");
  const [n, setN] = React.useState(4);
  const [withRoles, setWithRoles] = React.useState(true);
  const [stations, setStations] = React.useState(false);
  const [skipAbsent, setSkipAbsent] = React.useState(false);
  const today = toISODate();
  const absentIds = new Set(records.rows.filter((r) => r.class_id === cls.id && r.date === today && ["absent", "excused"].includes(statuses.rows.find((s) => s.id === r.status_id)?.counts_as ?? "")).map((r) => r.student_id));
  const pool = roster.filter((s) => !skipAbsent || !absentIds.has(s.id));
  const groupCount = method === "manual" ? n : mode === "size" ? Math.ceil(pool.length / Math.max(1, n)) : Math.min(n, pool.length);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeRoles = roles.rows.filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order).map((r) => r.id);
    const split = method === "manual" ? Array.from({ length: n }, () => [] as string[]) : makeRandomGroups(pool.map((s) => s.id), mode, n);
    const roleMap = withRoles ? assignRoles(split, activeRoles) : new Map<string, string | null>();
    await onCreate(
      name.trim() || `Groups — ${new Date().toLocaleDateString()}`,
      split.map((ids, i) => ({ name: `Team ${i + 1}`, station: stations ? `Station ${i + 1}` : null, members: ids.map((sid) => ({ student_id: sid, role_id: roleMap.get(sid) ?? null })) })),
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Name" htmlFor="g-name">
        <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Lab teams — Unit 4" />
      </Field>
      <div role="radiogroup" aria-label="Method" className="grid grid-cols-2 gap-2">
        {(
          [
            ["random", "Random & balanced"],
            ["manual", "Empty groups (manual)"],
          ] as const
        ).map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <input type="radio" name="method" checked={method === v} onChange={() => setMethod(v)} className="accent-[var(--brand)]" /> {l}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {method === "random" && (
          <Select aria-label="Grouping by" value={mode} onChange={(e) => setMode(e.target.value as "size" | "count")} className="w-auto">
            <option value="size">Students per group</option>
            <option value="count">Number of groups</option>
          </Select>
        )}
        <label className="grid gap-1 text-xs">
          {method === "manual" ? "Number of groups" : mode === "size" ? "Max per group" : "Groups"}
          <Input type="number" min={1} max={30} value={n} onChange={(e) => setN(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} className="w-24" />
        </label>
        <span className="pb-2 text-sm text-muted-foreground">→ {groupCount} groups</span>
      </div>
      {method === "random" && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={withRoles} onChange={(e) => setWithRoles(e.target.checked)} /> Assign team roles
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={skipAbsent} onChange={(e) => setSkipAbsent(e.target.checked)} /> Leave out students marked absent today ({absentIds.size})
          </label>
        </>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={stations} onChange={(e) => setStations(e.target.checked)} /> Number lab stations
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={method === "random" && !pool.length}>
          {method === "random" ? <Shuffle /> : <Plus />} Create
        </Button>
      </DialogFooter>
    </form>
  );
}

function GroupBoard({ cls, set }: { cls: ClassSection; set: GroupSet }) {
  const roster = useRoster(cls.id);
  const groups = useRows("groups");
  const memberships = useRows("group_memberships");
  const roles = useRows("team_roles");
  const gobs = useRows("group_observations");
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const fmt = useFormat();
  const [observing, setObserving] = React.useState<string | null>(null);
  const setGroups = groups.rows.filter((g) => g.group_set_id === set.id).sort((a, b) => a.sort_order - b.sort_order);
  const groupIds = new Set(setGroups.map((g) => g.id));
  const setMembers = memberships.rows.filter((m) => groupIds.has(m.group_id));
  const studentMap = new Map(roster.map((s) => [s.id, s]));
  const unassigned = roster.filter((s) => !setMembers.some((m) => m.student_id === s.id));
  const activeRoles = roles.rows.filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order);

  const moveTo = async (student: Student, groupId: string) => {
    const m = setMembers.find((x) => x.student_id === student.id);
    await run(async () => {
      if (m && !groupId) await store.remove("group_memberships", [m.id]);
      else if (m) await store.update("group_memberships", m.id, { group_id: groupId });
      else if (groupId) await store.insertOne("group_memberships", { group_id: groupId, student_id: student.id, role_id: null });
    }, { silent: true });
  };

  const moveSelect = (student: Student, currentGroup: string) => (
    <Select aria-label={`Group for ${displayName(student)}`} value={currentGroup} onChange={(e) => moveTo(student, e.target.value)} className="no-print h-7 w-auto px-1 text-xs">
      <option value="">Unassigned</option>
      {setGroups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="grid gap-4">
      <h2 className="hidden text-xl font-semibold print:block">
        {cls.course_name} (P{cls.period}) — {set.name}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {setGroups.map((g) => {
          const members = setMembers.filter((m) => m.group_id === g.id);
          const notes = gobs.rows.filter((o) => o.group_id === g.id).sort((a, b) => b.observed_at.localeCompare(a.observed_at));
          return (
            <Card key={g.id}>
              <CardHeader className="gap-2">
                <div className="flex items-center gap-2">
                  <Input aria-label="Group name" defaultValue={g.name} key={`${g.id}-${g.updated_at}`} maxLength={60} className="h-8 font-semibold" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.name && run(() => store.update("groups", g.id, { name: e.target.value.trim() }), { silent: true })} />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="no-print"
                    aria-label={`Delete ${g.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `Delete ${g.name}?`, description: "Members return to Unassigned. Group observations for this group are deleted.", confirmLabel: "Delete group", destructive: true }))
                        await run(() => store.remove("groups", [g.id]), { success: "Group deleted" });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Input aria-label="Lab station" placeholder="Lab station (optional)" defaultValue={g.station ?? ""} key={`${g.id}-s-${g.updated_at}`} maxLength={40} className="h-7 text-xs" onBlur={(e) => e.target.value !== (g.station ?? "") && run(() => store.update("groups", g.id, { station: e.target.value.trim() || null }), { silent: true })} />
              </CardHeader>
              <CardContent className="grid gap-3">
                <ul className="grid gap-1.5">
                  {members.map((m) => {
                    const s = studentMap.get(m.student_id);
                    if (!s) return null;
                    return (
                      <li key={m.id} className="flex flex-wrap items-center gap-1.5 text-sm">
                        <Link href={`/students/${s.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                          {displayName(s)}
                        </Link>
                        <Select aria-label={`Role for ${displayName(s)}`} value={m.role_id ?? ""} onChange={(e) => run(() => store.update("group_memberships", m.id, { role_id: e.target.value || null }), { silent: true })} className="h-7 w-auto px-1 text-xs print:border-0">
                          <option value="">No role</option>
                          {activeRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </Select>
                        {moveSelect(s, g.id)}
                      </li>
                    );
                  })}
                  {!members.length && <li className="text-xs text-muted-foreground">No members yet — use the group menus to move students here.</li>}
                </ul>
                <div className="no-print border-t pt-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Group observations ({notes.length})</span>
                    <Button size="sm" variant="ghost" onClick={() => setObserving(g.id)}>
                      <Plus /> Observe
                    </Button>
                  </div>
                  <ul className="grid gap-1 text-xs">
                    {notes.slice(0, 3).map((o) => (
                      <li key={o.id}>
                        <Badge>{DIMENSION_LABELS[o.dimension]}</Badge> <span className="text-muted-foreground">{fmt.short(o.observed_at)}</span> {o.note}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          );
        })}
        <Card className="no-print border-dashed">
          <CardContent className="grid h-full place-items-center pt-5">
            <Button variant="ghost" onClick={() => run(() => store.insertOne("groups", { group_set_id: set.id, name: `Team ${setGroups.length + 1}`, station: null, sort_order: setGroups.length }), { silent: true })}>
              <Plus /> Add group
            </Button>
          </CardContent>
        </Card>
      </div>
      {unassigned.length > 0 && (
        <Card className="no-print">
          <CardHeader>
            <CardTitle>Unassigned ({unassigned.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {unassigned.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  {displayName(s)} {moveSelect(s, "")}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="no-print text-xs text-muted-foreground">Individual contributions should be recorded as observations on each student — group observations describe the team as a whole.</p>
      <Dialog open={!!observing} onOpenChange={(o) => !o && setObserving(null)}>
        <DialogContent title="Group observation">
          {observing && <GroupObservationForm groupId={observing} onDone={() => setObserving(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupObservationForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const store = useStore();
  const run = useAction();
  const [dimension, setDimension] = React.useState<GroupDimension>("collaboration");
  const [note, setNote] = React.useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => store.insertOne("group_observations", { group_id: groupId, observed_at: new Date().toISOString(), dimension, note: note.trim() || null }), {
      success: "Group observation saved",
      undo: (r) => store.remove("group_observations", [r.id]),
    });
    if (ok) onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Dimension">
        {(Object.keys(DIMENSION_LABELS) as GroupDimension[]).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={dimension === d} onClick={() => setDimension(d)} className={dimension === d ? "rounded-full border border-brand bg-accent px-3 py-1 text-sm font-medium" : "rounded-full border px-3 py-1 text-sm hover:bg-secondary"}>
            {DIMENSION_LABELS[d]}
          </button>
        ))}
      </div>
      <Textarea aria-label="Note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What did you observe?" />
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}
