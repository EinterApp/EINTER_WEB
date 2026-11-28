import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { fetchAPI } from "../lib/fetch";
import { useDarkMode } from "../context/DarkModeContext";

// Modal that renders a printable barcode label for a tarima (pallet), listing
// the cartones it contains. Fetches its own cartones from GET
// /api/pallets/:id/cartons given just the tarima's id, so any caller that
// already has a tarima row (from a search or from a real list) can use it
// directly without pre-fetching anything itself.
export interface TarimaRef {
  id_tarima: number;
  sku: string;
  isla_master_sku?: string | null;
}

interface CartonRow {
  sku: string;
  nombre_producto: string;
  cantidad_unidades: number;
}

interface TarimaEtiquetaModalProps {
  visible: boolean;
  tarima: TarimaRef | null;
  onClose: () => void;
}

export function PalletLabelModal({ visible, tarima, onClose }: TarimaEtiquetaModalProps) {
  useDarkMode();
  const svgRef = useRef<SVGSVGElement>(null);
  const [cartones, setCartones] = useState<CartonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !tarima) return;
    setCartones([]);
    setError(null);
    setLoading(true);
    fetchAPI(`/api/pallets/${tarima.id_tarima}/cartons`)
      .then((res: unknown) => {
        const data = res as { items?: CartonRow[] };
        setCartones(data.items ?? []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [visible, tarima]);

  useEffect(() => {
    if (!tarima || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, tarima.sku, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 8,
      });
    } catch {
      // sku contains characters CODE128 can't encode, label still renders without the barcode
    }
  }, [tarima]);

  if (!visible || !tarima) return null;

  const handlePrint = () => window.print();
  const totalUnidades = cartones.reduce((sum, c) => sum + c.cantidad_unidades, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Etiqueta de tarima</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none px-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando cartones...</p>
            </div>
          ) : error ? (
            <p className="text-center text-red-500 py-8 text-sm">{error}</p>
          ) : (
            <div
              id="etiqueta-print-area"
              className="flex flex-col items-center gap-3 border border-gray-300 dark:border-gray-600 rounded p-4"
            >
              <p className="font-bold text-gray-900 dark:text-white text-center">{tarima.sku}</p>
              {tarima.isla_master_sku && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Isla: {tarima.isla_master_sku}</p>
              )}
              <svg ref={svgRef} />
              <div className="w-full">
                {cartones.length === 0 ? (
                  <p className="text-center text-sm text-gray-400">Sin cartones registrados</p>
                ) : (
                  <>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-300 dark:border-gray-600">
                          <th className="text-left py-1">Cartón</th>
                          <th className="text-left py-1">Producto</th>
                          <th className="text-right py-1">Cant.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cartones.map((c, idx) => (
                          <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                            <td className="py-1 font-mono">{c.sku}</td>
                            <td className="py-1">{c.nombre_producto}</td>
                            <td className="py-1 text-right">{c.cantidad_unidades}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-right text-sm font-bold text-gray-900 dark:text-white mt-2">
                      Total: {totalUnidades}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            disabled={loading || cartones.length === 0}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
