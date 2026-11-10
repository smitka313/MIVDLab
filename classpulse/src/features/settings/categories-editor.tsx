"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { ObservationKind } from "@/lib/types";
import { COLOR_NAMES, KIND_LABELS, colorClasses } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

/** Teacher-configurable observation categories and their one-click quick-log buttons. */
export function CategoriesEditor() {
  const cats = useRows("observation_categories");
  const behaviors = useRows("observation_behaviors");
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [newCat, setNewCat] = React.useState({ name: "", kind: "positive" as ObservationKind });
  const sorted = [...cats.rows].sort((a, b) => a.sort_order - b.sort_order);

  const swap = async <T extends "observation_categories" | "observation_behaviors">(table: T, list: { id: string; sort_order: number }[], i: number, j: number) => {
    if (j < 0 || j >= list.length) return;
    await run(async () => {
      // Normalise order first so equal sort_orders can't stall the swap.
      for (const [idx, it] of list.entries()) if (it.sort_order !== idx) await store.update(table, it.id, { sort_order: idx } as never);
      await store.update(table, list[i].id, { sort_order: j } as never);
      await store.update(table, list[j].id, { sort_order: i } as never);
    }, { silent: true });
  };

  return (
    <div className="grid gap-4">
      {sorted.map((c, ci) => {
        const items = behaviors.rows.filter((b) => b.category_id === c.id).sort((a, b) => a.sort_order - b.sort_order);
        return (
          <div key={c.id} className={cn("rounded-xl border bg-card", !c.is_active && "opacity-70")}>
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <span aria-hidden className={cn("size-3 rounded-full", colorClasses(c.color).dot)} />
              <Input aria-label="Category name" defaultValue={c.name} key={`${c.id}-${c.updated_at}`} maxLength={60} className="h-8 w-48 font-semibold" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && run(() => store.update("observation_categories", c.id, { name: e.target.value.trim() }), { success: "Saved" })} />
              <Select aria-label="Category type" value={c.kind} onChange={(e) => run(() => store.update("observation_categories", c.id, { kind: e.target.value as ObservationKind }), { success: "Saved" })} className="h-8 w-auto">
                {Object.entries(KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
              <Select aria-label="Category color" value={c.color} onChange={(e) => run(() => store.update("observation_categories", c.id, { color: e.target.value }), { silent: true })} className="h-8 w-auto">
                {COLOR_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-1.5 text-xs">
                <Switch checked={c.is_active} onCheckedChange={(v) => run(() => store.update("observation_categories", c.id, { is_active: v }), { success: v ? "Category enabled" : "Category disabled" })} aria-label={`${c.name} enabled`} />
                {c.is_active ? "Enabled" : "Disabled"}
              </label>
              <span className="ml-auto flex">
                <Button size="icon-sm" variant="ghost" aria-label="Move category up" disabled={ci === 0} onClick={() => swap("observation_categories", sorted, ci, ci - 1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Move category down" disabled={ci === sorted.length - 1} onClick={() => swap("observation_categories", sorted, ci, ci + 1)}>
                  <ArrowDown />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${c.name}`}
                  onClick={async () => {
                    if (await confirm({ title: `Delete category “${c.name}”?`, description: "Its quick-log buttons are deleted. Past observations keep their text. To hide it temporarily, disable it instead.", confirmLabel: "Delete category", destructive: true }))
                      await run(() => store.remove("observation_categories", [c.id]), { success: "Category deleted" });
                  }}
                >
                  <Trash2 />
                </Button>
              </span>
            </div>
            <ul className="divide-y">
              {items.map((b, bi) => (
                <li key={b.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !b.is_active && "opacity-60")}>
                  <Input aria-label="Behavior label" defaultValue={b.label} key={`${b.id}-${b.updated_at}`} maxLength={80} className="h-8 min-w-48 flex-1" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== b.label && run(() => store.update("observation_behaviors", b.id, { label: e.target.value.trim() }), { success: "Saved" })} />
                  <label className="flex items-center gap-1.5 text-xs" title="Show as a one-click button">
                    <Switch checked={b.is_quick} onCheckedChange={(v) => run(() => store.update("observation_behaviors", b.id, { is_quick: v }), { silent: true })} aria-label={`${b.label} quick-log button`} />
                    Quick button
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch checked={b.is_active} onCheckedChange={(v) => run(() => store.update("observation_behaviors", b.id, { is_active: v }), { silent: true })} aria-label={`${b.label} enabled`} />
                    Enabled
                  </label>
                  <span className="flex">
                    <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={bi === 0} onClick={() => swap("observation_behaviors", items, bi, bi - 1)}>
                      <ArrowUp />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={bi === items.length - 1} onClick={() => swap("observation_behaviors", items, bi, bi + 1)}>
                      <ArrowDown />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${b.label}`} onClick={() => run(() => store.remove("observation_behaviors", [b.id]), { success: "Button deleted" })}>
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
              <li className="px-3 py-2">
                <AddBehavior categoryId={c.id} order={items.length} />
              </li>
            </ul>
          </div>
        );
      })}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newCat.name.trim()) return;
          const ok = await run(() => store.insertOne("observation_categories", { name: newCat.name.trim(), kind: newCat.kind, color: newCat.kind === "positive" ? "emerald" : newCat.kind === "redirection" ? "amber" : "blue", sort_order: sorted.length, is_active: true }), { success: "Category added" });
          if (ok) setNewCat({ name: "", kind: "positive" });
        }}
      >
        <Input aria-label="New category name" placeholder="New category (e.g. Lab safety)" value={newCat.name} maxLength={60} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} className="w-64" />
        <Select aria-label="New category type" value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value as ObservationKind })} className="w-auto">
          {Object.entries(KIND_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline" disabled={!newCat.name.trim()}>
          <Plus /> Add category
        </Button>
      </form>
    </div>
  );
}

function AddBehavior({ categoryId, order }: { categoryId: string; order: number }) {
  const store = useStore();
  const run = useAction();
  const [label, setLabel] = React.useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!label.trim()) return;
        const ok = await run(() => store.insertOne("observation_behaviors", { category_id: categoryId, label: label.trim(), is_quick: true, sort_order: order, is_active: true }), { success: "Button added" });
        if (ok) setLabel("");
      }}
    >
      <Input aria-label="New quick-log button" placeholder="Add a quick-log button" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className="h-8" />
      <Button type="submit" size="sm" variant="outline" disabled={!label.trim()}>
        <Plus /> Add
      </Button>
    </form>
  );
}
