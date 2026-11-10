"use client";
import { withBase } from "@/lib/paths";

import { classHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { Download, FlaskConical, MonitorDown, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useInstallApp } from "@/components/providers/pwa";
import { BackupPanel } from "@/features/backup/backup-panel";
import { setLocalMode } from "@/lib/data/local-mode";
import { isSupabaseConfigured } from "@/lib/config";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useData, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { CategoriesEditor } from "@/features/settings/categories-editor";
import { NamedListEditor } from "@/features/settings/list-editor";
import { classLabel, useActiveClasses, useFormat } from "@/lib/hooks";
import { COLOR_NAMES, COUNTS_AS_LABELS } from "@/lib/labels";
import type { AttendanceCountsAs, UserPreferences } from "@/lib/types";
import { exportAllData } from "@/lib/data/export";
import { downloadFile, toISODate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const SECTIONS = [
  ["profile", "Profile & appearance"],
  ["calendar", "School year & terms"],
  ["categories", "Behavior categories"],
  ["attendance", "Attendance statuses"],
  ["seating", "Default seating charts"],
  ["library", "Intervention & template libraries"],
  ["install", "Install the app"],
  ["notifications", "Notifications"],
  ["backup", "Backup & restore"],
  ["data", "Data & privacy"],
] as const;

export default function SettingsPage() {
  const status = useTables("observation_categories", "observation_behaviors", "attendance_statuses", "attendance_records", "academic_years", "terms", "classes", "seating_layouts", "intervention_strategies", "communication_templates", "team_roles");
  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;
  return (
    <>
      <PageHeader title="Settings" description="Personalize ClassPulse. Changes save automatically." />
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-20 grid gap-0.5 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid min-w-0 gap-6">
          <ProfileSection />
          <CalendarSection />
          <Section id="categories" title="Behavior categories & quick-log buttons" description="Create, rename, reorder, enable or disable categories and the one-click buttons shown in Live Classroom and Quick Log. ClassPulse never assigns numerical behavior scores.">
            <CategoriesEditor />
          </Section>
          <AttendanceStatusesSection />
          <SeatingDefaultsSection />
          <Section id="library" title="Intervention strategies, team roles & message templates">
            <div className="grid gap-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Intervention strategy library</h3>
                <NamedListEditor table="intervention_strategies" noun="strategy" />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Team roles</h3>
                <NamedListEditor table="team_roles" noun="role" nameMax={40} />
              </div>
              <p className="text-sm">
                Communication templates are edited on the{" "}
                <Link href="/communication" className="underline">
                  Communication → Templates
                </Link>{" "}
                tab.
              </p>
            </div>
          </Section>
          <InstallSection />
          <NotificationsSection />
          <BackupSection />
          <DataSection />
        </div>
      </div>
    </>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ProfileSection() {
  const { profile, prefs, updateProfile, updatePrefs } = useData();
  const run = useAction();
  const setPref = (p: Partial<UserPreferences>) => run(() => updatePrefs(p), { success: "Preferences saved" });
  return (
    <Section id="profile" title="Profile & appearance">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="pf-name" hint="Used in greetings and message templates.">
          <Input id="pf-name" defaultValue={profile.display_name} maxLength={120} onBlur={(e) => e.target.value !== profile.display_name && run(() => updateProfile({ display_name: e.target.value.trim() }), { success: "Name saved" })} />
        </Field>
        <Field label="Theme" htmlFor="pf-theme">
          <Select id="pf-theme" value={prefs.theme} onChange={(e) => setPref({ theme: e.target.value as UserPreferences["theme"] })}>
            <option value="system">Match device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </Field>
        <Field label="Date format" htmlFor="pf-date">
          <Select id="pf-date" value={prefs.date_format} onChange={(e) => setPref({ date_format: e.target.value as UserPreferences["date_format"] })}>
            <option value="MM/dd/yyyy">MM/DD/YYYY</option>
            <option value="dd/MM/yyyy">DD/MM/YYYY</option>
            <option value="yyyy-MM-dd">YYYY-MM-DD</option>
          </Select>
        </Field>
        <Field label="Time format" htmlFor="pf-time">
          <Select id="pf-time" value={prefs.time_format} onChange={(e) => setPref({ time_format: e.target.value as UserPreferences["time_format"] })}>
            <option value="12h">12-hour</option>
            <option value="24h">24-hour</option>
          </Select>
        </Field>
      </div>
    </Section>
  );
}

function CalendarSection() {
  const years = useRows("academic_years");
  const terms = useRows("terms");
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const fmt = useFormat();
  const [y, setY] = React.useState({ name: "", start: "", end: "" });
  const [t, setT] = React.useState({ year: "", name: "", start: "", end: "" });
  const yErr = y.start && y.end && y.end <= y.start ? "End must be after start" : null;
  const tErr = t.start && t.end && t.end <= t.start ? "End must be after start" : null;
  return (
    <Section id="calendar" title="School year & terms">
      <div className="grid gap-4">
        <ul className="grid gap-2">
          {[...years.rows].sort((a, b) => b.start_date.localeCompare(a.start_date)).map((yr) => (
            <li key={yr.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{yr.name}</span>
                <span className="text-muted-foreground">
                  {fmt.date(yr.start_date)} – {fmt.date(yr.end_date)}
                </span>
                <label className="ml-auto flex items-center gap-1.5 text-xs">
                  <Switch
                    checked={yr.is_current}
                    onCheckedChange={(v) =>
                      run(async () => {
                        if (v) for (const o of years.rows.filter((o) => o.is_current && o.id !== yr.id)) await store.update("academic_years", o.id, { is_current: false });
                        await store.update("academic_years", yr.id, { is_current: v });
                      }, { success: "Saved" })
                    }
                    aria-label={`${yr.name} is current`}
                  />
                  Current
                </label>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${yr.name}`}
                  onClick={async () => {
                    if (await confirm({ title: `Delete ${yr.name}?`, description: "Its terms are deleted. Classes in this year are kept but no longer linked to it.", confirmLabel: "Delete", destructive: true }))
                      await run(() => store.remove("academic_years", [yr.id]), { success: "Deleted" });
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
              <ul className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {terms.rows.filter((x) => x.academic_year_id === yr.id).sort((a, b) => a.start_date.localeCompare(b.start_date)).map((x) => (
                  <li key={x.id} className="flex items-center gap-1 rounded-md border px-2 py-0.5">
                    {x.name}: {fmt.short(x.start_date)} – {fmt.short(x.end_date)}
                    <button type="button" aria-label={`Delete ${x.name}`} className="hover:text-destructive" onClick={() => run(() => store.remove("terms", [x.id]), { success: "Term deleted" })}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!y.name.trim() || !y.start || !y.end || yErr) return;
            const ok = await run(() => store.insertOne("academic_years", { name: y.name.trim(), start_date: y.start, end_date: y.end, is_current: !years.rows.some((x) => x.is_current) }), { success: "School year added" });
            if (ok) setY({ name: "", start: "", end: "" });
          }}
        >
          <Input aria-label="School year name" placeholder="School year (e.g. 2027–2028)" value={y.name} maxLength={60} onChange={(e) => setY({ ...y, name: e.target.value })} />
          <Input aria-label="Start date" type="date" value={y.start} onChange={(e) => setY({ ...y, start: e.target.value })} />
          <Input aria-label="End date" type="date" value={y.end} onChange={(e) => setY({ ...y, end: e.target.value })} aria-invalid={!!yErr} />
          <Button type="submit" variant="outline" disabled={!y.name.trim() || !y.start || !y.end || !!yErr}>
            <Plus /> Add year
          </Button>
          {yErr && <p className="text-xs text-destructive sm:col-span-4">{yErr}</p>}
        </form>
        {years.rows.length > 0 && (
          <form
            className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!t.year || !t.name.trim() || !t.start || !t.end || tErr) return;
              const ok = await run(() => store.insertOne("terms", { academic_year_id: t.year, name: t.name.trim(), start_date: t.start, end_date: t.end }), { success: "Term added" });
              if (ok) setT({ ...t, name: "", start: "", end: "" });
            }}
          >
            <Select aria-label="School year for term" value={t.year} onChange={(e) => setT({ ...t, year: e.target.value })}>
              <option value="">Year…</option>
              {years.rows.map((yr) => (
                <option key={yr.id} value={yr.id}>
                  {yr.name}
                </option>
              ))}
            </Select>
            <Input aria-label="Term name" placeholder="Term (e.g. Semester 1)" value={t.name} maxLength={60} onChange={(e) => setT({ ...t, name: e.target.value })} />
            <Input aria-label="Term start" type="date" value={t.start} onChange={(e) => setT({ ...t, start: e.target.value })} />
            <Input aria-label="Term end" type="date" value={t.end} onChange={(e) => setT({ ...t, end: e.target.value })} />
            <Button type="submit" variant="outline" disabled={!t.year || !t.name.trim() || !t.start || !t.end || !!tErr}>
              <Plus /> Add term
            </Button>
            {tErr && <p className="text-xs text-destructive sm:col-span-5">{tErr}</p>}
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          Class periods, meeting days and times are set on each class (Classroom → class → Edit class).
        </p>
      </div>
    </Section>
  );
}

function AttendanceStatusesSection() {
  const statuses = useRows("attendance_statuses");
  const store = useStore();
  const run = useAction();
  const [n, setN] = React.useState({ code: "", label: "", counts_as: "present" as AttendanceCountsAs });
  const sorted = [...statuses.rows].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <Section id="attendance" title="Attendance statuses" description="Add custom statuses (e.g. “Field trip” counting as present). Each status maps to present, absent, tardy or excused for summaries.">
      <ul className="divide-y rounded-xl border">
        {sorted.map((s) => (
          <li key={s.id} className={cn("flex flex-wrap items-center gap-2 p-2.5", !s.is_active && "opacity-60")}>
            <Input aria-label="Code" defaultValue={s.code} key={`${s.id}-c-${s.updated_at}`} maxLength={4} className="h-8 w-16 font-mono uppercase" onBlur={(e) => { const v = e.target.value.trim().toUpperCase(); if (v && v !== s.code) void run(() => store.update("attendance_statuses", s.id, { code: v }), { success: "Saved" }); }} />
            <Input aria-label="Label" defaultValue={s.label} key={`${s.id}-l-${s.updated_at}`} maxLength={40} className="h-8 w-44" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.label && run(() => store.update("attendance_statuses", s.id, { label: e.target.value.trim() }), { success: "Saved" })} />
            <Select aria-label="Counts as" value={s.counts_as} onChange={(e) => run(() => store.update("attendance_statuses", s.id, { counts_as: e.target.value as AttendanceCountsAs }), { success: "Saved" })} className="h-8 w-auto">
              {Object.entries(COUNTS_AS_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  Counts as {l.toLowerCase()}
                </option>
              ))}
            </Select>
            <Select aria-label="Color" value={s.color} onChange={(e) => run(() => store.update("attendance_statuses", s.id, { color: e.target.value }), { silent: true })} className="h-8 w-auto">
              {COLOR_NAMES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-xs">
              <Switch checked={s.is_active} onCheckedChange={(v) => run(() => store.update("attendance_statuses", s.id, { is_active: v }), { success: v ? "Enabled" : "Disabled" })} aria-label={`${s.label} enabled`} />
              Enabled
            </label>
            <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Delete ${s.label}`} onClick={() => run(() => store.remove("attendance_statuses", [s.id]), { success: "Status deleted" })}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const code = n.code.trim().toUpperCase();
          if (!code || !n.label.trim()) return;
          const ok = await run(() => store.insertOne("attendance_statuses", { code, label: n.label.trim(), counts_as: n.counts_as, color: "slate", sort_order: sorted.length, is_active: true }), { success: "Status added" });
          if (ok) setN({ code: "", label: "", counts_as: "present" });
        }}
      >
        <Input aria-label="New status code" placeholder="Code" value={n.code} maxLength={4} onChange={(e) => setN({ ...n, code: e.target.value })} className="w-20 font-mono uppercase" />
        <Input aria-label="New status label" placeholder="Label (e.g. Field trip)" value={n.label} maxLength={40} onChange={(e) => setN({ ...n, label: e.target.value })} className="w-52" />
        <Select aria-label="New status counts as" value={n.counts_as} onChange={(e) => setN({ ...n, counts_as: e.target.value as AttendanceCountsAs })} className="w-auto">
          {Object.entries(COUNTS_AS_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              Counts as {l.toLowerCase()}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline" disabled={!n.code.trim() || !n.label.trim()}>
          <Plus /> Add status
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">A status already used in attendance records can&apos;t be deleted — disable it instead.</p>
    </Section>
  );
}

function SeatingDefaultsSection() {
  const { rows: classes } = useActiveClasses();
  const layouts = useRows("seating_layouts");
  const store = useStore();
  const run = useAction();
  return (
    <Section id="seating" title="Default seating charts" description="The layout opened first in Live Classroom for each class.">
      <ul className="grid gap-2">
        {classes.map((c) => {
          const ls = layouts.rows.filter((l) => l.class_id === c.id);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">{classLabel(c)}</span>
              {ls.length ? (
                <Select aria-label={`Default layout for ${classLabel(c)}`} value={c.default_layout_id ?? ""} onChange={(e) => run(() => store.update("classes", c.id, { default_layout_id: e.target.value || null }), { success: "Default layout saved" })} className="h-8 w-auto">
                  <option value="">First layout</option>
                  {ls.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Link href={classHref(c.id)} className="text-xs underline">
                  Create a layout
                </Link>
              )}
            </li>
          );
        })}
        {!classes.length && <li className="text-sm text-muted-foreground">No classes yet.</li>}
      </ul>
    </Section>
  );
}

function InstallSection() {
  const app = useInstallApp();
  return (
    <Section id="install" title="Install ClassPulse as an app" description="Open ClassPulse from your dock, taskbar, shelf or home screen in its own window. No app store, download or administrator rights needed.">
      <div className="grid gap-3 text-sm">
        {app.installed ? (
          <p className="font-medium text-brand-ink">ClassPulse is running as an installed app.</p>
        ) : app.canPrompt ? (
          <Button variant="brand" className="justify-self-start" onClick={() => void app.install()}>
            <MonitorDown /> Install ClassPulse
          </Button>
        ) : null}
        <ul className="grid gap-1.5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Chromebook, Windows or Mac (Chrome / Edge):</span> click the install icon at the right end of the address bar, or browser menu → <em>Install ClassPulse</em>.
          </li>
          <li>
            <span className="font-medium text-foreground">Android:</span> Chrome menu ⋮ → <em>Add to Home screen</em> / <em>Install app</em>.
          </li>
          <li>
            <span className="font-medium text-foreground">iPhone / iPad:</span> in Safari tap Share → <em>Add to Home Screen</em>.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">The installed app uses the same account and data as the website. It caches only the app itself (never student records), so it can open without a connection, but saving records needs internet.</p>
      </div>
    </Section>
  );
}

function BackupSection() {
  const { adapter } = useData();
  if (adapter.mode !== "personal") return null;
  return (
    <Section id="backup" title="Backup & restore" description="My classroom is saved only on this device. A backup file is your copy: use it to recover, or to move to another computer or browser.">
      <BackupPanel />
    </Section>
  );
}

function NotificationsSection() {
  const { prefs, updatePrefs } = useData();
  const run = useAction();
  return (
    <Section id="notifications" title="Notifications">
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={prefs.notification_prefs.in_app_reminders} onCheckedChange={(v) => run(() => updatePrefs({ notification_prefs: { ...prefs.notification_prefs, in_app_reminders: v } }), { success: "Saved" })} aria-label="In-app reminders" />
        Show due and overdue follow-ups on the dashboard
      </label>
      <p className="mt-2 text-xs text-muted-foreground">Reminders are in-app only. Email or push notifications are not available in this version.</p>
    </Section>
  );
}

function DataSection() {
  const { adapter, prefs, updatePrefs, loadDemoData, clearAllData } = useData();
  const run = useAction();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const demo = adapter.mode === "demo";
  const personal = adapter.mode === "personal";

  const doExport = async () => {
    setBusy(true);
    await run(async () => {
      const data = await exportAllData(adapter);
      downloadFile(`classpulse-export-${toISODate()}.json`, JSON.stringify(data, null, 2), "application/json");
    }, { success: "Export downloaded. Store it securely — it contains student records." });
    setBusy(false);
  };

  return (
    <Section id="data" title="Data & privacy">
      <div className="grid gap-5 text-sm">
        <div className="flex items-start gap-3 rounded-lg border bg-secondary/40 p-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-ink" aria-hidden />
          <div className="grid gap-1">
            <p className="font-medium">{demo ? "Demo mode: data stays in this browser" : personal ? "My classroom: records stay on this device" : "Your records are private to your account"}</p>
            <p className="text-muted-foreground">
              {demo
                ? "Demo data is fictional and stored only in this browser's local storage, which is not secure storage. Do not enter real student information in demo mode."
                : personal
                  ? "Your classroom records are stored only in this browser on this device (IndexedDB). They are never sent to GitHub, Supabase or any other server — the app itself is just downloaded from its website. Anyone who can use this browser profile can open them, so keep the device and your account on it locked. Protect backup files with a passphrase."
                  : "Records are protected by row-level security so other teachers can't read them unless you explicitly grant access. Teacher notes are never shared. Sensitive changes are kept in an audit log."}{" "}
              ClassPulse does not send student records to AI services. ClassPulse is designed for FERPA-conscious use, but it is not automatically FERPA-compliant: production use requires district review, approved data-privacy agreements and verification of applicable requirements.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <h3 className="font-semibold">Export</h3>
          <p className="text-muted-foreground">Download everything you own (classes, students, observations, attendance, notes, plans, communication, audit log) as JSON. Individual pages also offer CSV exports.</p>
          <Button variant="outline" className="justify-self-start" onClick={doExport} disabled={busy}>
            <Download /> Export all my data
          </Button>
        </div>

        <div className="grid gap-2">
          <h3 className="font-semibold">Retention</h3>
          <p className="text-muted-foreground">Automatically remove dated records (observations, attendance, notes, contacts, audit entries) older than a set period when you apply the policy. Students, classes and plans are kept.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Retention period"
              value={prefs.retention_days ?? ""}
              onChange={(e) => run(() => updatePrefs({ retention_days: e.target.value ? Number(e.target.value) : null }), { success: "Retention policy saved" })}
              className="w-auto"
            >
              <option value="">Keep until I delete them</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
              <option value={1095}>3 years</option>
              <option value={1825}>5 years</option>
            </Select>
            <Button
              variant="outline"
              disabled={!prefs.retention_days}
              onClick={async () => {
                if (!(await confirm({ title: "Apply retention policy now?", description: `Records older than ${prefs.retention_days} days will be permanently deleted.`, confirmLabel: "Apply now", destructive: true }))) return;
                await run(() => adapter.applyRetention(), { success: (n) => `Removed ${n} expired record${n === 1 ? "" : "s"}` });
                window.location.reload();
              }}
            >
              Apply now
            </Button>
          </div>
        </div>

        {!isSupabaseConfigured && <WorkspaceSwitch mode={personal ? "personal" : "demo"} />}

        {!personal && (
        <div className="grid gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <FlaskConical className="size-4" aria-hidden /> Demo data
          </h3>
          <p className="text-muted-foreground">
            {demo ? "Reset the fictional demo classroom (6 class periods, ~150 fictional students, 4 weeks of records)." : "Load the fictional demo classroom into this account to try ClassPulse. This replaces all data in your account."}
          </p>
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={async () => {
              const ok = await confirm({
                title: demo ? "Reset the demo?" : "Replace your data with demo data?",
                description: demo ? "All changes you made in this browser's demo will be lost." : "Everything in your account will be permanently deleted and replaced with fictional demo records.",
                confirmLabel: demo ? "Reset demo" : "Replace with demo data",
                destructive: true,
                typeToConfirm: demo ? undefined : "REPLACE",
              });
              if (ok) await run(() => loadDemoData(), { success: "Demo data loaded" });
            }}
          >
            {demo ? "Reset demo classroom" : "Load demo data…"}
          </Button>
        </div>
        )}

        <div className="grid gap-2 rounded-lg border border-destructive/40 p-3">
          <h3 className="font-semibold text-destructive">Danger zone</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive"
              onClick={async () => {
                const ok = await confirm({ title: "Delete all classroom data?", description: "Every class, student, observation, attendance record, note, plan, contact and setting will be permanently deleted. Your account remains. Consider exporting first.", confirmLabel: "Delete everything", destructive: true, typeToConfirm: "DELETE" });
                if (ok) await run(() => clearAllData(), { success: "All classroom data deleted" });
              }}
            >
              <Trash2 /> Delete all classroom data…
            </Button>
            {adapter.mode === "supabase" && (
              <Button
                variant="destructive"
                onClick={async () => {
                  const ok = await confirm({ title: "Delete your account?", description: "Your account and every record it owns will be permanently deleted. This cannot be undone.", confirmLabel: "Delete my account", destructive: true, typeToConfirm: "DELETE MY ACCOUNT" });
                  if (ok) {
                    const done = await run(async () => { await adapter.deleteAccount(); return true; }, { success: "Account deleted" });
                    if (done) window.location.assign(withBase("/login/"));
                  }
                }}
              >
                Delete account…
              </Button>
            )}
          </div>
        </div>
        <AuditLog />
      </div>
    </Section>
  );
}

function WorkspaceSwitch({ mode }: { mode: "personal" | "demo" }) {
  const confirm = useConfirm();
  const target = mode === "personal" ? "demo" : "personal";
  return (
    <div className="grid gap-2">
      <h3 className="font-semibold">Workspace</h3>
      <p className="text-muted-foreground">
        {mode === "personal"
          ? "You're using My classroom. The demo is kept separately, so switching never mixes fictional and real records."
          : "You're in the demo. My classroom is a separate, empty workspace for your real classes, saved only on this device."}
      </p>
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={async () => {
          if (
            await confirm({
              title: target === "demo" ? "Switch to the demo?" : "Switch to My classroom?",
              description: target === "demo" ? "Your classroom stays saved on this device. Switch back any time from Settings." : "The demo stays saved separately. Switch back any time from Settings.",
              confirmLabel: "Switch",
            })
          ) {
            setLocalMode(target);
            window.location.assign(withBase("/dashboard/"));
          }
        }}
      >
        {target === "demo" ? "Switch to the demo" : "Switch to My classroom"}
      </Button>
    </div>
  );
}

function AuditLog() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="grid gap-2">
      <label className="flex items-center gap-2">
        <Checkbox checked={open} onChange={(e) => setOpen(e.target.checked)} />
        <span className="font-semibold">Show recent audit log</span>
      </label>
      {open && <AuditList />}
    </div>
  );
}

function AuditList() {
  const logs = useRows("audit_logs");
  const fmt = useFormat();
  if (logs.status !== "ready") return <LoadingState />;
  const recent = [...logs.rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
  return (
    <ul className="max-h-80 overflow-y-auto rounded-lg border text-xs">
      {recent.map((l) => (
        <li key={l.id} className="flex gap-3 border-b px-3 py-1.5 last:border-0">
          <span className="w-36 shrink-0 text-muted-foreground">{fmt.dateTime(l.created_at)}</span>
          <span className="w-16 shrink-0 font-medium capitalize">{l.action}</span>
          <span>{l.table_name.replace(/_/g, " ")}</span>
        </li>
      ))}
      {!recent.length && <li className="p-3 text-muted-foreground">No audit entries.</li>}
    </ul>
  );
}
