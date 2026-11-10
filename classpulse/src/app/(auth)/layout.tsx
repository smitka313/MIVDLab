/* eslint-disable @next/next/no-img-element */
import { withBase } from "@/lib/paths";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-6">
          <img src={withBase("/brand/classpulse-lockup.svg")} alt="ClassPulse — Better classroom management. Stronger student support. Less paperwork." className="mx-auto w-full max-w-sm dark:hidden" />
          <img src={withBase("/brand/classpulse-lockup-reverse.svg")} alt="ClassPulse — Better classroom management. Stronger student support. Less paperwork." className="mx-auto hidden w-full max-w-sm dark:block" />
        </h1>
        {children}
      </div>
    </main>
  );
}
