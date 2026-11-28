// Category management page: master-detail view listing categories and the
// products assigned to the selected one.
import React, { useState, useEffect } from "react";
import { fetchAPI } from "../lib/fetch";
import { useDarkMode } from "../context/DarkModeContext";
import { CategoryModal } from "../components/CategoryModal";
import { DeleteConfirmModal } from "../components/DeleteCategoryConfirmModal";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";

type Product = {
  id: number;
  name: string;
  sku: string;
  stock: number;
  children?: Product[];
};

type Category = {
  id: number;
  name: string;
  products: Product[];
};


interface AccordionItemProps {
  title: string;
  products: Product[];
  open: boolean;
}

const AccordionItem: React.FC<AccordionItemProps> = ({
  title,
  products,
  open,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header de la categoría */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
        <h3 className="text-lg font-medium text-gray-800 dark:text-white">{title}</h3>
      </div>

      {open && (
        <div className="p-6">
          {/* Lista de productos en tabla */}
          <div className="overflow-x-auto">
            {products.length > 0 ? (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                    <th className="text-left px-4 py-3 font-semibold text-black dark:text-white text-sm">Producto</th>
                    <th className="text-left px-4 py-3 font-semibold text-black dark:text-white text-sm">MOD</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, index) => (
                    <tr
                      key={p.id ? `product-${p.id}` : `product-${index}`}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-4 py-4 text-black dark:text-white">
                        {p.name}
                      </td>
                      <td className="px-4 py-4 text-black dark:text-white">
                        {p.sku}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center">
                <p className="text-gray-500 dark:text-gray-400 italic">
                  No hay productos en esta categoría
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export function Categorias() {
  useDarkMode(); // Initialize dark mode context
  const [data, setData] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar solo categorías
      const categoriesData = await fetchAPI("/api/categories?page=1&pageSize=100") as { items?: { id: number; name: string }[] };
      const categories = categoriesData.items || [];

      // Crear estructura de categorías sin productos
      const categoriesWithoutProducts: Category[] = categories.map((cat: { id: number; name: string }) => ({
        id: cat.id,
        name: cat.name,
        products: [],
      }));

      setData(categoriesWithoutProducts);
    } catch (err) {
      console.error("Failed to load categories", err);
      setError(err instanceof Error ? err.message : "Error al cargar categorías");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useRefetchOnFocus(loadData);

  const handleCategorySelect = async (categoryId: number) => {
    // Toggle off if the same category is clicked again
    if (selectedId === categoryId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(categoryId || null);

    // Si ya cargamos sus productos antes, no volvemos a pedirlos
    const existing = data.find((c) => c.id === categoryId);
    if (existing && existing.products.length > 0) return;

    // Cargar productos de la categoría seleccionada
    try {
      setLoadingCategory(true);
      const categoryData = await fetchAPI(`/api/categories/${categoryId}`) as { productos?: Record<string, unknown>[]; products?: Record<string, unknown>[]; items?: Record<string, unknown>[]; data?: Record<string, unknown>[] };
      const products = categoryData.productos || categoryData.products || categoryData.items || categoryData.data || [];
      
      setData((prevData) =>
        prevData.map((cat) =>
          cat.id === categoryId
            ? {
                ...cat,
                products: products.map((p: Record<string, unknown>) => ({
                  id: Number(p.id_articulo || p.id) || 0,
                  name: String(p.nombre_producto || p.name || ''),
                  sku: String(p.master_sku || p.sku || ''),
                  stock: Number(p.stock) || 0,
                  children: p.children as Product[] | undefined,
                })),
              }
            : cat
        )
      );
    } catch (err) {
      console.error(`Failed to load products for category ${categoryId}`, err);
      setError(err instanceof Error ? err.message : "Error al cargar productos de la categoría");
    } finally {
      setLoadingCategory(false);
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setCategoryModalVisible(true);
  };

  const openEditModal = (category: { id: number; name: string }) => {
    setEditingCategory(category);
    setCategoryModalVisible(true);
  };

  const handleSaveCategory = async (categoryData: {
    id?: number;
    name: string;
  }) => {
    if (categoryData.id) {
      await fetchAPI(`/api/categories/${categoryData.id}`, {
        method: "PUT",
        body: JSON.stringify({ nombre_categoria: categoryData.name }),
      });
    } else {
      await fetchAPI("/api/categories", {
        method: "POST",
        body: JSON.stringify({ nombre_categoria: categoryData.name }),
      });
    }
    loadData();
    setCategoryModalVisible(false);
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    await fetchAPI(`/api/categories/${categoryToDelete.id}`, {
      method: "DELETE",
    });
    loadData();
    setDeleteModalVisible(false);
    setCategoryToDelete(null);
    if (selectedId === categoryToDelete.id) {
      setSelectedId(null);
    }
  };

  const openDeleteModal = (category: { id: number; name: string }) => {
    setCategoryToDelete(category);
    setDeleteModalVisible(true);
  };

  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-900 h-screen flex flex-col overflow-hidden">
      {/* Header limpio y elegante */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <div className="flex flex-row justify-between items-center">
          <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">
            Categorías
          </h1>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-robotoMedium transition-colors"
          >
            + Nueva Categoría
          </button>
        </div>
      </div>

      {/* Layout maestro-detalle: lista de categorías a la izquierda, productos a la derecha */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 px-8 py-6 overflow-hidden">
        {/* ── Panel izquierdo: lista de categorías (siempre visible) ── */}
        <aside className="md:w-80 shrink-0 flex flex-col bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar categoría..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-3 top-2.5 text-gray-400 text-sm pointer-events-none">
                🔍
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
                Cargando categorías...
              </p>
            ) : data.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
                No hay categorías
              </p>
            ) : (
              data
                .filter((c) =>
                  c.name.toLowerCase().includes(search.trim().toLowerCase())
                )
                .map((categoria) => {
                  const active = selectedId === categoria.id;
                  return (
                    <div
                      key={categoria.id}
                      onClick={() => handleCategorySelect(categoria.id)}
                      className={`group flex items-center justify-between px-4 py-3 cursor-pointer border-l-4 transition-colors ${
                        active
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                          : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/60"
                      }`}
                    >
                      <span
                        className={`text-sm truncate ${
                          active
                            ? "text-blue-700 dark:text-blue-300 font-semibold"
                            : "text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {categoria.name}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(categoria);
                          }}
                          className="p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteModal(categoria);
                          }}
                          className="p-1 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </aside>

        {/* ── Panel derecho: productos de la categoría seleccionada ── */}
        <section className="flex-1 overflow-y-auto">
          {error ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700 p-6">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : selectedId ? (
            loadingCategory ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                <p className="text-gray-600 dark:text-gray-400">
                  Cargando productos de la categoría...
                </p>
              </div>
            ) : (
              data
                .filter((d) => d.id === selectedId)
                .map((c) => (
                  <AccordionItem
                    key={c.id}
                    title={c.name}
                    products={c.products}
                    open={true}
                  />
                ))
            )
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center h-full flex items-center justify-center">
              <div className="max-w-md mx-auto">
                <h2 className="text-xl font-light text-gray-600 dark:text-gray-400 mb-4">
                  Selecciona una categoría
                </h2>
                <p className="text-base text-gray-500 dark:text-gray-500 leading-relaxed">
                  Haz click en una categoría de la lista para ver sus productos.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <CategoryModal
        visible={categoryModalVisible}
        category={editingCategory}
        onClose={() => setCategoryModalVisible(false)}
        onSave={handleSaveCategory}
        mode={editingCategory ? "edit" : "create"}
      />

      <DeleteConfirmModal
        visible={deleteModalVisible}
        title="Eliminar Categoría"
        message={`¿Estás seguro de que deseas eliminar la categoría "${categoryToDelete?.name}"?`}
        onConfirm={handleDeleteCategory}
        onCancel={() => {
          setDeleteModalVisible(false);
          setCategoryToDelete(null);
        }}
      />
    </div>
  );
}