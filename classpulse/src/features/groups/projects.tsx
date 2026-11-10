"use client";

import * as React from "react";
import { Flag, FolderKanban, Plus, Trash2 } from "lucide-react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { ClassSection, Project, ProjectTask } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm";
import { useFormat } from "@/lib/hooks";
import { cn, toISODate } from "@/lib/utils";

const TASK_STATUS: Record<ProjectTask["status"], { label: string; color: string }> = {
  not_started: { label: "Not started", color: "slate" },
  in_progress: { label: "In progress", color: "blue" },
  done: { label: "Done", color: "emerald" },
};
const PROJECT_STATUS: Record<Project["status"], string> = { planned: "Planned", active: "Active", completed: "Completed", archived: "Archived" };

export function ProjectsPanel({ cls }: { cls: ClassSection }) {
  const projects = useRows("projects");
  const [editing, setEditing] = React.useState<Project | "new" | null>(null);
  const list = projects.rows.filter((p) => p.class_id === cls.id && p.status !== "archived").sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  return (
    <div className="grid gap-4">
      <div>
        <Button onClick={() => setEditing("new")}>
          <Plus /> New project
        </Button>
      </div>
      {list.length ? list.map((p) => <ProjectCard key={p.id} project={p} onEdit={() => setEditing(p)} />) : <EmptyState icon={FolderKanban} title="No projects" description="Track milestones, tasks and deadlines for group projects." />}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "New project" : "Edit project"}>{editing !== null && <ProjectForm cls={cls} existing={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectForm({ cls, existing, onDone }: { cls: ClassSection; existing?: Project; onDone: () => void }) {
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const sets = useRows("group_sets");
  const [v, setV] = React.useState({
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    group_set_id: existing?.group_set_id ?? "",
    start_date: existing?.start_date ?? toISODate(),
    due_date: existing?.due_date ?? "",
    status: existing?.status ?? "active",
  });
  const err = v.due_date && v.start_date && v.due_date < v.start_date ? "Due date can't be before the start date" : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim() || err) return;
    const row = { class_id: cls.id, name: v.name.trim(), description: v.description.trim() || null, group_set_id: v.group_set_id || null, start_date: v.start_date || null, due_date: v.due_date || null, status: v.status as Project["status"] };
    const ok = existing ? await run(() => store.update("projects", existing.id, row), { success: "Project saved" }) : await run(() => store.insertOne("projects", row), { success: "Project created" });
    if (ok) onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Project name" htmlFor="pj-name" required>
        <Input id="pj-name" value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
      </Field>
      <Field label="Description" htmlFor="pj-desc">
        <Textarea id="pj-desc" rows={2} maxLength={2000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start" htmlFor="pj-start">
          <Input id="pj-start" type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} />
        </Field>
        <Field label="Due" htmlFor="pj-due" error={err ?? undefined}>
          <Input id="pj-due" type="date" value={v.due_date} onChange={(e) => setV({ ...v, due_date: e.target.value })} />
        </Field>
        <Field label="Groups" htmlFor="pj-set">
          <Select id="pj-set" value={v.group_set_id} onChange={(e) => setV({ ...v, group_set_id: e.target.value })}>
            <option value="">None</option>
            {sets.rows.filter((s) => s.class_id === cls.id && !s.archived_at).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="pj-status">
          <Select id="pj-status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as Project["status"] })}>
            {Object.entries(PROJECT_STATUS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {existing ? (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (await confirm({ title: `Delete “${existing.name}”?`, description: "The project and its tasks will be deleted.", confirmLabel: "Delete", destructive: true })) {
                const ok = await run(async () => { await store.remove("projects", [existing.id]); return true; }, { success: "Project deleted" });
                if (ok) onDone();
              }
            }}
          >
            <Trash2 /> Delete
          </Button>
        ) : (
          <span />
        )}
        <DialogFooter className="pt-0">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!v.name.trim() || !!err}>
            Save
          </Button>
        </DialogFooter>
      </div>
    </form>
  );
}

function ProjectCard({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const tasks = useRows("project_tasks");
  const groups = useRows("groups");
  const store = useStore();
  const run = useAction();
  const fmt = useFormat();
  const today = toISODate();
  const mine = tasks.rows.filter((t) => t.project_id === project.id).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const projectGroups = groups.rows.filter((g) => g.group_set_id === project.group_set_id).sort((a, b) => a.sort_order - b.sort_order);
  const done = mine.filter((t) => t.status === "done").length;
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [milestone, setMilestone] = React.useState(false);
  const [groupId, setGroupId] = React.useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await run(() => store.insertOne("project_tasks", { project_id: project.id, group_id: groupId || null, title: title.trim(), is_milestone: milestone, due_date: due || null, status: "not_started" }), { silent: true });
    if (ok) {
      setTitle("");
      setDue("");
      setMilestone(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{project.name}</CardTitle>
            <CardDescription>
              {project.start_date && `${fmt.date(project.start_date)} – `}
              {project.due_date ? `due ${fmt.date(project.due_date)}` : "no due date"} · {done}/{mine.length} tasks done
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{PROJECT_STATUS[project.status]}</Badge>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
          </div>
        </div>
        {mine.length > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={mine.length} aria-label="Tasks complete">
            <div className="h-full bg-brand" style={{ width: `${(done / mine.length) * 100}%` }} />
          </div>
        )}
        {project.description && <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>}
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="divide-y rounded-lg border">
          {mine.map((t) => {
            const overdue = t.status !== "done" && t.due_date && t.due_date < today;
            const g = projectGroups.find((x) => x.id === t.group_id) ?? groups.rows.find((x) => x.id === t.group_id);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                {t.is_milestone && <Flag className="size-4 text-violet-600" aria-label="Milestone" />}
                <span className={cn("min-w-0 flex-1", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                {g && <Badge>{g.name}</Badge>}
                <span className={cn("text-xs", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>{t.due_date ? fmt.short(t.due_date) : ""}</span>
                <Select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => run(() => store.update("project_tasks", t.id, { status: e.target.value as ProjectTask["status"] }), { silent: true })} className="h-7 w-auto px-1 text-xs">
                  {Object.entries(TASK_STATUS).map(([k, s]) => (
                    <option key={k} value={k}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${t.title}`} onClick={() => run(() => store.remove("project_tasks", [t.id]), { success: "Task deleted" })}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
          {!mine.length && <li className="px-3 py-2 text-sm text-muted-foreground">No tasks yet.</li>}
        </ul>
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Input aria-label="New task" placeholder="Add a task or milestone" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="min-w-48 flex-1" />
          <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-auto" />
          {projectGroups.length > 0 && (
            <Select aria-label="Assign to group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-auto">
              <option value="">All groups</option>
              {projectGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={milestone} onChange={(e) => setMilestone(e.target.checked)} /> Milestone
          </label>
          <Button type="submit" variant="outline" disabled={!title.trim()}>
            <Plus /> Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
