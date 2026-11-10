"use client";

import * as React from "react";
import { useData } from "@/components/providers/data-provider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Student } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

const BUCKET = "student-photos";

/** Downscale an image file to a small JPEG (privacy + storage friendly). */
export async function resizeImage(file: File, max = 256): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("That image is too large (max 10 MB).");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't process image"))), "image/jpeg", 0.85));
}

/**
 * Store a photo and return the value for students.photo_path.
 * Supabase: private bucket, path `<teacher>/<student>.jpg`. Demo: inline data URL in this browser.
 */
export async function uploadStudentPhoto(mode: "supabase" | "demo", teacherId: string, studentId: string, blob: Blob): Promise<string> {
  if (mode === "demo") {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("Couldn't read image"));
      r.readAsDataURL(blob);
    });
  }
  const path = `${teacherId}/${studentId}.jpg`;
  const { error } = await getBrowserSupabase().storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export async function deleteStudentPhoto(mode: "supabase" | "demo", path: string | null) {
  if (!path || mode === "demo" || path.startsWith("data:")) return;
  await getBrowserSupabase().storage.from(BUCKET).remove([path]);
}

const signedCache = new Map<string, { url: string; exp: number }>();

export function usePhotoUrl(student: Pick<Student, "photo_path"> | null | undefined) {
  const { adapter } = useData();
  const path = student?.photo_path ?? null;
  const [signed, setSigned] = React.useState<{ path: string; url: string | null } | null>(null);
  const needsSigning = !!path && !path.startsWith("data:") && adapter.mode === "supabase";
  React.useEffect(() => {
    if (!needsSigning || !path) return;
    const cached = signedCache.get(path);
    let cancelled = false;
    const done = (url: string | null) => !cancelled && setSigned({ path, url });
    if (cached && cached.exp > Date.now()) {
      void Promise.resolve().then(() => done(cached.url));
    } else {
      getBrowserSupabase()
        .storage.from(BUCKET)
        .createSignedUrl(path, 600)
        .then(({ data }: { data: { signedUrl: string } | null }) => {
          if (data?.signedUrl) signedCache.set(path, { url: data.signedUrl, exp: Date.now() + 540_000 });
          done(data?.signedUrl ?? null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [path, needsSigning]);
  if (!path) return null;
  if (path.startsWith("data:")) return path;
  return signed?.path === path ? signed.url : null;
}

export function StudentAvatar({ student, className }: { student: Student; className?: string }) {
  const url = usePhotoUrl(student);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn("size-10 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground", className)}>
      {initials(student)}
    </span>
  );
}
