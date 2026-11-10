export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-xl font-semibold">
          <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-brand text-brand-foreground">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l2-5 4 10 2-5h6" />
            </svg>
          </span>
          ClassPulse
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-muted-foreground">Better classroom management. Stronger student support. Less paperwork.</p>
      </div>
    </main>
  );
}
