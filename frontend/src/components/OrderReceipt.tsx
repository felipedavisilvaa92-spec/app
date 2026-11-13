import { colorMeta, productName } from "@/lib/colors";
import { formatDateTime } from "@/lib/format";
import type { Order } from "@/lib/types";

// Comprovante do pedido: some da tela (print-only) e aparece limpo na impressão (@media print).
export default function OrderReceipt({ order }: { order: Order }) {
  const total = order.items.reduce((acc, item) => acc + item.quantity, 0);
  const pickedTotal = order.items.reduce((acc, item) => acc + (item.picked ? item.quantity : 0), 0);

  return (
    <div className="print-only bg-white p-8 text-black" data-testid="print-receipt">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em]">Comprovante de Pedido</p>
        <div className="mt-1 flex items-baseline justify-between border-b-2 border-black pb-2">
          <h1 className="font-heading text-3xl font-bold">
            Pedido #{String(order.number).padStart(3, "0")}
          </h1>
          <span className="font-mono text-sm">{formatDateTime(order.created_at)}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <p>
            <span className="font-semibold">Comprador:</span> {order.comprador}
          </p>
          <p>
            <span className="font-semibold">Separador:</span> {order.separador}
          </p>
        </div>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1.5">Item</th>
              <th className="py-1.5">Tam.</th>
              <th className="py-1.5 text-right">Qtd.</th>
              <th className="py-1.5 text-center">Separado</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-400">
                <td className="py-1.5">
                  {productName(item.product_type)} {colorMeta(item.color).name}
                </td>
                <td className="py-1.5">{item.size}</td>
                <td className="py-1.5 text-right font-mono">{item.quantity}</td>
                <td className="py-1.5 text-center font-mono">{item.picked ? "X" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-right font-mono text-sm font-semibold">
          Total de peças: {total}
          {pickedTotal !== total ? ` (separadas: ${pickedTotal})` : ""}
        </p>

        <div className="mt-20 border-t border-black pt-1 text-center text-xs">
          Assinatura de conferência
        </div>
      </div>
    </div>
  );
}
