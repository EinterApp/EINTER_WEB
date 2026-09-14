// Page for recording and browsing salidas (outbound shipments/sales).
import { useState, useEffect, useCallback, useRef } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { getMonterreyYear } from "../lib/dateMx";
import { useRole } from "../hooks/useRole";

// ─── Types ────────────────────────────────────────────────────────────────────

type EstadoOrden = "draft" | "confirmado";

interface SalidaFolio {
  numero_folio: string;
  anio: number;
  categoria: string;
  fecha_orden: string | null;
  fecha_salida: string | null;
  tarimas: number | null;
  total_piezas: number;
  num_productos: number;
  estado?: EstadoOrden;
  veces_rechazado?: number;
}

interface SalidaProducto {
  master_sku: string;
  sku_thd: string | null;
  descripcion: string | null;
  nombre_articulo: string | null;
  en_catalogo: boolean;
  cantidad: number;
}

interface ArticuloAC {
  master_sku: string;
  nombre_producto: string;
}

interface ProductoFormRow {
  id: string;
  master_sku: string;
  sku_thd: string;
  cantidad: string;
  // resolved from articulos, not shown as editable
  nombre_producto: string;
  en_catalogo: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" }, { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" }, { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

const CURRENT_YEAR = getMonterreyYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val: string | null): string {
  if (!val) return "-";
  const d = new Date(val + "T00:00:00");
  return d.toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function newProductoRow(): ProductoFormRow {
  return { id: crypto.randomUUID(), master_sku: "", sku_thd: "", cantidad: "", nombre_producto: "", en_catalogo: false };
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetalleModal({ folio, onClose }: { folio: string | null; onClose: () => void }) {
  const [productos, setProductos] = useState<SalidaProducto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!folio) return;
    setLoading(true);
    setError(null);
    fetchAPI(`/api/thd/salidas/${encodeURIComponent(folio)}`)
      .then((data) => setProductos(data as SalidaProducto[]))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [folio]);

  if (!folio) return null;

  const invalidCount = productos.filter((p) => !p.en_catalogo).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Folio {folio}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Home Depot · Salida</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none px-1">×</button>
        </div>

        {invalidCount > 0 && !loading && (
          <div className="mx-6 mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded text-xs text-amber-700 dark:text-amber-400">
            {invalidCount} modelo{invalidCount !== 1 ? "s" : ""} no encontrado{invalidCount !== 1 ? "s" : ""} en el catálogo de artículos.
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Cargando productos…</span>
            </div>
          ) : error ? (
            <p className="text-center text-red-500 py-12 text-sm">{error}</p>
          ) : productos.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">
              Este folio no tiene productos registrados.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                  <th className="text-left py-2 pr-3 font-semibold text-gray-700 dark:text-gray-300 w-24">Modelo</th>
                  <th className="text-left py-2 pr-3 font-semibold text-gray-700 dark:text-gray-300 w-28">SKU THD</th>
                  <th className="text-left py-2 pr-3 font-semibold text-gray-700 dark:text-gray-300">Nombre (catálogo)</th>
                  <th className="text-right py-2 font-semibold text-gray-700 dark:text-gray-300 w-16">Cant.</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-100 dark:border-gray-700 ${
                      i % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-750"
                    } ${!p.en_catalogo ? "opacity-70" : ""}`}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">
                      <span className={p.en_catalogo ? "text-gray-700 dark:text-gray-300" : "text-amber-600 dark:text-amber-400"}>
                        {p.master_sku}
                      </span>
                      {!p.en_catalogo && (
                        <span className="ml-1 text-amber-500" title="No encontrado en catálogo">⚠</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-500 dark:text-gray-400">{p.sku_thd ?? "-"}</td>
                    <td className="py-2 pr-3 text-xs text-gray-900 dark:text-gray-100">
                      {p.nombre_articulo ?? (p.descripcion ? <span className="italic text-gray-400">{p.descripcion}</span> : "-")}
                    </td>
                    <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">{p.cantidad}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                  <td colSpan={3} className="py-2 pr-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">Total piezas:</td>
                  <td className="py-2 text-right font-bold text-gray-900 dark:text-white">
                    {productos.reduce((s, p) => s + p.cantidad, 0).toLocaleString("es-MX")}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {productos.length} producto{productos.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Row with Autocomplete ────────────────────────────────────────────

function ProductoRow({
  row,
  articulos,
  onChange,
  onRemove,
  index,
}: {
  row: ProductoFormRow;
  articulos: ArticuloAC[];
  onChange: (id: string, field: keyof ProductoFormRow, value: string) => void;
  onRemove: (id: string) => void;
  index: number;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = row.master_sku.trim().length >= 1
    ? articulos
        .filter((a) => a.master_sku.startsWith(row.master_sku.trim()) || a.master_sku.includes(row.master_sku.trim()))
        .slice(0, 8)
    : [];

  const selectArticulo = (a: ArticuloAC) => {
    onChange(row.id, "master_sku", a.master_sku);
    onChange(row.id, "nombre_producto", a.nombre_producto);
    onChange(row.id, "en_catalogo", "true");
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleModeloChange = (val: string) => {
    onChange(row.id, "master_sku", val);
    const match = articulos.find((a) => a.master_sku === val);
    onChange(row.id, "nombre_producto", match?.nombre_producto ?? "");
    onChange(row.id, "en_catalogo", match ? "true" : "false");
    setShowSuggestions(true);
  };

  const rowBg = index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-750";

  return (
    <tr className={`border-t border-gray-100 dark:border-gray-700 ${rowBg}`}>
      {/* Modelo */}
      <td className="py-1 px-1 relative">
        <input
          ref={inputRef}
          type="text"
          value={row.master_sku}
          onChange={(e) => handleModeloChange(e.target.value)}
          onFocus={() => setShowSuggestions(row.master_sku.length >= 1)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="12345"
          className={`w-full border px-2 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
            row.master_sku && !row.en_catalogo
              ? "border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20"
              : "border-gray-300 dark:border-gray-600 bg-white"
          }`}
        />
        {/* Validation badge */}
        {row.master_sku && (
          <span
            className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${
              row.en_catalogo ? "text-green-500" : "text-amber-500"
            }`}
            title={row.en_catalogo ? row.nombre_producto : "No encontrado en catálogo"}
          >
            {row.en_catalogo ? "✓" : "⚠"}
          </span>
        )}
        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-50 left-0 top-full mt-0.5 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto text-xs">
            {suggestions.map((a) => (
              <li
                key={a.master_sku}
                onMouseDown={() => selectArticulo(a)}
                className="px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 flex gap-2"
              >
                <span className="font-mono font-semibold text-gray-700 dark:text-gray-300 w-16 shrink-0">{a.master_sku}</span>
                <span className="text-gray-500 dark:text-gray-400 truncate">{a.nombre_producto}</span>
              </li>
            ))}
          </ul>
        )}
      </td>
      {/* Nombre (readonly, from articulos) */}
      <td className="py-1 px-1">
        <span className={`block text-xs px-2 py-1 truncate ${
          row.en_catalogo ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-500 italic"
        }`} title={row.nombre_producto}>
          {row.nombre_producto || "-"}
        </span>
      </td>
      {/* SKU THD */}
      <td className="py-1 px-1">
        <input
          type="text"
          value={row.sku_thd}
          onChange={(e) => onChange(row.id, "sku_thd", e.target.value)}
          placeholder="THD-SKU"
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>
      {/* Cantidad */}
      <td className="py-1 px-1">
        <input
          type="number"
          value={row.cantidad}
          onChange={(e) => onChange(row.id, "cantidad", e.target.value)}
          placeholder="0"
          min={1}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 text-xs rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>
      {/* Remove */}
      <td className="py-1 px-1 text-center">
        <button
          type="button"
          onClick={() => onRemove(row.id)}
          className="text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors text-sm leading-none"
          title="Eliminar fila"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

// ─── Form Modal (Create / Edit) ───────────────────────────────────────────────

interface SalidaFormData {
  numero_folio: string;
  fecha_orden: string;
  fecha_salida: string;
  anio: string;
  productos: ProductoFormRow[];
}

function SalidaFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: SalidaFormData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { isSuperAdmin } = useRole();
  const [form, setForm] = useState<SalidaFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [articulos, setArticulos] = useState<ArticuloAC[]>([]);
  const [reviewEstado, setReviewEstado] = useState<EstadoOrden | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAPI("/api/thd/articulos")
      .then((data) => setArticulos(data as ArticuloAC[]))
      .catch(() => {/* non-fatal */});
  }, []);

  const addProducto = () => {
    setForm((f) => ({ ...f, productos: [...f.productos, newProductoRow()] }));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const removeProducto = (id: string) =>
    setForm((f) => ({ ...f, productos: f.productos.filter((p) => p.id !== id) }));

  const updateProducto = (id: string, field: keyof ProductoFormRow, value: string) =>
    setForm((f) => ({
      ...f,
      productos: f.productos.map((p) =>
        p.id === id ? { ...p, [field]: field === "en_catalogo" ? (value === "true") as unknown as string : value } : p
      ),
    }));

  const validateForm = (): boolean => {
    setFormError(null);
    if (!form.numero_folio.trim()) { setFormError("El número de folio es requerido."); return false; }
    if (!form.anio || isNaN(Number(form.anio))) { setFormError("El año es requerido."); return false; }

    const validProductos = form.productos.filter((p) => p.master_sku.trim() !== "");
    if (validProductos.length === 0) { setFormError("Agrega al menos un producto con Modelo."); return false; }
    for (const p of validProductos) {
      const cant = Number(p.cantidad);
      if (!Number.isInteger(cant) || cant <= 0) {
        setFormError(`La cantidad del modelo "${p.master_sku}" debe ser un entero mayor a 0.`);
        return false;
      }
    }
    return true;
  };

  const handleReviewClick = (estado: EstadoOrden) => {
    if (!validateForm()) return;
    setReviewEstado(estado);
  };

  const handleSubmit = async (estado: EstadoOrden) => {
    if (!validateForm()) return;

    const validProductos = form.productos.filter((p) => p.master_sku.trim() !== "");
    const payload = {
      numero_folio: form.numero_folio.trim(),
      fecha_orden:  form.fecha_orden  || null,
      fecha_salida: form.fecha_salida || null,
      anio:         Number(form.anio),
      categoria:    "baños",
      tarimas:      null,
      estado,
      productos:    validProductos.map((p) => ({
        master_sku:  p.master_sku.trim(),
        sku_thd:     p.sku_thd.trim() || null,
        descripcion: p.nombre_producto || null,
        cantidad:    Number(p.cantidad),
      })),
    };

    setSaving(true);
    try {
      if (mode === "create") {
        await fetchAPI("/api/thd/salidas", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await fetchAPI(`/api/thd/salidas/${encodeURIComponent(form.numero_folio.trim())}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      setReviewEstado(null);
      onSaved();
    } catch (err: unknown) {
      setFormError((err as Error).message);
      setReviewEstado(null);
    } finally {
      setSaving(false);
    }
  };

  const invalidCount = form.productos.filter((p) => p.master_sku.trim() && !p.en_catalogo).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl mx-4 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {mode === "create" ? "Nueva Salida" : `Editar Folio ${form.numero_folio}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none px-1">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Folio + Año */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Folio <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.numero_folio}
                onChange={(e) => setForm((f) => ({ ...f, numero_folio: e.target.value }))}
                disabled={mode === "edit"}
                placeholder="295"
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Año <span className="text-red-500">*</span>
              </label>
              <select
                value={form.anio}
                onChange={(e) => setForm((f) => ({ ...f, anio: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {AVAILABLE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Generación</label>
              <input
                type="date"
                value={form.fecha_orden}
                onChange={(e) => setForm((f) => ({ ...f, fecha_orden: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Salida</label>
              <input
                type="date"
                value={form.fecha_salida}
                onChange={(e) => setForm((f) => ({ ...f, fecha_salida: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Productos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Productos <span className="text-red-500">*</span>
                </label>
                {invalidCount > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠ {invalidCount} modelo{invalidCount !== 1 ? "s" : ""} sin coincidencia en catálogo
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={addProducto}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                + Agregar
              </button>
            </div>

            {form.productos.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">
                Sin productos. Haz clic en "+ Agregar".
              </p>
            ) : (
              <div className="border border-gray-200 dark:border-gray-600 rounded overflow-visible">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="text-left py-2 px-2 font-semibold text-gray-700 dark:text-gray-300 w-28">Modelo *</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-700 dark:text-gray-300">Nombre</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-700 dark:text-gray-300 w-28">SKU THD</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-700 dark:text-gray-300 w-20">Cant. *</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.productos.map((p, i) => (
                      <ProductoRow
                        key={p.id}
                        row={p}
                        articulos={articulos}
                        onChange={updateProducto}
                        onRemove={removeProducto}
                        index={i}
                      />
                    ))}
                  </tbody>
                </table>
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
          {!isSuperAdmin && (
            <button
              onClick={() => handleReviewClick("draft")}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm transition-colors disabled:opacity-50"
            >
              Guardar (borrador)
            </button>
          )}
          <button
            onClick={() => handleReviewClick("confirmado")}
            disabled={saving}
            className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando…</>
            ) : (isSuperAdmin ? "Guardar" : "Confirmar")}
          </button>
        </div>
      </div>

      {/* Review popup (read-only, "¿Estás seguro/a?") */}
      {reviewEstado && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {reviewEstado === "confirmado" ? "Confirmar salida" : "Guardar como borrador"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Revisa la información antes de continuar. Esta vista no es editable.
              </p>
              <div className="mt-4 space-y-2 text-sm bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Folio</span>
                  <span className="font-medium text-gray-900 dark:text-white">{form.numero_folio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Año</span>
                  <span className="font-medium text-gray-900 dark:text-white">{form.anio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Fecha salida</span>
                  <span className="font-medium text-gray-900 dark:text-white">{form.fecha_salida || "-"}</span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                  <span className="text-gray-500 dark:text-gray-400 block mb-1">Productos</span>
                  <ul className="space-y-0.5">
                    {form.productos.filter((p) => p.master_sku.trim()).map((p) => (
                      <li key={p.id} className="flex justify-between text-gray-800 dark:text-gray-200">
                        <span className="font-mono">{p.master_sku}</span>
                        <span>{p.cantidad}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">¿Estás seguro/a?</p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setReviewEstado(null)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSubmit(reviewEstado)}
                disabled={saving}
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando…</>
                ) : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Salidas() {
  useDarkMode();
  const { isSuperAdmin } = useRole();

  const [salidas, setSalidas] = useState<SalidaFolio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterYear, setFilterYear] = useState<number | "">(CURRENT_YEAR);
  const [filterMonth, setFilterMonth] = useState<number | "">("");
  const [searchFolio, setSearchFolio] = useState("");

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [detailFolio, setDetailFolio] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formVisible, setFormVisible] = useState(false);
  const [formInitial, setFormInitial] = useState<SalidaFormData>({
    numero_folio: "", fecha_orden: "", fecha_salida: "",
    anio: String(CURRENT_YEAR), productos: [newProductoRow()],
  });

  const [deleteFolio, setDeleteFolio] = useState<SalidaFolio | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [confirmandoFolio, setConfirmandoFolio] = useState<string | null>(null);
  const [botandoFolio, setBotandoFolio] = useState<string | null>(null);

  const fetchSalidas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterYear !== "") params.set("anio", String(filterYear));
      if (filterMonth !== "") params.set("mes", String(filterMonth));
      const data = (await fetchAPI(`/api/thd/salidas?${params}`)) as SalidaFolio[];
      setSalidas(data);
      setPage(1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterMonth]);

  useEffect(() => { fetchSalidas(); }, [fetchSalidas]);

  useRefetchOnFocus(fetchSalidas);

  const filtered = salidas.filter((s) =>
    searchFolio === "" || s.numero_folio.includes(searchFolio.trim())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleOpenCreate = () => {
    setFormInitial({
      numero_folio: "",
      fecha_orden: "", fecha_salida: "",
      anio: String(filterYear !== "" ? filterYear : CURRENT_YEAR),
      productos: [newProductoRow()],
    });
    setFormMode("create");
    setFormVisible(true);
  };

  const handleOpenEdit = async (s: SalidaFolio) => {
    let productos: ProductoFormRow[] = [newProductoRow()];
    try {
      const data = (await fetchAPI(`/api/thd/salidas/${encodeURIComponent(s.numero_folio)}`)) as SalidaProducto[];
      if (data.length > 0) {
        productos = data.map((p) => ({
          id: crypto.randomUUID(),
          master_sku: p.master_sku,
          sku_thd: p.sku_thd ?? "",
          cantidad: String(p.cantidad),
          nombre_producto: p.nombre_articulo ?? p.descripcion ?? "",
          en_catalogo: p.en_catalogo,
        }));
      }
    } catch { /* start with empty row */ }
    setFormInitial({
      numero_folio: s.numero_folio,
      fecha_orden: s.fecha_orden ?? "",
      fecha_salida: s.fecha_salida ?? "",
      anio: String(s.anio),
      productos,
    });
    setFormMode("edit");
    setFormVisible(true);
  };

  const handleConfirmarSalida = async (folio: string) => {
    setConfirmandoFolio(folio);
    try {
      await fetchAPI(`/api/thd/salidas/${encodeURIComponent(folio)}/confirmar`, { method: "PATCH" });
      fetchSalidas();
    } catch {
      /* toast pattern not present in this page; silently retry via table refresh */
    } finally {
      setConfirmandoFolio(null);
    }
  };

  const handleBotarSalida = async (folio: string) => {
    setBotandoFolio(folio);
    try {
      await fetchAPI(`/api/thd/salidas/${encodeURIComponent(folio)}/botar`, { method: "PATCH" });
      fetchSalidas();
    } catch {
      /* ignore */
    } finally {
      setBotandoFolio(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteFolio) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await fetchAPI(`/api/thd/salidas/${encodeURIComponent(deleteFolio.numero_folio)}`, { method: "DELETE" });
      setDeleteFolio(null);
      fetchSalidas();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
          <div className="flex flex-row items-center justify-between">
            <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">Salidas · Home Depot</h1>
            <button
              onClick={handleOpenCreate}
              className="px-6 py-2 border border-black dark:border-white hover:bg-black dark:hover:bg-white hover:text-white dark:hover:text-black transition-colors text-sm font-medium text-gray-900 dark:text-white"
            >
              + Nueva Salida
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 mt-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Año</label>
              <select
                value={filterYear}
                onChange={(e) => { setFilterYear(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Todos los años</option>
                {AVAILABLE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Mes</label>
              <select
                value={filterMonth}
                onChange={(e) => { setFilterMonth(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Todos los meses</option>
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Folio</label>
              <input
                type="text"
                value={searchFolio}
                onChange={(e) => { setSearchFolio(e.target.value); setPage(1); }}
                placeholder="Buscar folio…"
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm rounded w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {(filterYear !== "" || filterMonth !== "" || searchFolio !== "") && (
              <button
                onClick={() => { setFilterYear(CURRENT_YEAR); setFilterMonth(""); setSearchFolio(""); setPage(1); }}
                className="self-end px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 mb-6 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_6rem_7rem_6rem] bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600">
            {["Folio", "Fecha Generación", "Fecha Salida", "Año", "Total Piezas", "Acciones"].map((h) => (
              <div key={h} className="py-4 px-3 text-center font-bold text-gray-700 dark:text-gray-300 text-sm border-r border-gray-300 dark:border-gray-600 last:border-r-0">
                {h}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                <p className="text-gray-500 text-sm">Cargando salidas…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-red-500 font-medium">Error al cargar salidas</p>
                <p className="text-gray-400 text-sm mt-1">{error}</p>
                <button onClick={fetchSalidas} className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline">Reintentar</button>
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-gray-500 text-sm">
                  {salidas.length > 0 ? "No hay resultados para los filtros aplicados." : "No hay salidas registradas."}
                </p>
              </div>
            ) : (
              paginated.map((s, i) => (
                <div
                  key={s.numero_folio}
                  className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_6rem_7rem_6rem] border-b border-gray-200 dark:border-gray-700 ${
                    i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"
                  } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                >
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center">
                    <button
                      onClick={() => setDetailFolio(s.numero_folio)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:underline font-semibold text-base transition-colors"
                      title={`Ver ${s.num_productos} productos`}
                    >
                      {s.numero_folio}
                    </button>
                  </div>
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center text-sm text-gray-700 dark:text-gray-300">
                    {formatDate(s.fecha_orden)}
                  </div>
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center text-sm text-gray-700 dark:text-gray-300">
                    {formatDate(s.fecha_salida)}
                  </div>
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center text-sm text-gray-700 dark:text-gray-300">
                    {s.anio}
                  </div>
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center font-semibold text-sm text-gray-900 dark:text-white">
                    {s.total_piezas.toLocaleString("es-MX")}
                  </div>
                  <div className="py-3 px-2 flex items-center justify-center gap-1">
                    {isSuperAdmin ? (
                      <>
                        {s.estado === "confirmado" && (
                          <button
                            onClick={() => handleBotarSalida(s.numero_folio)}
                            disabled={botandoFolio === s.numero_folio}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors disabled:opacity-50"
                            title="Botar salida (regresa a borrador)"
                          >
                            {botandoFolio === s.numero_folio ? "…" : "⛔ Botar"}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm"
                          title={`Editar folio — botada ${s.veces_rechazado ?? 0} veces`}
                        >
                          ✏️
                        </button>
                        {(s.veces_rechazado ?? 0) > 0 && (
                          <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold" title="Veces botada">
                            ×{s.veces_rechazado}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        {s.estado === "draft" && (
                          <button
                            onClick={() => handleConfirmarSalida(s.numero_folio)}
                            disabled={confirmandoFolio === s.numero_folio}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors disabled:opacity-50"
                            title="Confirmar salida"
                          >
                            {confirmandoFolio === s.numero_folio ? "…" : "✓ Confirmar"}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm"
                          title="Editar folio"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => { setDeleteError(null); setDeleteFolio(s); }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-sm"
                          title="Eliminar folio"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {!loading && !error && filtered.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400 text-sm">
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} folios
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${page === 1 ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                >
                  Anterior
                </button>
                <span className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm">Página {page} de {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${page >= totalPages ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detailFolio && <DetalleModal folio={detailFolio} onClose={() => setDetailFolio(null)} />}

      {formVisible && (
        <SalidaFormModal
          mode={formMode}
          initial={formInitial}
          onClose={() => setFormVisible(false)}
          onSaved={() => { setFormVisible(false); fetchSalidas(); }}
        />
      )}

      {deleteFolio && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Eliminar Folio {deleteFolio.numero_folio}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                ¿Seguro que deseas eliminar todos los registros de la salida{" "}
                <span className="font-semibold text-gray-900 dark:text-white">Folio {deleteFolio.numero_folio}</span>{" "}
                ({deleteFolio.num_productos} producto{deleteFolio.num_productos !== 1 ? "s" : ""},{" "}
                {deleteFolio.total_piezas.toLocaleString("es-MX")} piezas)? Esta acción no se puede deshacer.
              </p>
              {deleteError && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{deleteError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setDeleteFolio(null)}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleteLoading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Eliminando…</>
                ) : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
