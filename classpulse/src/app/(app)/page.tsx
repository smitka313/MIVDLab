"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** "/" -> dashboard (client-side, so it works on static hosting). */
export default function Home() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <p className="p-6 text-sm text-muted-foreground">
      Opening <Link href="/dashboard" className="underline">your dashboard</Link>…
    </p>
  );
}
