import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { leakHits } from "@/lib/shola/gig-text";

export function LeakMark({
  value,
  onChange,
  onPaste,
  onKeyDown,
  maxLength,
  placeholder,
  minClass,
  bad,
}: {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  maxLength?: number;
  placeholder?: string;
  minClass: string;
  bad?: boolean;
}) {
  const back = useRef<HTMLDivElement>(null);
  const hits = leakHits(value);
  const parts: { text: string; mark: boolean }[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) parts.push({ text: value.slice(cursor, hit.start), mark: false });
    parts.push({ text: value.slice(hit.start, hit.end), mark: true });
    cursor = hit.end;
  }
  if (cursor < value.length || parts.length === 0) parts.push({ text: value.slice(cursor), mark: false });
  const marked = hits.length > 0;
  return (
    <div className={`relative mt-1 overflow-hidden rounded-xl bg-[#16161E] ${minClass} ${bad ? "ring-1 ring-[#FF3B30]" : ""}`}>
      <div
        ref={back}
        aria-hidden
        className={`pointer-events-none whitespace-pre-wrap break-words px-3 py-2 text-base ${marked ? "text-white" : "text-transparent"}`}
      >
        {parts.map((part, index) => part.mark ? (
          <mark key={index} className="rounded-sm bg-[#FDE68A] text-black">{part.text}</mark>
        ) : (
          <span key={index}>{part.text || (marked ? "" : " ")}</span>
        ))}
        {value.endsWith("\n") ? "\n " : ""}
      </div>
      <textarea
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          if (back.current) back.current.scrollTop = event.currentTarget.scrollTop;
        }}
        className={`absolute inset-0 h-full w-full resize-none bg-transparent px-3 py-2 text-base outline-none ${marked ? "text-transparent caret-white" : "text-white"}`}
      />
    </div>
  );
}
