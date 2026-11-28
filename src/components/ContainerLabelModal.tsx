import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { useDarkMode } from "../context/DarkModeContext";

// Modal that renders a printable barcode label for a container folio.
// Encodes the folio as a CODE128 barcode and lists its contained items.
interface ContenedorEtiquetaData {
  folio: string;
  tamano?: string | null;
  fecha: string;
  items: {
    master_sku: string;
    nombre_producto: string;
    cantidad: number;
  }[];
  total_piezas: number;
}

interface ContenedorEtiquetaModalProps {
  visible: boolean;
  detail: ContenedorEtiquetaData | null;
  onClose: () => void;
}

export function ContainerLabelModal({ visible, detail, onClose }: ContenedorEtiquetaModalProps) {
  useDarkMode();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!visible || !detail || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, detail.folio, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 8,
      });
    } catch {
      // folio contains characters CODE128 can't encode, label still renders without the barcode
    }
  }, [visible, detail]);

  if (!visible || !detail) return null;

  const handlePrint = () => window.print();

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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Etiqueta de contenedor</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none px-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6">
          <div
            id="etiqueta-print-area"
            className="flex flex-col items-center gap-3 border border-gray-300 dark:border-gray-600 rounded p-4"
          >
            <p className="font-bold text-gray-900 dark:text-white text-center">{detail.folio}</p>
            {detail.tamano && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{detail.tamano}</p>
            )}
            <svg ref={svgRef} />
            <div className="w-full">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-300 dark:border-gray-600">
                    <th className="text-left py-1">MOD</th>
                    <th className="text-left py-1">Producto</th>
                    <th className="text-right py-1">Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-1 font-mono">{item.master_sku}</td>
                      <td className="py-1">{item.nombre_producto}</td>
                      <td className="py-1 text-right">{item.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-right text-sm font-bold text-gray-900 dark:text-white mt-2">
                Total: {detail.total_piezas}
              </p>
            </div>
          </div>
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
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
