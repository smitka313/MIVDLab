"use client";
import { withBase } from "@/lib/paths";

import * as React from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Registers the service worker (production builds only). */
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/"), updateViaCache: "none" }).catch(() => {
      /* installability is a progressive enhancement; ignore failures */
    });
  }, []);
  return null;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

function isStandalone() {
  return typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

/** Install state: `canPrompt` when the browser offers installation (Chrome, Edge, Android, ChromeOS). */
export function useInstallApp() {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  const [installed, setInstalled] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(isStandalone());
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return {
    installed,
    canPrompt: !!deferred && !installed,
    isIOS,
    install: async () => {
      if (!deferred) return false;
      const d = deferred;
      await d.prompt();
      const { outcome } = await d.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
      return outcome === "accepted";
    },
  };
}
