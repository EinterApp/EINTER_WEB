// Modal for creating or editing a product, including image upload and
// supplier/category lookups.
import { useState, useEffect } from "react";
import { fetchAPI } from "../lib/fetch";
import type { Product } from "../lib/types";

interface ProductModalProps {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onSave: (product: Partial<Product>) => Promise<void>;
  onDelete?: () => void;
  mode: "create" | "edit";
}

interface FormData {
  sku: string;
  china_sku: string;
  name: string;
  category_id: string;
  supplier_id: string;
  description: string;
  stock: string;
  weight_kg: string;
  qty_per_carton: string;
  standard_tarima: string;
  cajas_x_tarima: string;
  no_estiba: string;
  alto: string;
  ancho: string;
  largo: string;
  considerar_modelo_matematico: boolean;
  photoUri?: string;
  photoBase64?: string;
  updated_at?: string | null;
}

const initialFormData: FormData = {
  sku: "",
  china_sku: "",
  name: "",
  category_id: "",
  supplier_id: "",
  description: "",
  stock: "",
  weight_kg: "",
  qty_per_carton: "",
  standard_tarima: "",
  cajas_x_tarima: "",
  no_estiba: "",
  alto: "",
  ancho: "",
  largo: "",
  considerar_modelo_matematico: true,
  photoUri: undefined,
  photoBase64: undefined,
  updated_at: undefined,
};

export function ProductModal({
  visible,
  product,
  onClose,
  onSave,
  onDelete,
  mode,
}: ProductModalProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [categories, setCategories] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  useEffect(() => {
    if (product && mode === "edit") {
      // Handle category - could be string, number, or object with id
      let categoryId = "";
      if (product.category) {
        if (typeof product.category === "object" && "id" in product.category) {
          categoryId = String(product.category.id);
        } else {
          categoryId = String(product.category);
        }
      }

      setFormData({
        sku: String(product.sku || ""),
        china_sku: product.china_sku || "",
        name: product.name || "",
        category_id: categoryId,
        supplier_id: String(product.supplier?.id || ""),
        description: product.description || "",
        stock: String(product.stock || ""),
        weight_kg: String(product.weight_kg || ""),
        qty_per_carton: product.qty_per_carton != null ? String(product.qty_per_carton) : "",
        standard_tarima: product.standard_tarima != null ? String(product.standard_tarima) : "",
        cajas_x_tarima: product.cajas_x_tarima != null ? String(product.cajas_x_tarima) : "",
        no_estiba: product.no_estiba != null ? String(product.no_estiba) : "",
        largo: String(product.dimensions_cm?.largo || ""),
        ancho: String(product.dimensions_cm?.ancho || ""),
        alto: String(product.dimensions_cm?.alto || ""),
        considerar_modelo_matematico: product.considerar_modelo_matematico ?? true,
        photoUri: product.photo || undefined,
        updated_at: product.updated_at,
      });
    } else {
      setFormData(initialFormData);
    }
    setError(null);
  }, [product, mode, visible]);

  const fetchSuppliers = async () => {
    setLoadingSuppliers(true);
    try {
      const data = await fetchAPI("/api/odoo/proveedores") as { items?: { id_proveedor?: number; id?: number; nombre?: string; name?: string }[] };
      const suppliersList = data.items || [];
      setSuppliers(
        suppliersList.map((supplier: { id_proveedor?: number; id?: number; nombre?: string; name?: string }) => ({
          id: supplier.id_proveedor || supplier.id || 0,
          name: supplier.nombre || supplier.name || '',
        }))
      );
    } catch (err) {
      console.error("Failed to load suppliers", err);
      setSuppliers([]);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const fetchCategories = async () => {
    setLoadingCategories(true);
    try {
      const data = await fetchAPI("/api/categorias") as { items?: { id: number; name: string }[] };
      const categoriesList = data.items || [];
      setCategories(
        categoriesList.map((category: { id: number; name: string }) => ({
          id: category.id,
          name: category.name,
        }))
      );
    } catch (err) {
      console.error("Failed to load categories", err);
      setCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchSuppliers();
      fetchCategories();
    }
  }, [visible]);

  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Resize if image is too large (max 800px width)
          if (width > 800) {
            height = Math.round((height * 800) / width);
            width = 800;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with quality 0.5 for smaller payload
          const compressed = canvas.toDataURL("image/jpeg", 0.5);
          const base64Data = compressed.split(",")[1];
          resolve(base64Data);
        };
        img.onerror = () => reject(new Error("Could not load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  };

  const pickImage = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const compressedBase64 = await compressImage(file);
        setFormData({
          ...formData,
          photoUri: file.name,
          photoBase64: compressedBase64,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error compressing image"
        );
      }
    };
    input.click();
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    if (!formData.sku.trim()) {
      setError("El MOD es obligatorio");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const productData: Partial<Product> = {
        sku: formData.sku,
        china_sku: formData.china_sku.trim() ? formData.china_sku.trim() : null,
        name: formData.name,
        category: formData.category_id,
        stock: parseFloat(formData.stock) || 0,
        weight_kg: parseFloat(formData.weight_kg) || 0,
        dimensions_cm: {
          largo: parseFloat(formData.largo) || 0,
          ancho: parseFloat(formData.ancho) || 0,
          alto: parseFloat(formData.alto) || 0,
        },
        photo: formData.photoBase64
          ? `data:image/jpeg;base64,${formData.photoBase64}`
          : formData.photoUri,
        supplier: formData.supplier_id
          ? {
              id: parseInt(formData.supplier_id),
              name:
                suppliers.find((s) => s.id === parseInt(formData.supplier_id))
                  ?.name || "",
            }
          : null,
        description: formData.description,
        qty_per_carton: formData.qty_per_carton !== "" ? parseFloat(formData.qty_per_carton) : null,
        standard_tarima: formData.standard_tarima !== "" ? parseFloat(formData.standard_tarima) : null,
        cajas_x_tarima: formData.cajas_x_tarima !== "" ? parseFloat(formData.cajas_x_tarima) : null,
        no_estiba: formData.no_estiba !== "" ? parseFloat(formData.no_estiba) : null,
        considerar_modelo_matematico: formData.considerar_modelo_matematico,
      };

      if (mode === "edit" && product) {
        productData.id = product.id;
        productData.updated_at = formData.updated_at;
      }

      await onSave(productData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-robotoMedium text-gray-800 dark:text-white">
            {mode === "create" ? "Crear Producto" : "Editar Producto"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          >
            <span className="text-gray-500 dark:text-gray-400 text-xl">✕</span>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="mb-4">
            <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
              SKU
            </label>
            <input
              type="text"
              value={formData.china_sku}
              onChange={(e) => setFormData({ ...formData, china_sku: e.target.value })}
              placeholder="SKU"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex flex-row gap-4 mb-4">
            <div className="w-24">
              <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
                MOD
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="MOD"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
                Nombre
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre del producto"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-row gap-4 mb-4">
            <div className="flex-1">
              <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
                Categoría
              </label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                disabled={loadingCategories}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white disabled:text-gray-400 dark:disabled:text-gray-500"
              >
                <option value="">{loadingCategories ? "Cargando..." : "Selecciona Categoría"}</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
                Proveedor
              </label>
              <select
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                disabled={loadingSuppliers}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white disabled:text-gray-400 dark:disabled:text-gray-500"
              >
                <option value="">{loadingSuppliers ? "Cargando..." : "Selecciona Proveedor"}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-row gap-4 mb-4">
            <div className="flex-1">
              <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
                Stock
              </label>
              <input
                type="number"
                value={formData.stock}
                onChange={(e) =>
                  setFormData({ ...formData, stock: e.target.value })
                }
                placeholder="0"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
                Peso del carton (kg)
              </label>
              <input
                type="number"
                value={formData.weight_kg}
                onChange={(e) =>
                  setFormData({ ...formData, weight_kg: e.target.value })
                }
                placeholder="0.00"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
            Dimensiones del carton (cm)
          </label>
          <div className="flex flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Altura</label>
              <input
                type="number"
                value={formData.alto}
                onChange={(e) =>
                  setFormData({ ...formData, alto: e.target.value })
                }
                placeholder="Altura"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Anchura</label>
              <input
                type="number"
                value={formData.ancho}
                onChange={(e) =>
                  setFormData({ ...formData, ancho: e.target.value })
                }
                placeholder="Anchura"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Largo</label>
              <input
                type="number"
                value={formData.largo}
                onChange={(e) =>
                  setFormData({ ...formData, largo: e.target.value })
                }
                placeholder="Largo"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
              Piezas por Cartón
            </label>
            <input
              type="number"
              value={formData.qty_per_carton}
              onChange={(e) =>
                setFormData({ ...formData, qty_per_carton: e.target.value })
              }
              placeholder="Piezas por cartón"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="mb-4">
            <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
              Piezas por Tarima
            </label>
            <input
              type="number"
              value={formData.standard_tarima}
              onChange={(e) =>
                setFormData({ ...formData, standard_tarima: e.target.value })
              }
              placeholder="Piezas por tarima"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex flex-row gap-4 mb-4">
            <div className="flex-1">
              <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
                Cajas por Tarima
              </label>
              <input
                type="number"
                value={formData.cajas_x_tarima}
                onChange={(e) =>
                  setFormData({ ...formData, cajas_x_tarima: e.target.value })
                }
                placeholder="Cajas por tarima"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
                No. de Estiba
              </label>
              <input
                type="number"
                value={formData.no_estiba}
                onChange={(e) =>
                  setFormData({ ...formData, no_estiba: e.target.value })
                }
                placeholder="Cajas apilables en altura"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="mb-6 flex flex-row items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div>
              <p className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300">
                Tomar en cuenta en modelo matemático
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Si está apagado, este producto no se considera en el cálculo de Inventario Inteligente.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.considerar_modelo_matematico}
              onClick={() =>
                setFormData({
                  ...formData,
                  considerar_modelo_matematico: !formData.considerar_modelo_matematico,
                })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                formData.considerar_modelo_matematico
                  ? "bg-blue-600"
                  : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.considerar_modelo_matematico ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="mb-6">
            <label className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2 block">
              Subir Foto
            </label>
            <button
              onClick={pickImage}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-center hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <span className="text-gray-600">
                {formData.photoUri ? "Cambiar imagen" : "Seleccionar imagen"}
              </span>
            </button>

            {(formData.photoUri || formData.photoBase64) && (
              <div className="mt-2">
                <p className="text-sm text-gray-600 mb-2">Preview</p>
                <div className="flex flex-row items-center gap-3">
                  {formData.photoBase64 && (
                    <img
                      src={`data:image/jpeg;base64,${formData.photoBase64}`}
                      alt="preview"
                      className="w-32 h-32 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 truncate">
                      {formData.photoUri || "Imagen en base64"}
                    </p>
                    <button
                      onClick={() =>
                        setFormData({
                          ...formData,
                          photoUri: undefined,
                          photoBase64: undefined,
                        })
                      }
                      className="mt-3 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-row items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {mode === "edit" && onDelete ? (
            <button
              onClick={onDelete}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50"
            >
              <span className="text-white font-robotoMedium">Eliminar</span>
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-row items-center gap-3">
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
    </div>
  );
}
