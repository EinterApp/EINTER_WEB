// Modal for creating or editing a supplier (proveedor).
import { useState, useEffect } from "react";

interface Proveedor {
  id: number;
  name: string;
  city: string;
  lead_time: number;
}

interface ProveedorModalProps {
  visible: boolean;
  proveedor: Proveedor | null;
  onClose: () => void;
  onSave: (proveedor: Partial<Proveedor>) => Promise<void>;
  mode: "create" | "edit";
}

export function SupplierModal({
  visible,
  proveedor,
  onClose,
  onSave,
  mode,
}: ProveedorModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    city: "",
    lead_time: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (proveedor && mode === "edit") {
      setFormData({
        name: proveedor.name || "",
        city: proveedor.city || "",
        lead_time: String(proveedor.lead_time || ""),
      });
    } else {
      // Reset form for create mode
      setFormData({
        name: "",
        city: "",
        lead_time: "",
      });
    }
    setError(null);
  }, [proveedor, mode, visible]);

  const handleSave = async () => {
    // Validate required fields
    if (!formData.name.trim()) {
      setError("El nombre del proveedor es obligatorio");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const proveedorData: Partial<Proveedor> & { id?: number } = {
        name: formData.name,
        city: formData.city || undefined,
        lead_time: formData.lead_time ? parseInt(formData.lead_time) : undefined,
      };

      if (mode === "edit" && proveedor) {
        proveedorData.id = proveedor.id;
      }

      await onSave(proveedorData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-robotoMedium text-gray-800 dark:text-white">
            {mode === "create" ? "Crear Proveedor" : "Editar Proveedor"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          >
            <span className="text-gray-500 dark:text-gray-400 text-xl">✕</span>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Name */}
          <div className="mb-4">
            <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
              Nombre del Proveedor *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Ej: Proveedor ABC"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* City */}
          <div className="mb-4">
            <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
              Ciudad
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              placeholder="Ej: Ciudad de México"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Lead Time */}
          <div className="mb-4">
            <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
              Tiempo de Envío (días)
            </label>
            <input
              type="number"
              value={formData.lead_time}
              onChange={(e) =>
                setFormData({ ...formData, lead_time: e.target.value })
              }
              placeholder="Ej: 5"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-row items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50"
          >
            <span className="text-gray-700 dark:text-gray-300 font-robotoMedium">Cancelar</span>
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-blue-600 disabled:opacity-50"
          >
            <span className="text-white font-robotoMedium">
              {loading ? "Guardando..." : mode === "create" ? "Crear" : "Guardar"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}