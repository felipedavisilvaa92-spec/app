import { Badge } from "@/components/ui/badge";
import type { MovementKind } from "@/lib/types";

export function TypeBadge({ kind }: { kind: MovementKind }) {
  const isEntrada = kind === "entrada";
  return (
    <Badge
      data-testid={`badge-movement-${kind}`}
      className={
        isEntrada
          ? "border-transparent bg-[#DCFCE7] text-[#14532D] hover:bg-[#DCFCE7]"
          : "border-transparent bg-[#FEE2E2] text-[#7F1D1D] hover:bg-[#FEE2E2]"
      }
    >
      {isEntrada ? "Entrada" : "Saída"}
    </Badge>
  );
}

export function QuantityDelta({ kind, quantity }: { kind: MovementKind; quantity: number }) {
  return (
    <span className={`font-mono font-medium ${kind === "entrada" ? "text-emerald-700" : "text-red-700"}`}>
      {kind === "entrada" ? "+" : "-"}
      {quantity}
    </span>
  );
}
