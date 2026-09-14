// Merma page: register inventory loss/waste against a product and a reason,
// discounting stock automatically. SuperAdmin can manage the reason catalog.
import { useEffect, useState } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { useRole } from "../hooks/useRole";
import { SkuCombobox, type SkuOption } from "../components/SkuCombobox";

interface MermaRow {
  id_merma: number;
  id_articulo: number;
  sku: string;
  producto_nombre: string;
  cantidad: number;
  motivo: string;
  folio_recibo: string | null;
  notas: string | null;
  usuario_nombre: string | null;
  fecha_registro: string;
}

interface Razon {
  id_razon: number;
  nombre: string;
}

function GestionarRazonesModal({
  razones, onClose, onChanged,
}: {
  razones: Razon[]; onClose: () => void; onChanged: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleAdd = async () => {
    if (!nombre.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await fetchAPI("/api/merma/razones", {
        method: "POST",
        body: JSON.stringify({ nombre: nombre.trim() }),
      });
      setNombre("");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id_razon: number) => {
    if (!window.confirm("¿Desactivar esta razón? Ya no aparecerá para nuevas mermas.")) return;
    setDeletingId(id_razon);
    try {
      await fetchAPI(`/api/merma/razones/${id_razon}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-medium text-gray-900 dark:text-white">Razones de merma</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-600 text-red-800 dark:text-red-200 text-sm">
              {error}
            </div>
          )}
          <div className="space-y-1 max-h-60 overflow-auto">
            {razones.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin razones activas.</p>
            ) : razones.map((r) => (
              <div key={r.id_razon} className="flex items-center justify-between py-1.5 px-3 rounded bg-gray-50 dark:bg-gray-900/40 text-sm">
                <span className="text-gray-800 dark:text-gray-200">{r.nombre}</span>
                <button onClick={() => handleDelete(r.id_razon)} disabled={deletingId === r.id_razon}
                  className="text-gray-400 hover:text-red-500 transition-colors text-xs disabled:opacity-50">
                  {deletingId === r.id_razon ? "…" : "Desactivar"}
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Nueva razón…"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50">
              {saving ? "…" : "Agregar"}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

export function Merma() {
  useDarkMode();
  const { isSuperAdmin } = useRole();

  const [rows, setRows] = useState<MermaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [razones, setRazones] = useState<Razon[]>([]);
  const [productos, setProductos] = useState<SkuOption[]>([]);
  const [productosLoading, setProductosLoading] = useState(false);
  const [skuToId, setSkuToId] = useState<Record<string, number>>({});

  const [createVisible, setCreateVisible] = useState(false);
  const [sku, setSku] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [folioRecibo, setFolioRecibo] = useState("");
  const [notas, setNotas] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [nuevaRazon, setNuevaRazon] = useState("");
  const [showNuevaRazon, setShowNuevaRazon] = useState(false);
  const [razonSaving, setRazonSaving] = useState(false);

  const [deleteRow, setDeleteRow] = useState<MermaRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [gestionarRazonesVisible, setGestionarRazonesVisible] = useState(false);

  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    fetchAPI("/api/merma/razones")
      .then((raw) => setRazones(raw as Razon[]))
      .catch(() => {/* non-fatal */});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAPI("/api/merma?pageSize=200")
      .then((raw) => { if (!cancelled) setRows((raw as { items: MermaRow[] }).items ?? []); })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const loadRazones = () => {
    fetchAPI("/api/merma/razones")
      .then((raw) => setRazones(raw as Razon[]))
      .catch(() => {/* non-fatal */});
  };

  const loadProductos = () => {
    if (productos.length > 0) return;
    setProductosLoading(true);
    fetchAPI("/api/productos?pageSize=100000")
      .then((raw) => {
        const items = (raw as { items: { id: number; sku: string; name: string }[] }).items ?? [];
        setProductos(items.map((p) => ({ sku: p.sku, name: p.name ?? "" })));
        setSkuToId(Object.fromEntries(items.map((p) => [p.sku, p.id])));
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setProductosLoading(false));
  };

  const openCreate = () => {
    setSku(""); setCantidad(""); setMotivo(""); setFolioRecibo(""); setNotas("");
    setCreateError(null); setShowNuevaRazon(false); setNuevaRazon("");
    setCreateVisible(true);
    loadRazones();
    loadProductos();
  };

  const handleAddRazon = async () => {
    if (!nuevaRazon.trim()) return;
    setRazonSaving(true);
    try {
      const created = (await fetchAPI("/api/merma/razones", {
        method: "POST",
        body: JSON.stringify({ nombre: nuevaRazon.trim() }),
      })) as Razon;
      setRazones((prev) => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      setMotivo(created.nombre);
      setNuevaRazon("");
      setShowNuevaRazon(false);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setRazonSaving(false);
    }
  };

  const handleCreate = async () => {
    setCreateError(null);
    const id_articulo = skuToId[sku];
    if (!id_articulo) { setCreateError("Selecciona un producto válido."); return; }
    const cant = Number(cantidad);
    if (!cant || cant <= 0) { setCreateError("Cantidad inválida."); return; }
    if (!motivo) { setCreateError("Selecciona una razón."); return; }

    setCreateLoading(true);
    try {
      await fetchAPI("/api/merma", {
        method: "POST",
        body: JSON.stringify({
          id_articulo, cantidad: cant, motivo,
          folio_recibo: folioRecibo.trim() || null,
          notas: notas.trim() || null,
        }),
      });
      setCreateVisible(false);
      setToast({ ok: true, text: "Merma registrada y descontada del inventario." });
      setReload((c) => c + 1);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    setDeleteLoading(true);
    try {
      await fetchAPI(`/api/merma/${deleteRow.id_merma}`, { method: "DELETE" });
      setToast({ ok: true, text: "Merma eliminada y stock restaurado." });
      setDeleteRow(null);
      setReload((c) => c + 1);
    } catch (err) {
      setToast({ ok: false, text: (err as Error).message });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">Merma</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Registra pérdidas de inventario; se descuenta automáticamente del stock.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <button
              onClick={() => setGestionarRazonesVisible(true)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              ⚙️ Razones
            </button>
          )}
          <button
            onClick={openCreate}
            className="px-6 py-2 border border-black dark:border-white hover:bg-black dark:hover:bg-white hover:text-white dark:hover:text-black transition-colors text-sm font-medium text-gray-900 dark:text-white"
          >
            + Nueva Merma
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 mb-8 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
        <div className="grid grid-cols-[9rem_1fr_6rem_10rem_8rem_9rem_4rem] bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600 text-center">Fecha</div>
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600 text-center">Producto</div>
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600 text-center">Cant.</div>
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600 text-center">Razón</div>
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600 text-center">Folio</div>
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600 text-center">Usuario</div>
          <div className="py-3 px-3 text-center">Acciones</div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20 text-red-500">{error}</div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-500 dark:text-gray-400">
              Sin mermas registradas
            </div>
          ) : (
            rows.map((r, idx) => (
              <div
                key={r.id_merma}
                className={`grid grid-cols-[9rem_1fr_6rem_10rem_8rem_9rem_4rem] border-b border-gray-200 dark:border-gray-700 ${
                  idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/40"
                }`}
              >
                <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-xs text-gray-600 dark:text-gray-400">
                  {formatDate(r.fecha_registro)}
                </div>
                <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center text-sm truncate" title={r.producto_nombre}>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{r.sku}</span>
                  {r.producto_nombre}
                </div>
                <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm font-semibold">
                  {r.cantidad}
                </div>
                <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
                    {r.motivo}
                  </span>
                </div>
                <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm text-gray-600 dark:text-gray-400">
                  {r.folio_recibo || "-"}
                </div>
                <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm text-gray-600 dark:text-gray-400 truncate">
                  {r.usuario_nombre || "-"}
                </div>
                <div className="py-3 px-3 flex items-center justify-center">
                  <button
                    onClick={() => setDeleteRow(r)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-sm"
                    title="Eliminar (restaura stock)"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm w-full p-4 rounded-lg shadow-lg border ${
            toast.ok
              ? "bg-green-50 dark:bg-green-900/80 border-green-300 dark:border-green-600 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-900/80 border-red-300 dark:border-red-600 text-red-800 dark:text-red-200"
          }`}
        >
          <span className="text-sm">{toast.text}</span>
        </div>
      )}

      {/* Create modal */}
      {createVisible && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-medium text-gray-900 dark:text-white">Nueva Merma</h2>
              <button onClick={() => setCreateVisible(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {createError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-600 text-red-800 dark:text-red-200 text-sm">
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Producto <span className="text-red-500">*</span></label>
                <SkuCombobox value={sku} onChange={setSku} options={productos} loading={productosLoading} invalid={false} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Cantidad <span className="text-red-500">*</span></label>
                <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Razón <span className="text-red-500">*</span></label>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                  <option value="">Selecciona una razón…</option>
                  {razones.map((r) => (
                    <option key={r.id_razon} value={r.nombre}>{r.nombre}</option>
                  ))}
                </select>
                {isSuperAdmin && !showNuevaRazon && (
                  <button type="button" onClick={() => setShowNuevaRazon(true)}
                    className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                    + Agregar nueva razón
                  </button>
                )}
                {isSuperAdmin && showNuevaRazon && (
                  <div className="mt-2 flex gap-2">
                    <input value={nuevaRazon} onChange={(e) => setNuevaRazon(e.target.value)}
                      placeholder="Nombre de la nueva razón"
                      className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs" />
                    <button type="button" onClick={handleAddRazon} disabled={razonSaving}
                      className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white disabled:opacity-50">
                      {razonSaving ? "…" : "Agregar"}
                    </button>
                    <button type="button" onClick={() => setShowNuevaRazon(false)}
                      className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Folio recibo</label>
                  <input value={folioRecibo} onChange={(e) => setFolioRecibo(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
                  <input value={notas} onChange={(e) => setNotas(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setCreateVisible(false)} disabled={createLoading}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={createLoading}
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50">
                {createLoading ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteRow && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Eliminar merma</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                ¿Seguro que deseas eliminar esta merma de <span className="font-semibold text-gray-900 dark:text-white">{deleteRow.cantidad}</span> pza(s) de{" "}
                <span className="font-semibold text-gray-900 dark:text-white">{deleteRow.producto_nombre}</span>? Esto restaura el stock descontado.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setDeleteRow(null)} disabled={deleteLoading}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-50">
                {deleteLoading ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {gestionarRazonesVisible && (
        <GestionarRazonesModal
          razones={razones}
          onClose={() => setGestionarRazonesVisible(false)}
          onChanged={loadRazones}
        />
      )}
    </div>
  );
}
