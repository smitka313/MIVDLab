"use client";

import * as React from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, LayoutGrid, Minus, Move, Pencil, Plus, Printer, Shuffle, SortAsc, Star, Trash2, UserMinus, Users } from "lucide-react";
import { useAction, useData, useRows, useStore } from "@/components/providers/data-provider";
import type { ClassSection, Seat, SeatKind, SeatingLayout, Student } from "@/lib/types";
import { SEAT_KIND_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { SeatingChart } from "./seating-chart";
import { FIXTURE_SIZES, autoAssign, canPlace, findFreeSpot, moveStudent, templateItems } from "./layout-logic";
import { cn, displayName } from "@/lib/utils";
import type { Store } from "@/lib/data/store";

/** Apply seat->student changes without ever violating "one seat per student per layout". */
export async function applySeatUpdates(store: Store, updates: { id: string; student_id: string | null }[]) {
  for (const u of updates) await store.update("seats", u.id, { student_id: null });
  for (const u of updates) if (u.student_id) await store.update("seats", u.id, { student_id: u.student_id });
}

export async function createLayout(store: Store, cls: ClassSection, name: string, arrangement: SeatingLayout["arrangement"], seatsWanted: number) {
  const layout = await store.insertOne("seating_layouts", { class_id: cls.id, name, arrangement, cols: 12, rows: 10 });
  const items = templateItems(arrangement, 12, 10, seatsWanted);
  await store.insert("seats", items.map((i) => ({ ...i, layout_id: layout.id, student_id: null })));
  if (!cls.default_layout_id) await store.update("classes", cls.id, { default_layout_id: layout.id });
  return layout;
}

export function NewLayoutDialog({ cls, open, onOpenChange, onCreated, seatsWanted }: { cls: ClassSection; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (l: SeatingLayout) => void; seatsWanted: number }) {
  const store = useStore();
  const run = useAction();
  const [name, setName] = React.useState("");
  const [arrangement, setArrangement] = React.useState<SeatingLayout["arrangement"]>("rows");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const l = await run(() => createLayout(store, cls, name.trim() || "New layout", arrangement, seatsWanted), { success: "Layout created" });
    if (l) {
      onCreated(l);
      onOpenChange(false);
      setName("");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New seating layout" description="Start from a template, then drag to adjust.">
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Layout name" htmlFor="l-name">
            <Input id="l-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Test day" maxLength={80} autoFocus />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Template</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  ["rows", "Traditional rows"],
                  ["pods", "Pods of four"],
                  ["tables", "Tables"],
                  ["lab", "Lab stations"],
                  ["custom", "Blank room"],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", arrangement === v && "border-brand bg-accent")}>
                  <input type="radio" name="arr" value={v} checked={arrangement === v} onChange={() => setArrangement(v)} className="accent-[var(--brand)]" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create layout</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Build and edit seating layouts: arrange furniture and assign students. */
export function LayoutEditor({ cls, roster, layoutId, setLayoutId }: { cls: ClassSection; roster: Student[]; layoutId: string | null; setLayoutId: (id: string) => void }) {
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const { adapter } = useData();
  const layouts = useRows("seating_layouts");
  const allSeats = useRows("seats");
  const classLayouts = layouts.rows.filter((l) => l.class_id === cls.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const layout = classLayouts.find((l) => l.id === layoutId) ?? classLayouts.find((l) => l.id === cls.default_layout_id) ?? classLayouts[0];
  const activeLayoutId = layout?.id;
  const seats = allSeats.rows.filter((s) => s.layout_id === activeLayoutId);
  const studentMap = React.useMemo(() => new Map(roster.map((s) => [s.id, s])), [roster]);
  const [mode, setMode] = React.useState<"assign" | "arrange">("assign");
  const [selected, setSelected] = React.useState<Seat | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [rename, setRename] = React.useState("");
  const selectedSeat = selected ? seats.find((s) => s.id === selected.id) ?? null : null;

  const unseated = roster.filter((st) => !seats.some((s) => s.student_id === st.id));
  // Seats whose student is no longer enrolled are shown as empty and can be cleared.
  const stale = seats.filter((s) => s.student_id && !studentMap.has(s.student_id));

  const moveItem = (seat: Seat, x: number, y: number) => {
    if (seat.x === x && seat.y === y) return;
    if (!canPlace({ x, y, w: seat.w, h: seat.h }, seats, layout!, seat.id)) {
      run(async () => {
        throw new Error("That spot is taken or outside the room.");
      });
      return;
    }
    void run(() => store.update("seats", seat.id, { x, y }), { silent: true });
  };

  const resizeItem = (seat: Seat, dw: number, dh: number) => {
    const w = Math.max(1, Math.min(12, seat.w + dw));
    const h = Math.max(1, Math.min(12, seat.h + dh));
    if (!canPlace({ x: seat.x, y: seat.y, w, h }, seats, layout!, seat.id)) {
      void run(async () => {
        throw new Error("Not enough room to resize there.");
      });
      return;
    }
    void run(() => store.update("seats", seat.id, { w, h }), { silent: true });
  };

  const addItem = async (kind: SeatKind) => {
    if (!layout) return;
    const size = FIXTURE_SIZES[kind];
    const spot = findFreeSpot(size, seats, layout);
    if (!spot) {
      await run(async () => {
        throw new Error("No free space left in this room. Move or remove something first.");
      });
      return;
    }
    const s = await run(() => store.insertOne("seats", { layout_id: layout.id, kind, ...spot, w: size.w, h: size.h, label: size.label, student_id: null }), { silent: true });
    if (s) {
      setSelected(s);
      setMode("arrange");
    }
  };

  const dropStudent = (studentId: string, seatId: string | null) => {
    void run(() => applySeatUpdates(store, moveStudent(seats, studentId, seatId)), { silent: true });
  };

  const assign = (how: "alphabetical" | "random") => {
    const map = autoAssign(seats, roster.map((s) => s.id), how);
    if (!map.size) {
      void run(async () => {
        throw new Error(unseated.length ? "There are no empty seats. Add seats in Arrange mode." : "Every student already has a seat.");
      });
      return;
    }
    void run(() => applySeatUpdates(store, [...map].map(([id, student_id]) => ({ id, student_id }))), { success: `Seated ${map.size} students` });
  };

  const clearAll = async () => {
    const occupied = seats.filter((s) => s.student_id);
    if (!(await confirm({ title: "Clear all seat assignments?", description: `${occupied.length} students will be unseated in “${layout?.name}”. Furniture stays in place.`, confirmLabel: "Clear seats" }))) return;
    const before = occupied.map((s) => ({ id: s.id, student_id: s.student_id }));
    await run(() => Promise.all(occupied.map((s) => store.update("seats", s.id, { student_id: null }))), {
      success: "Seats cleared",
      undo: () => applySeatUpdates(store, before),
    });
  };

  const duplicate = async () => {
    if (!layout) return;
    const copy = await run(
      async () => {
        const l = await store.insertOne("seating_layouts", { class_id: cls.id, name: `${layout.name} (copy)`.slice(0, 80), arrangement: layout.arrangement, cols: layout.cols, rows: layout.rows });
        await store.insert("seats", seats.map((s) => ({ layout_id: l.id, kind: s.kind, x: s.x, y: s.y, w: s.w, h: s.h, label: s.label, student_id: s.student_id })));
        return l;
      },
      { success: "Layout duplicated" },
    );
    if (copy) setLayoutId(copy.id);
  };

  const removeLayout = async () => {
    if (!layout) return;
    if (!(await confirm({ title: `Delete “${layout.name}”?`, description: "The layout and its seat assignments will be deleted. Observations and attendance are not affected.", confirmLabel: "Delete layout", destructive: true }))) return;
    await run(() => store.remove("seating_layouts", [layout.id]), { success: "Layout deleted" });
  };

  if (!layout) {
    return (
      <>
        <EmptyState
          icon={LayoutGrid}
          title="No seating layouts yet"
          description="Create a layout from a template — rows, pods, tables or lab stations — then drag students into seats."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus /> New layout
            </Button>
          }
        />
        <NewLayoutDialog cls={cls} open={newOpen} onOpenChange={setNewOpen} onCreated={(l) => setLayoutId(l.id)} seatsWanted={Math.max(24, roster.length + 2)} />
      </>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Select aria-label="Layout" value={layout.id} onChange={(e) => setLayoutId(e.target.value)} className="w-auto">
          {classLayouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.id === cls.default_layout_id ? " (default)" : ""}
            </option>
          ))}
        </Select>
        <div role="radiogroup" aria-label="Editing mode" className="inline-flex rounded-lg border bg-card p-0.5">
          {(
            [
              ["assign", "Assign students", Users],
              ["arrange", "Arrange room", Move],
            ] as const
          ).map(([v, l, Icon]) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => { setMode(v); setSelected(null); }} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", mode === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" aria-hidden />
              {l}
            </button>
          ))}
        </div>
        {mode === "arrange" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus /> Add element
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(Object.keys(SEAT_KIND_LABELS) as SeatKind[]).map((k) => (
                <DropdownMenuItem key={k} onSelect={() => addItem(k)}>
                  {SEAT_KIND_LABELS[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Users /> Auto-seat
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Seat unseated students</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => assign("alphabetical")}>
                <SortAsc /> Alphabetically
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => assign("random")}>
                <Shuffle /> Randomly
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={clearAll}>
                <UserMinus /> Clear all seats…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={() => setNewOpen(true)}>
            <Plus /> New
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setRename(layout.name); setRenaming(true); }}>
            <Pencil /> Rename
          </Button>
          <Button variant="ghost" size="sm" onClick={duplicate}>
            <Copy /> Duplicate
          </Button>
          {layout.id !== cls.default_layout_id && (
            <Button variant="ghost" size="sm" onClick={() => run(() => store.update("classes", cls.id, { default_layout_id: layout.id }), { success: "Default layout set" })}>
              <Star /> Make default
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button variant="ghost" size="sm" onClick={removeLayout} aria-label="Delete layout">
            <Trash2 />
          </Button>
        </div>
      </div>

      <p className="no-print text-sm text-muted-foreground">
        {mode === "assign"
          ? "Drag a student onto a seat (dropping on an occupied seat swaps them), or click a seat to choose a student. Changes save automatically."
          : "Drag furniture and seats to move them. Click an item to resize, rename or remove it; arrow keys nudge the selected item."}
        {adapter.mode === "demo" && " "}
      </p>
      {stale.length > 0 && (
        <p className="no-print text-sm text-amber-700 dark:text-amber-400">
          {stale.length} seat(s) are assigned to students no longer in this class.{" "}
          <button type="button" className="underline" onClick={() => run(() => Promise.all(stale.map((s) => store.update("seats", s.id, { student_id: null }))), { success: "Cleared" })}>
            Clear them
          </button>
        </p>
      )}

      <div className="hidden print:block">
        <h2 className="text-xl font-semibold">
          {cls.course_name} — Period {cls.period} {cls.room ? `· Room ${cls.room}` : ""}
        </h2>
        <p className="text-sm">Seating chart: {layout.name}</p>
      </div>

      <div
        onKeyDown={(e) => {
          if (mode !== "arrange" || !selectedSeat) return;
          const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          if (d[e.key]) {
            e.preventDefault();
            moveItem(selectedSeat, selectedSeat.x + d[e.key][0], selectedSeat.y + d[e.key][1]);
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            void run(() => store.remove("seats", [selectedSeat.id]), { success: "Removed" });
            setSelected(null);
          }
        }}
      >
        <SeatingChart
          layout={layout}
          seats={seats}
          students={studentMap}
          mode={mode}
          selectedId={selectedSeat?.id}
          onSelect={(s) => setSelected(s)}
          onMoveItem={moveItem}
          onDropStudent={dropStudent}
          unseated={unseated}
        />
      </div>

      {/* Selected-item controls */}
      {mode === "arrange" && selectedSeat && (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
          <span className="font-medium">{SEAT_KIND_LABELS[selectedSeat.kind]}</span>
          <Input aria-label="Label" className="h-8 w-40" defaultValue={selectedSeat.label ?? ""} key={selectedSeat.id} maxLength={40} placeholder="Label" onBlur={(e) => e.target.value !== (selectedSeat.label ?? "") && run(() => store.update("seats", selectedSeat.id, { label: e.target.value.trim() || null }), { silent: true })} />
          <span className="flex items-center gap-1" aria-label="Move">
            <Button size="icon-sm" variant="outline" aria-label="Move left" onClick={() => moveItem(selectedSeat, selectedSeat.x - 1, selectedSeat.y)}><ArrowLeft /></Button>
            <Button size="icon-sm" variant="outline" aria-label="Move up" onClick={() => moveItem(selectedSeat, selectedSeat.x, selectedSeat.y - 1)}><ArrowUp /></Button>
            <Button size="icon-sm" variant="outline" aria-label="Move down" onClick={() => moveItem(selectedSeat, selectedSeat.x, selectedSeat.y + 1)}><ArrowDown /></Button>
            <Button size="icon-sm" variant="outline" aria-label="Move right" onClick={() => moveItem(selectedSeat, selectedSeat.x + 1, selectedSeat.y)}><ArrowRight /></Button>
          </span>
          {selectedSeat.kind !== "seat" && (
            <span className="flex items-center gap-1">
              Width
              <Button size="icon-sm" variant="outline" aria-label="Narrower" onClick={() => resizeItem(selectedSeat, -1, 0)}><Minus /></Button>
              <Button size="icon-sm" variant="outline" aria-label="Wider" onClick={() => resizeItem(selectedSeat, 1, 0)}><Plus /></Button>
              Height
              <Button size="icon-sm" variant="outline" aria-label="Shorter" onClick={() => resizeItem(selectedSeat, 0, -1)}><Minus /></Button>
              <Button size="icon-sm" variant="outline" aria-label="Taller" onClick={() => resizeItem(selectedSeat, 0, 1)}><Plus /></Button>
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={() => {
              const s = selectedSeat;
              setSelected(null);
              void run(() => store.remove("seats", [s.id]), {
                success: "Removed",
                undo: () => store.insertOne("seats", { layout_id: s.layout_id, kind: s.kind, x: s.x, y: s.y, w: s.w, h: s.h, label: s.label, student_id: s.student_id }),
              });
            }}
          >
            <Trash2 /> Remove
          </Button>
        </div>
      )}

      {/* Click-to-assign (keyboard accessible alternative to drag and drop) */}
      <Dialog open={mode === "assign" && !!selectedSeat && selectedSeat.kind === "seat"} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent title="Assign seat" description={selectedSeat?.student_id && studentMap.get(selectedSeat.student_id) ? `Currently: ${displayName(studentMap.get(selectedSeat.student_id)!)}` : "This seat is empty."}>
          {selectedSeat && (
            <div className="grid gap-3">
              <Select
                aria-label="Student for this seat"
                defaultValue={selectedSeat.student_id ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const cur = selectedSeat.student_id;
                  void run(async () => { if (v) await applySeatUpdates(store, moveStudent(seats, v, selectedSeat.id)); else await store.update("seats", selectedSeat.id, { student_id: null }); }, { silent: true }).then(() => setSelected(null));
                  void cur;
                }}
              >
                <option value="">— Empty seat —</option>
                {roster.map((st) => {
                  const at = seats.find((s) => s.student_id === st.id && s.id !== selectedSeat.id);
                  return (
                    <option key={st.id} value={st.id}>
                      {displayName(st)}
                      {at ? " (swap seats)" : ""}
                    </option>
                  );
                })}
              </Select>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <NewLayoutDialog cls={cls} open={newOpen} onOpenChange={setNewOpen} onCreated={(l) => setLayoutId(l.id)} seatsWanted={Math.max(24, roster.length + 2)} />
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent title="Rename layout">
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!rename.trim()) return;
              const ok = await run(() => store.update("seating_layouts", layout.id, { name: rename.trim().slice(0, 80) }), { success: "Renamed" });
              if (ok) setRenaming(false);
            }}
          >
            <Input aria-label="Layout name" value={rename} onChange={(e) => setRename(e.target.value)} maxLength={80} autoFocus />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!rename.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
