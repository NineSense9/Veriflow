import { statusLabel } from "@/lib/ui-zh";
import { tone } from "@/lib/status";

export default function StatusChip({
  value,
  title,
}: {
  value: string | null | undefined;
  title?: string;
}) {
  const text = value || "—";
  return (
    <span className={`verdict ${tone(text)}`} title={title || statusLabel(text)} data-status={text}>
      <i className="status-dot" aria-hidden="true" />
      {statusLabel(text)}
    </span>
  );
}
