"use client";

import { useState } from "react";

type FieldProps = {
  initial: string;
  onSave: (v: string) => Promise<void> | void;
  className?: string;
};

function useDraft(initial: string) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = value !== initial;

  const save = async (onSave: (v: string) => Promise<void> | void): Promise<void> => {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };
  const cancel = (): void => setValue(initial);

  return { value, setValue, dirty, saving, save, cancel };
}

function SaveCancelRow({
  dirty,
  saving,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="mt-1 flex gap-2">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="cursor-pointer rounded bg-neutral-900 px-2 py-0.5 text-xs text-white hover:bg-neutral-700 disabled:cursor-default disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-800 disabled:cursor-default disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

export function EditableText({ initial, onSave, className }: FieldProps) {
  const { value, setValue, dirty, saving, save, cancel } = useDraft(initial);
  return (
    <div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={
          className ?? "w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
        }
      />
      <SaveCancelRow
        dirty={dirty}
        saving={saving}
        onSave={() => void save(onSave)}
        onCancel={cancel}
      />
    </div>
  );
}

export function EditableTextarea({
  initial,
  onSave,
  rows = 3,
  className,
}: FieldProps & { rows?: number }) {
  const { value, setValue, dirty, saving, save, cancel } = useDraft(initial);
  return (
    <div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => setValue(e.target.value)}
        className={
          className ?? "w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
        }
      />
      <SaveCancelRow
        dirty={dirty}
        saving={saving}
        onSave={() => void save(onSave)}
        onCancel={cancel}
      />
    </div>
  );
}
