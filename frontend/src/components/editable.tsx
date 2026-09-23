"use client";

import { useEffect, useRef, useState } from "react";

function useDebouncedSave(value: string, onSave: (v: string) => void, delayMs: number) {
  const savedValue = useRef(value);

  useEffect(() => {
    if (value === savedValue.current) return;

    const timer = setTimeout(() => {
      savedValue.current = value;
      onSave(value);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, onSave, delayMs]);
}

export function EditableText({
  initial,
  onSave,
  className,
}: {
  initial: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);

  useDebouncedSave(value, onSave, 600);

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={
        className ?? "w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
      }
    />
  );
}

export function EditableTextarea({
  initial,
  onSave,
  rows = 3,
  className,
}: {
  initial: string;
  onSave: (v: string) => void;
  rows?: number;
  className?: string;
}) {
  const [value, setValue] = useState(initial);

  useDebouncedSave(value, onSave, 600);

  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => setValue(e.target.value)}
      className={
        className ?? "w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
      }
    />
  );
}
