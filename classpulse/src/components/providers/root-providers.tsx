"use client";
import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { ServiceWorkerRegistration } from "./pwa";

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <ServiceWorkerRegistration />
      <Toaster position="bottom-right" richColors closeButton offset={{ bottom: 80, right: 16 }} mobileOffset={{ bottom: 80 }} />
    </ThemeProvider>
  );
}
