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
    <span className={`verdict ${tone(text)}`} title={title || text}>
      {text}
    </span>
  );
}
