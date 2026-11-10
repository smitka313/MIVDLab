"use client";
import * as React from "react";
import { AlertDialog as A } from "radix-ui";
import { Button } from "./button";

interface ConfirmOptions {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** If set, the user must type this text to enable the confirm button. */
  typeToConfirm?: string;
}

type Resolver = (ok: boolean) => void;
const ConfirmCtx = React.createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({...})) { ... }` */
export function useConfirm() {
  return React.useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = React.useState("");
  const resolver = React.useRef<Resolver | null>(null);

  const confirm = React.useCallback((o: ConfirmOptions) => {
    setTyped("");
    setOpts(o);
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  const blocked = !!opts?.typeToConfirm && typed.trim() !== opts.typeToConfirm;

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <A.Root open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <A.Portal>
          <A.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
          <A.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl">
            <A.Title className="text-lg font-semibold">{opts?.title}</A.Title>
            <A.Description asChild>
              <div className="text-sm text-muted-foreground">{opts?.description}</div>
            </A.Description>
            {opts?.typeToConfirm && (
              <label className="grid gap-1.5 text-sm">
                <span>
                  Type <strong className="font-mono">{opts.typeToConfirm}</strong> to confirm
                </span>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-3"
                  aria-label={`Type ${opts.typeToConfirm} to confirm`}
                />
              </label>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <A.Cancel asChild>
                <Button variant="outline">Cancel</Button>
              </A.Cancel>
              <Button variant={opts?.destructive ? "destructive" : "default"} disabled={blocked} onClick={() => close(true)}>
                {opts?.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </ConfirmCtx.Provider>
  );
}
