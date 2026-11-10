"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

type ListTable = "intervention_strategies" | "team_roles";

/** Editable name/description list with enable/disable (strategy library, team roles). */
export function NamedListEditor({ table, noun, nameMax = 80 }: { table: ListTable; noun: string; nameMax?: number }) {
  const rows = useRows(table);
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const items = [...rows.rows].sort((a, b) => ("sort_order" in a && "sort_order" in b ? (a.sort_order as number) - (b.sort_order as number) : 0) || a.name.localeCompare(b.name));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const base = { name: name.trim().slice(0, nameMax), description: desc.trim() || null, is_active: true };
    const ok =
      table === "team_roles"
        ? await run(() => store.insertOne("team_roles", { ...base, sort_order: items.length }), { success: `Added ${noun}` })
        : await run(() => store.insertOne("intervention_strategies", base), { success: `Added ${noun}` });
    if (ok) {
      setName("");
      setDesc("");
    }
  };

  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((it) => (
          <li key={it.id} className={cn("flex flex-wrap items-center gap-2 p-3", !it.is_active && "opacity-60")}>
            <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[14rem_1fr]">
              <Input
                aria-label={`${noun} name`}
                defaultValue={it.name}
                key={`${it.id}-n-${it.updated_at}`}
                maxLength={nameMax}
                className="h-8 font-medium"
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== it.name && run(() => store.update(table, it.id, { name: e.target.value.trim() }), { success: "Saved" })}
              />
              <Input
                aria-label={`${noun} description`}
                defaultValue={it.description ?? ""}
                key={`${it.id}-d-${it.updated_at}`}
                placeholder="Description"
                className="h-8"
                onBlur={(e) => e.target.value !== (it.description ?? "") && run(() => store.update(table, it.id, { description: e.target.value.trim() || null }), { success: "Saved" })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={it.is_active} onCheckedChange={(v) => run(() => store.update(table, it.id, { is_active: v }), { success: v ? "Enabled" : "Disabled" })} aria-label={`${it.name} enabled`} />
              {it.is_active ? "On" : "Off"}
            </label>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${it.name}`}
              onClick={async () => {
                if (await confirm({ title: `Delete “${it.name}”?`, description: `Existing records keep their text, but this ${noun} will no longer be available. To hide it temporarily, switch it off instead.`, confirmLabel: "Delete", destructive: true }))
                  await run(() => store.remove(table, [it.id]), { success: "Deleted" });
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
        {!items.length && <li className="p-4 text-sm text-muted-foreground">Nothing here yet.</li>}
      </ul>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input aria-label={`New ${noun} name`} placeholder={`New ${noun}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={nameMax} className="w-56" />
        <Input aria-label={`New ${noun} description`} placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} className="min-w-48 flex-1" />
        <Button type="submit" disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  );
}
