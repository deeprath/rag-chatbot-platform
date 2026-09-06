import { useRef } from "react";

const ACCEPTED_TYPES =
  ".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface UploadButtonProps {
  readonly uploading: boolean;
  readonly onSelect: (file: File) => void;
}

export function UploadButton({ uploading, onSelect }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {uploading ? "Uploading…" : "Upload document"}
      </button>
      <p className="mt-1 text-xs text-slate-400">PDF, DOCX, or TXT — up to 25 MB.</p>
    </div>
  );
}
