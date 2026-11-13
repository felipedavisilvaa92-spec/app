import { cn } from "@/lib/utils";
import { colorMeta } from "@/lib/colors";

export function ColorSwatch({ color, className }: { color: string; className?: string }) {
  const meta = colorMeta(color);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3.5 shrink-0 rounded-full border shadow-xs", className)}
      style={{ backgroundColor: meta.hex, borderColor: meta.border }}
    />
  );
}
