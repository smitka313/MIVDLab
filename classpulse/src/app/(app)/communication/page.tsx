"use client";

import { studentHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Pagination, usePaged } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { ContactForm } from "@/features/communication/contact-form";
import { MessageComposer } from "@/features/communication/composer";
import { RecordHistoryButton } from "@/features/audit/record-history";
import { useFormat, useStudentMap } from "@/lib/hooks";
import { COMM_STATUS_LABELS, CONTACT_TYPE_LABELS, PURPOSE_LABELS } from "@/lib/labels";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/messages";
import type { Communication, CommunicationTemplate } from "@/lib/types";
import { byName, cn, displayName, downloadFile, toISODate } from "@/lib/utils";
import { toCSV } from "@/lib/csv";

export default function CommunicationPage() {
  return (
    <React.Suspense fallback={<LoadingState />}>
      <CommunicationInner />
    </React.Suspense>
  );
}

function CommunicationInner() {
  const params = useSearchParams();
  const preset = params.get("student") ?? undefined;
  const status = useTables("communications", "communication_templates", "students", "observations", "enrollments", "classes");
  const [tab, setTab] = React.useState(preset ? "compose" : "log");
  const [logging, setLogging] = React.useState(false);

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Communication"
        description="Log parent/guardian and student contacts, and draft messages you review and send yourself."
        actions={
          <Button onClick={() => setLogging(true)}>
            <Plus /> Log contact
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="log">Contact log</TabsTrigger>
          <TabsTrigger value="compose">Draft a message</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <ContactLog defaultStudent={preset} />
        </TabsContent>
        <TabsContent value="compose">
          <Card>
            <CardContent className="pt-5">
              <MessageComposer defaultStudentId={preset} onSaved={() => setTab("log")} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="templates">
          <Templates />
        </TabsContent>
      </Tabs>
      <Dialog open={logging} onOpenChange={setLogging}>
        <DialogContent title="Log contact" className="max-w-2xl">
          {logging && <ContactForm defaults={{ student_id: preset }} onDone={() => setLogging(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContactLog({ defaultStudent }: { defaultStudent?: string }) {
  const comms = useRows("communications");
  const students = useRows("students");
  const studentMap = useStudentMap();
  const fmt = useFormat();
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [studentId, setStudentId] = React.useState(defaultStudent ?? "");
  const [type, setType] = React.useState("");
  const [st, setSt] = React.useState("");
  const [editing, setEditing] = React.useState<Communication | null>(null);
  const list = comms.rows
    .filter((c) => (!studentId || c.student_id === studentId) && (!type || c.contact_type === type) && (!st || c.status === st))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const paged = usePaged(list, 25);
  const today = toISODate();

  const exportCsv = () =>
    downloadFile(
      `communication-log-${today}.csv`,
      toCSV(
        ["Date/time", "Last Name", "First Name", "Type", "Recipient", "Purpose", "Subject", "Summary", "Status", "Follow-up date"],
        list.map((c) => {
          const s = studentMap.get(c.student_id);
          return [new Date(c.occurred_at).toLocaleString(), s?.last_name, s?.first_name, CONTACT_TYPE_LABELS[c.contact_type], c.recipient, PURPOSE_LABELS[c.purpose], c.subject, c.summary, COMM_STATUS_LABELS[c.status], c.follow_up_date];
        }),
      ),
    );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-auto">
          <option value="">All students</option>
          {[...students.rows].sort(byName).map((s) => (
            <option key={s.id} value={s.id}>
              {displayName(s)}
            </option>
          ))}
        </Select>
        <Select aria-label="Contact type" value={type} onChange={(e) => setType(e.target.value)} className="w-auto">
          <option value="">All types</option>
          {Object.entries(CONTACT_TYPE_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          {Object.entries(COMM_STATUS_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Button variant="outline" className="ml-auto" onClick={exportCsv} disabled={!list.length}>
          Export CSV
        </Button>
      </div>
      {list.length ? (
        <Card>
          <ul className="divide-y">
            {paged.slice.map((c) => {
              const s = studentMap.get(c.student_id);
              const overdue = c.status === "follow_up_pending" && c.follow_up_date && c.follow_up_date < today;
              return (
                <li key={c.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {s ? (
                        <Link href={studentHref(s.id)} className="hover:underline">
                          {displayName(s)}
                        </Link>
                      ) : (
                        "Unknown student"
                      )}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {CONTACT_TYPE_LABELS[c.contact_type]} · {PURPOSE_LABELS[c.purpose]}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmt.dateTime(c.occurred_at)}
                      {c.recipient && ` · with ${c.recipient}`}
                    </p>
                    {c.subject && <p className="mt-1 font-medium">{c.subject}</p>}
                    {c.summary && <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-muted-foreground">{c.summary}</p>}
                    {c.status === "follow_up_pending" && <p className={cn("mt-1 text-xs", overdue ? "font-semibold text-destructive" : "text-amber-700 dark:text-amber-400")}>Follow up {c.follow_up_date ? `by ${fmt.date(c.follow_up_date)}` : ""}</p>}
                  </div>
                  <Badge color={c.status === "follow_up_pending" ? "amber" : c.status === "draft" ? "slate" : "emerald"}>{COMM_STATUS_LABELS[c.status]}</Badge>
                  <RecordHistoryButton recordId={c.id} label="" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="Contact options">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(c)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      {c.status === "follow_up_pending" && (
                        <DropdownMenuItem onSelect={() => run(() => store.update("communications", c.id, { status: "closed" }), { success: "Follow-up closed", undo: () => store.update("communications", c.id, { status: c.status }) })}>
                          <CheckCircle2 /> Mark follow-up done
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        onSelect={async () => {
                          if (await confirm({ title: "Delete this contact record?", description: "The deletion is kept in the audit log.", confirmLabel: "Delete", destructive: true }))
                            await run(() => store.remove("communications", [c.id]), { success: "Deleted" });
                        }}
                      >
                        <Trash2 /> Delete…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
          <div className="px-4 pb-3">
            <Pagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} total={list.length} label="contacts" />
          </div>
        </Card>
      ) : (
        <EmptyState icon={MessageSquare} title="No contacts logged" description="Log calls, emails, conferences and student conversations to keep a complete record." />
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit contact" className="max-w-2xl">
          {editing && <ContactForm existing={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Templates() {
  const templates = useRows("communication_templates");
  const [editing, setEditing] = React.useState<CommunicationTemplate | "new" | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Placeholders: <code className="text-xs">{TEMPLATE_PLACEHOLDERS.join(" ")}</code>
        </p>
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus /> New template
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {templates.rows.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{t.name}</CardTitle>
                  <CardDescription>{PURPOSE_LABELS[t.purpose]}</CardDescription>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  <Pencil /> Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{t.subject}</p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "New template" : "Edit template"} className="max-w-2xl">
          {editing !== null && <TemplateForm existing={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateForm({ existing, onDone }: { existing?: CommunicationTemplate; onDone: () => void }) {
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [v, setV] = React.useState({ name: existing?.name ?? "", purpose: existing?.purpose ?? "positive", subject: existing?.subject ?? "", body: existing?.body ?? "" });
  const valid = v.name.trim() && v.body.trim();
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const row = { name: v.name.trim(), purpose: v.purpose as CommunicationTemplate["purpose"], subject: v.subject, body: v.body };
    const ok = existing ? await run(() => store.update("communication_templates", existing.id, row), { success: "Template saved" }) : await run(() => store.insertOne("communication_templates", row), { success: "Template created" });
    if (ok) onDone();
  };
  return (
    <form onSubmit={save} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="t-name" required>
          <Input id="t-name" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Purpose" htmlFor="t-purpose">
          <Select id="t-purpose" value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value as CommunicationTemplate["purpose"] })}>
            {Object.entries(PURPOSE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Subject" htmlFor="t-subject">
        <Input id="t-subject" value={v.subject} maxLength={200} onChange={(e) => setV({ ...v, subject: e.target.value })} />
      </Field>
      <Field label="Body" htmlFor="t-body" required hint={`Placeholders: ${TEMPLATE_PLACEHOLDERS.join(" ")}`}>
        <Textarea id="t-body" rows={10} maxLength={5000} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {existing ? (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (await confirm({ title: `Delete “${existing.name}”?`, description: "Messages already logged are not affected.", confirmLabel: "Delete", destructive: true })) {
                const ok = await run(async () => { await store.remove("communication_templates", [existing.id]); return true; }, { success: "Template deleted" });
                if (ok) onDone();
              }
            }}
          >
            <Trash2 /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            Save template
          </Button>
        </div>
      </div>
    </form>
  );
}
