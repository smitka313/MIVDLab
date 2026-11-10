"use client";

import { studentHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Download, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Pagination, SortTH, TBody, TD, TH, THead, TR, Table, usePaged, useSort } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm";
import { Badge } from "@/components/ui/badge";
import { StudentForm } from "@/features/students/student-form";
import { StudentAvatar } from "@/features/students/photo";
import { classLabel, sortClasses, useClassMap } from "@/lib/hooks";
import type { Student } from "@/lib/types";
import { byName, displayName, downloadFile, toISODate } from "@/lib/utils";
import { toCSV } from "@/lib/csv";

export default function StudentsPage() {
  const status = useTables("students", "enrollments", "classes");
  const students = useRows("students");
  const enrollments = useRows("enrollments");
  const classes = useRows("classes");
  const classMap = useClassMap();
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [q, setQ] = React.useState("");
  const [classFilter, setClassFilter] = React.useState("");
  const [grade, setGrade] = React.useState("");
  const [archived, setArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<Student | "new" | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const { sort, onSort } = useSort<"name" | "grade" | "classes">("name");

  const classesOf = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of enrollments.rows) if (!e.dropped_at) m.set(e.student_id, [...(m.get(e.student_id) ?? []), e.class_id]);
    return m;
  }, [enrollments.rows]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = students.rows.filter((s) => {
      if (!!s.archived_at !== archived) return false;
      if (grade && String(s.grade_level ?? "") !== grade) return false;
      if (classFilter && !(classesOf.get(s.id) ?? []).includes(classFilter)) return false;
      if (needle && !`${s.first_name} ${s.last_name} ${s.preferred_name ?? ""} ${s.school_student_id ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (sort.key === "grade") return ((a.grade_level ?? 0) - (b.grade_level ?? 0)) * dir || byName(a, b);
      if (sort.key === "classes") return ((classesOf.get(a.id)?.length ?? 0) - (classesOf.get(b.id)?.length ?? 0)) * dir || byName(a, b);
      return byName(a, b) * dir;
    });
  }, [students.rows, q, grade, classFilter, archived, classesOf, sort]);
  const paged = usePaged(filtered, 50);

  const setArchivedFor = (ids: string[], on: boolean) =>
    run(() => Promise.all(ids.map((id) => store.update("students", id, { archived_at: on ? new Date().toISOString() : null }))), {
      success: `${on ? "Archived" : "Restored"} ${ids.length} student${ids.length === 1 ? "" : "s"}`,
      undo: () => Promise.all(ids.map((id) => store.update("students", id, { archived_at: on ? null : new Date().toISOString() }))),
    }).then(() => setSelected(new Set()));

  const remove = async (s: Student) => {
    const ok = await confirm({
      title: `Permanently delete ${displayName(s)}?`,
      description: "This deletes the student and ALL of their records: observations, attendance, notes, interventions and communication history. Archive instead if you only want to hide them. This cannot be undone.",
      confirmLabel: "Delete student",
      destructive: true,
      typeToConfirm: "DELETE",
    });
    if (ok) await run(() => store.remove("students", [s.id]), { success: "Student deleted" });
  };

  const enrollSelected = async (classId: string) => {
    const ids = [...selected];
    const existing = store.rows("enrollments").filter((e) => e.class_id === classId);
    const add = ids.filter((id) => !existing.some((e) => e.student_id === id));
    const rejoin = existing.filter((e) => ids.includes(e.student_id) && e.dropped_at);
    await run(
      async () => {
        if (add.length) await store.insert("enrollments", add.map((student_id) => ({ class_id: classId, student_id, enrolled_at: toISODate(), dropped_at: null })));
        for (const e of rejoin) await store.update("enrollments", e.id, { dropped_at: null });
      },
      { success: `Added ${add.length + rejoin.length} to ${classLabel(classMap.get(classId)!)}` },
    );
    setSelected(new Set());
  };

  const exportCsv = () => {
    const rows = filtered.map((s) => [s.last_name, s.first_name, s.preferred_name, s.grade_level, s.school_student_id, (classesOf.get(s.id) ?? []).map((id) => classMap.get(id)).filter(Boolean).map((c) => classLabel(c!)).join("; ")]);
    downloadFile(`classpulse-students-${toISODate()}.csv`, toCSV(["Last Name", "First Name", "Preferred Name", "Grade", "Student ID", "Classes"], rows));
  };

  const activeClasses = classes.rows.filter((c) => !c.archived_at).sort(sortClasses);
  const allOnPage = paged.slice.length > 0 && paged.slice.every((s) => selected.has(s.id));

  return (
    <>
      <PageHeader
        title="Students"
        description="Everyone across your classes. Open a student for their full profile."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> Export
            </Button>
            <Button asChild variant="outline">
              <Link href="/students/import">
                <Upload /> Import CSV
              </Link>
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus /> Add student
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Search students" placeholder="Search name or ID" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Filter by class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="w-auto">
          <option value="">All classes</option>
          {activeClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {classLabel(c)}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by grade" value={grade} onChange={(e) => setGrade(e.target.value)} className="w-auto">
          <option value="">All grades</option>
          {[9, 10, 11, 12].map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived
        </label>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-accent px-3 py-2 text-sm" role="region" aria-label="Bulk actions">
          <span className="font-medium">{selected.size} selected</span>
          <Select aria-label="Add selected to class" value="" onChange={(e) => e.target.value && enrollSelected(e.target.value)} className="h-8 w-auto">
            <option value="">Add to class…</option>
            {activeClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {classLabel(c)}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={() => setArchivedFor([...selected], !archived)}>
            {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Restore" : "Archive"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {status.error ? (
        <ErrorState error={status.error} onRetry={status.retry} />
      ) : status.loading ? (
        <LoadingState />
      ) : !students.rows.length ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Add students one at a time or import a roster CSV."
          action={
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/students/import">Import CSV</Link>
              </Button>
              <Button onClick={() => setEditing("new")}>Add student</Button>
            </div>
          }
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH className="w-10">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    onChange={(e) => setSelected((s) => {
                      const n = new Set(s);
                      for (const st of paged.slice) {
                        if (e.target.checked) n.add(st.id);
                        else n.delete(st.id);
                      }
                      return n;
                    })}
                  />
                </TH>
                <SortTH label="Name" sortKey="name" sort={sort} onSort={onSort} />
                <SortTH label="Grade" sortKey="grade" sort={sort} onSort={onSort} />
                <SortTH label="Classes" sortKey="classes" sort={sort} onSort={onSort} />
                <TH className="hidden md:table-cell">Student ID</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {paged.slice.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Checkbox aria-label={`Select ${displayName(s)}`} checked={selected.has(s.id)} onChange={(e) => setSelected((sel) => { const n = new Set(sel); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
                  </TD>
                  <TD>
                    <Link href={studentHref(s.id)} className="flex items-center gap-2.5 font-medium hover:underline">
                      <StudentAvatar student={s} className="size-8 text-xs" />
                      <span>
                        {displayName(s)}
                        {s.preferred_name && <span className="block text-xs font-normal text-muted-foreground">{s.first_name} {s.last_name}</span>}
                      </span>
                      {s.is_demo && <Badge className="ml-1">Demo</Badge>}
                    </Link>
                  </TD>
                  <TD>{s.grade_level ?? "—"}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {(classesOf.get(s.id) ?? []).map((cid) => {
                        const c = classMap.get(cid);
                        return c && !c.archived_at ? (
                          <Badge key={cid} color={c.color}>
                            P{c.period}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </TD>
                  <TD className="hidden text-muted-foreground md:table-cell">{s.school_student_id}</TD>
                  <TD className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Options for ${displayName(s)}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => setEditing(s)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setArchivedFor([s.id], !s.archived_at)}>
                          {s.archived_at ? <ArchiveRestore /> : <Archive />} {s.archived_at ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => remove(s)}>
                          <Trash2 /> Delete permanently…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!filtered.length && <p className="p-6 text-center text-sm text-muted-foreground">No students match these filters.</p>}
          <div className="px-3 pb-3">
            <Pagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} total={filtered.length} label="students" />
          </div>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add student" : "Edit student"} className="max-w-xl">
          {editing !== null && <StudentForm existing={editing === "new" ? undefined : editing} defaultClassId={classFilter || undefined} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
