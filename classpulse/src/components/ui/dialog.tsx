"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  side,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: string; side?: "right" | "bottom" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[1px]" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 border bg-popover text-popover-foreground shadow-xl focus:outline-none [&>*]:min-w-0",
          side === "right"
            ? "inset-y-0 right-0 h-full w-full max-w-md overflow-y-auto p-5 sm:rounded-l-xl"
            : side === "bottom"
              ? "inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl p-5"
              : "left-1/2 top-1/2 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-5",
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <D.Title className="text-lg font-semibold leading-tight">{title}</D.Title>
            {description && <D.Description className="text-sm text-muted-foreground">{description}</D.Description>}
          </div>
          <D.Close className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close">
            <X className="size-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
