"use client";
import { withBase } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Presentation,
  Settings,
  Sun,
  Users,
  UsersRound,
  FlaskConical,
} from "lucide-react";
import { useTheme } from "next-themes";
import { DataProvider, useData } from "@/components/providers/data-provider";
import { ConfirmProvider } from "@/components/ui/confirm";
import { QuickLogProvider, useQuickLog } from "@/features/observations/quick-log";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { classLabel, useCurrentClass } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useInstallApp } from "@/components/providers/pwa";
import { MonitorDown } from "lucide-react";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/classroom", label: "Classroom", icon: Presentation },
  { href: "/students", label: "Students", icon: Users },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/behavior", label: "Behavior & Engagement", icon: Activity },
  { href: "/interventions", label: "Interventions", icon: LifeBuoy },
  { href: "/groups", label: "Groups & Projects", icon: UsersRound },
  { href: "/communication", label: "Communication", icon: MessageSquare },
  { href: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

/** ClassPulse logo: mark + two-tone wordmark ("Class" navy/white, "Pulse" teal), as in the brand lockup. */
function Brand({ className, compact, onDark }: { className?: string; compact?: boolean; onDark?: boolean }) {
  return (
    <Link href="/dashboard" aria-label="ClassPulse home" className={cn("flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight", className)}>
      {onDark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={withBase("/brand/classpulse-mark-reverse.svg")} alt="" className="size-9 drop-shadow-[0_0_6px_rgba(28,198,211,0.55)]" />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBase("/brand/classpulse-mark.svg")} alt="" className="size-9 dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBase("/brand/classpulse-mark-reverse.svg")} alt="" className="hidden size-9 dark:block" />
        </>
      )}
      <span className={compact ? "hidden sm:inline" : undefined}>
        <span className={onDark ? "text-white" : "text-primary dark:text-white"}>Class</span>
        <span className={onDark ? "text-sidebar-primary" : "text-brand-ink"}>Pulse</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-white shadow-[inset_3px_0_0_var(--sidebar-primary)]" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active && "text-sidebar-primary")} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ThemeToggle() {
  const { resolvedTheme } = useTheme();
  const { updatePrefs } = useData();
  const dark = resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => void updatePrefs({ theme: dark ? "light" : "dark" })}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function PeriodSwitcher() {
  const { current, setCurrent, classes } = useCurrentClass();
  if (!classes.length) return null;
  return (
    <Select aria-label="Current class period" value={current?.id ?? ""} onChange={(e) => setCurrent(e.target.value)} className="h-9 w-auto min-w-0 max-w-[11rem] sm:max-w-xs">
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {classLabel(c)}
        </option>
      ))}
    </Select>
  );
}

function DemoBanner() {
  const { adapter } = useData();
  if (adapter.mode !== "demo") return null;
  return (
    <div role="note" className="no-print flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        Demo mode — fictional students, saved only in this browser. Do not enter real student information.{" "}
        <Link href="/settings#data" className="underline underline-offset-2">
          Reset demo
        </Link>
      </span>
    </div>
  );
}

function InstallButton() {
  const app = useInstallApp();
  if (!app.canPrompt) return null;
  return (
    <button
      type="button"
      onClick={() => void app.install()}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-primary hover:bg-sidebar-accent/60"
    >
      <MonitorDown className="size-4" aria-hidden /> Install ClassPulse app
    </button>
  );
}

function SignOut() {
  const { adapter } = useData();
  if (adapter.mode !== "supabase") return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await getBrowserSupabase().auth.signOut();
        navigator.serviceWorker?.controller?.postMessage("clear-caches");
        window.location.assign(withBase("/login/"));
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
    >
      <LogOut className="size-4" aria-hidden /> Sign out
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { profile, adapter } = useData();
  const quickLog = useQuickLog();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const path = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <DemoBanner />
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 bg-gradient-to-b from-sidebar-2 to-sidebar to-40% p-4 text-sidebar-foreground lg:flex" aria-label="Main navigation">
          <Brand className="px-1 pt-1" onDark />
          <nav className="flex-1 overflow-y-auto">
            <NavLinks />
          </nav>
          <div className="grid gap-1 border-t border-white/10 pt-3">
            <p className="truncate px-3 text-xs text-sidebar-muted">{profile.display_name || profile.email || (adapter.mode === "demo" ? "Demo teacher" : "")}</p>
            <InstallButton />
            <SignOut />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-5">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
              <Menu />
            </Button>
            <Brand className="lg:hidden" compact />
            <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
              <PeriodSwitcher />
              <Button variant="brand" onClick={() => quickLog()} className="hidden sm:inline-flex" title="Quick log (L)">
                <Plus /> Quick log
              </Button>
              <ThemeToggle />
            </div>
          </header>

          <main id="main" className="print-full mx-auto w-full max-w-7xl flex-1 px-3 pb-24 pt-5 sm:px-6 lg:pb-10">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Quick navigation" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {[
          { href: "/dashboard", label: "Home", icon: LayoutDashboard },
          { href: "/classroom", label: "Classroom", icon: Presentation },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(path, href) ? "text-brand-ink" : "text-muted-foreground")}>
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
        <button type="button" onClick={() => quickLog()} className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium text-brand-ink">
          <span className="grid size-8 place-items-center rounded-full bg-brand text-brand-foreground">
            <Plus className="size-5" aria-hidden />
          </span>
          Quick log
        </button>
        <Link href="/students" aria-current={isActive(path, "/students") ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(path, "/students") ? "text-brand-ink" : "text-muted-foreground")}>
          <Users className="size-5" aria-hidden />
          Students
        </Link>
        <button type="button" onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
          <Menu className="size-5" aria-hidden />
          More
        </button>
      </nav>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent title="Navigation" side="right" className="max-w-xs bg-sidebar text-sidebar-foreground [&_h2]:text-white">
          <nav aria-label="Main navigation">
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </nav>
          <InstallButton />
          <SignOut />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <ConfirmProvider>
        <QuickLogProvider>
          <Shell>{children}</Shell>
        </QuickLogProvider>
      </ConfirmProvider>
    </DataProvider>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
