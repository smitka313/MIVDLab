"use client";

import * as React from "react";
import { Mic } from "lucide-react";
import { useData } from "@/components/providers/data-provider";

/** Starter phrases used until the teacher saves their own (Settings → Note phrases). */
export const DEFAULT_NOTE_TEMPLATES = [
  "Checked in about missing work.",
  "Spoke privately about phone use; student agreed to put it away.",
  "Student asked for extra help — scheduled time after class.",
  "Seemed unwell / not themselves today.",
  "Great question that moved the class discussion forward.",
  "Called home — left a voicemail.",
];

export function useNoteTemplates() {
  const { prefs } = useData();
  const saved = Array.isArray(prefs.note_templates) ? prefs.note_templates.filter((t) => typeof t === "string" && t.trim()) : [];
  return saved.length ? saved : DEFAULT_NOTE_TEMPLATES;
}

/** One-tap phrases that insert into a note. */
export function NoteTemplateChips({ onPick }: { onPick: (text: string) => void }) {
  const templates = useNoteTemplates();
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Saved phrases">
      {templates.map((t) => (
        <button key={t} type="button" onClick={() => onPick(t)} className="max-w-full truncate rounded-full border bg-secondary/60 px-2.5 py-1 text-xs hover:bg-secondary" title={t}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** Reminder that the device's own dictation works in any text box. */
export function DictationTip() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Mic className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Prefer to speak? Use your device&apos;s dictation in this box: Windows <kbd className="rounded border px-1">Win</kbd>+<kbd className="rounded border px-1">H</kbd>, Chromebook <kbd className="rounded border px-1">Search</kbd>+<kbd className="rounded border px-1">D</kbd> (turn on Dictation in Accessibility settings), Mac: press <kbd className="rounded border px-1">Fn</kbd> twice, phone or iPad: the microphone key.
      </span>
    </p>
  );
}

/** Append a phrase to existing text with sensible spacing. */
export function appendPhrase(current: string, phrase: string) {
  const t = current.trimEnd();
  return t ? `${t} ${phrase}` : phrase;
}
