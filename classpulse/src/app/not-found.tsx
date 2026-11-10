import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid gap-3">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <Link href="/dashboard" className="text-brand underline underline-offset-4">
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
