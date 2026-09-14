// Product catalog page: search, filter, paginate, edit, and export
// products to Excel.
import { useState, useEffect, useCallback } from "react";
import ExcelJS from "exceljs";
import { ProductModal } from "../components/ProductModal";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import type { Product } from "../lib/types";
import { ColumnFilter, distinctValues } from "../components/ColumnFilter";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { getMonterreyDateISO } from "../lib/dateMx";

const PAGE_SIZE = 20;
const TABLE_GRID_COLUMNS =
  "7rem minmax(0,3fr) minmax(0,1.5fr) minmax(0,2fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.5fr)";

// Map a raw Odoo DB row to the Product type
const mapOdooProduct = (item: Record<string, unknown>): Product => ({
  id: item.id_articulo !== undefined ? Number(item.id_articulo) : undefined,
  sku: String(item.master_sku ?? ''),
  china_sku: item.sku_china != null ? String(item.sku_china) : null,
  name: String(item.nombre_producto ?? ''),
  price: Number(item.precio) || 0,
  cost: Number(item.costo) || 0,
  photo: item.foto ? String(item.foto) : null,
  stock: Number(item.existencias) || 0,
  weight_kg: Number(item.peso_kg) || 0,
  dimensions_cm: {
    largo: Number(item.largo_cm) || 0,
    ancho: Number(item.ancho_cm) || 0,
    alto: Number(item.alto_cm) || 0,
  },
  supplier: item.id_proveedor
    ? { id: Number(item.id_proveedor), name: String(item.proveedor_nombre ?? '') }
    : null,
  category: item.id_categoria
    ? { id: Number(item.id_categoria), name: String(item.nombre_categoria ?? '') }
    : undefined,
  qty_per_carton: item.cantidad_x_ctn != null ? Number(item.cantidad_x_ctn) : null,
  standard_tarima: item.inventario_standar_tarima != null ? Number(item.inventario_standar_tarima) : null,
  cajas_x_tarima: item.cajas_x_tarima != null ? Number(item.cajas_x_tarima) : null,
  no_estiba: item.no_estiba != null ? Number(item.no_estiba) : null,
  considerar_modelo_matematico: item.considerar_modelo_matematico !== undefined ? Boolean(item.considerar_modelo_matematico) : true,
  updated_at: item.updated_at ? String(item.updated_at) : null,
});

const categoryName = (p: Product): string =>
  typeof p.category === "object" && p.category?.name
    ? p.category.name
    : typeof p.category === "string"
    ? p.category
    : "";

// Per-column display-value accessors for the Excel-style filters.
const PROD_COL_ACCESSORS: Record<string, (p: Product) => string> = {
  name: (p) => p.name || "",
  sku: (p) => String(p.sku || ""),
  proveedor: (p) => p.supplier?.name || "",
  categoria: (p) => categoryName(p),
  weight: (p) => String(p.weight_kg ?? ""),
  stock: (p) => String(p.stock ?? ""),
  price: (p) => `$${parseFloat(String(p.price || 0)).toFixed(2)}`,
  cost: (p) => `$${parseFloat(String(p.cost || 0)).toFixed(2)}`,
};

export function Productos() {
  useDarkMode();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [filterName, setFilterName] = useState("");
  const [filterSKU, setFilterSKU] = useState("");
  const [filterProveedor, setFilterProveedor] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterStock, setFilterStock] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState<{
    column: string;
    direction: "asc" | "desc";
  } | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [imageZoomVisible, setImageZoomVisible] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const [exportLoading, setExportLoading] = useState(false);

  const handleExportExcel = async () => {
    setExportLoading(true);
    setError(null);
    try {
      // Fetch ALL products (every page), not just the current page
      const firstPageSize = 200;
      const firstRes = await fetchAPI(
        `/api/odoo/productos?page=1&pageSize=${firstPageSize}`
      ) as { items?: Record<string, unknown>[]; total?: number; pageSize?: number };

      const total = firstRes.total || 0;
      const pageSize = firstRes.pageSize || firstPageSize;
      const allItems: Record<string, unknown>[] = [...(firstRes.items || [])];

      const totalPagesToFetch = Math.ceil(total / pageSize);
      for (let p = 2; p <= totalPagesToFetch; p++) {
        const res = await fetchAPI(
          `/api/odoo/productos?page=${p}&pageSize=${pageSize}`
        ) as { items?: Record<string, unknown>[] };
        allItems.push(...(res.items || []));
      }

      const allProducts: Product[] = allItems.map(mapOdooProduct);

      const rows = allProducts.map((p) => ({
        MOD: p.sku,
        "SKU China": p.china_sku ?? "",
        Nombre: p.name,
        Proveedor: p.supplier?.name ?? "",
        Categoría:
          typeof p.category === "object" ? p.category?.name ?? "" : p.category ?? "",
        "Peso (kg)": p.weight_kg,
        Stock: p.stock,
        Precio: p.price,
        Costo: p.cost,
        "Largo (cm)": p.dimensions_cm?.largo ?? "",
        "Ancho (cm)": p.dimensions_cm?.ancho ?? "",
        "Alto (cm)": p.dimensions_cm?.alto ?? "",
        "Piezas por Cartón": p.qty_per_carton ?? "",
        "Piezas por Tarima": p.standard_tarima ?? "",
        "Cajas por Tarima": p.cajas_x_tarima ?? "",
        "No. de Estiba": p.no_estiba ?? "",
        "Modelo Matemático": p.considerar_modelo_matematico === false ? "No" : "Sí",
        "Última actualización": p.updated_at ?? "",
      }));

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Productos");

      if (rows.length > 0) {
        worksheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
        worksheet.addRows(rows);
      }

      const date = getMonterreyDateISO();
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `productos_${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting products:", err);
      setError(err instanceof Error ? err.message : "Error al exportar productos");
    } finally {
      setExportLoading(false);
    }
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const firstPageSize = 200;
      const first = (await fetchAPI(
        `/api/odoo/productos?page=1&pageSize=${firstPageSize}`
      )) as { items?: Record<string, unknown>[]; total?: number; pageSize?: number };

      const total = first.total || 0;
      const ps = first.pageSize || firstPageSize;
      const allItems: Record<string, unknown>[] = [...(first.items || [])];

      const pages = Math.ceil(total / ps);
      for (let p = 2; p <= pages; p++) {
        const r = (await fetchAPI(
          `/api/odoo/productos?page=${p}&pageSize=${ps}`
        )) as { items?: Record<string, unknown>[] };
        allItems.push(...(r.items || []));
      }

      setProducts(allItems.map(mapOdooProduct));
    } catch (err) {
      console.error("Error fetching products from database:", err);
      setError(
        err instanceof Error ? err.message : "Error connecting to database"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRefetchOnFocus(fetchProducts);

  const applyFilters = useCallback(() => {
    let filtered = [...products];

    // Global search box (name or SKU)
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          String(p.sku).toLowerCase().includes(q)
      );
    }

    // Excel-style per-column value filters
    for (const [key, vals] of Object.entries(colFilters)) {
      if (vals.length) {
        const accessor = PROD_COL_ACCESSORS[key];
        filtered = filtered.filter((p) => vals.includes(accessor(p)));
      }
    }

    // Filter by name
    if (filterName.trim()) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(filterName.toLowerCase())
      );
    }

    // Filter by SKU
    if (filterSKU.trim()) {
      filtered = filtered.filter((product) =>
        String(product.sku).toLowerCase().includes(filterSKU.toLowerCase())
      );
    }

    // Filter by proveedor
    if (filterProveedor.trim()) {
      filtered = filtered.filter((product) =>
        product.supplier?.name
          ?.toLowerCase()
          .includes(filterProveedor.toLowerCase())
      );
    }

    // Filter by categoría
    if (filterCategoria.trim()) {
      filtered = filtered.filter((product) =>
        (typeof product.category === "object"
          ? product.category?.name
          : product.category
        )
          ?.toLowerCase()
          .includes(filterCategoria.toLowerCase())
      );
    }

    // Filter by stock
    if (filterStock.trim()) {
      const stockValue = parseInt(filterStock);
      if (!isNaN(stockValue)) {
        filtered = filtered.filter((product) => product.stock === stockValue);
      }
    }

    // Sort
    if (sortBy) {
      filtered.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortBy.column) {
          case "name":
            aValue = (a.name || "").toLowerCase();
            bValue = (b.name || "").toLowerCase();
            break;
          case "sku":
            aValue = String(a.sku || "").toLowerCase();
            bValue = String(b.sku || "").toLowerCase();
            break;
          case "proveedor":
            aValue = (a.supplier?.name || "").toLowerCase();
            bValue = (b.supplier?.name || "").toLowerCase();
            break;
          case "weight":
            aValue = Number(a.weight_kg) || 0;
            bValue = Number(b.weight_kg) || 0;
            break;
          case "stock":
            aValue = Number(a.stock) || 0;
            bValue = Number(b.stock) || 0;
            break;
          case "price":
            aValue = Number(a.price) || 0;
            bValue = Number(b.price) || 0;
            break;
          case "cost":
            aValue = Number(a.cost) || 0;
            bValue = Number(b.cost) || 0;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortBy.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortBy.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    setFilteredProducts(filtered);
  }, [
    products,
    searchText,
    colFilters,
    filterName,
    filterSKU,
    filterProveedor,
    filterCategoria,
    filterStock,
    sortBy,
  ]);

  // Apply filters whenever filter states change
  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Reset to first page whenever the result set changes
  useEffect(() => {
    setPage(1);
  }, [searchText, colFilters, filterName, filterSKU, filterProveedor, filterCategoria, filterStock]);

  const clearFilters = () => {
    setFilterName("");
    setFilterSKU("");
    setFilterProveedor("");
    setFilterCategoria("");
    setFilterStock("");
    setColFilters({});
    setSortBy(null);
  };

  const hasColFilters = Object.values(colFilters).some((v) => v.length > 0);

  // Search is now client-side over the full catalog
  const handleSearch = (text: string) => {
    setSearchText(text);
  };

  // Create product
  const handleCreateProduct = async (productData: Partial<Product>) => {
    // Transform Product to ArticuloCreate format
    const apiData = {
        master_sku: productData.sku || "",
        sku_china: productData.china_sku || null,
        nombre_producto: productData.name || "",
        foto: productData.photo || null,
        largo_cm: productData.dimensions_cm?.largo || 0,
        ancho_cm: productData.dimensions_cm?.ancho || 0,
        alto_cm: productData.dimensions_cm?.alto || 0,
        peso_kg: productData.weight_kg || 0,
        existencias: productData.stock || 0,
        precio: productData.price || 0,
        costo: productData.cost || 0,
        id_proveedor: productData.supplier?.id || null,
        id_categoria: productData.category ? parseInt(String(productData.category)) : null,
        cantidad_x_ctn: productData.qty_per_carton ?? null,
        inventario_standar_tarima: productData.standard_tarima ?? 0,
      };

      const result = await fetchAPI("/(api)/productos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiData),
      }) as { id?: number };

    // Sync to Odoo after creation
    if (result?.id) {
        try {
          await fetchAPI(`/api/odoo/sync/producto/${result.id}`, { method: "POST" });
        } catch (odooErr) {
          console.warn("Odoo sync failed (product will sync later):", odooErr);
        }
      }

    // Optimización: solo refrescar si estamos en la primera página sin búsqueda
    if (page === 1 && !searchText) {
      await fetchProducts();
    } else {
      setSearchText("");
      await fetchProducts();
    }
  };

  // Update product
  const handleUpdateProduct = async (productData: Partial<Product>) => {
      if (!productData.id) {
        throw new Error("ID del producto es requerido para actualizar");
      }

      // Transform Product to ArticuloUpdate format (only changed fields)
      const apiData: Record<string, unknown> = {};

      if (productData.sku !== undefined) apiData.master_sku = productData.sku;
      if (productData.china_sku !== undefined)
        apiData.sku_china = productData.china_sku;
      if (productData.name !== undefined)
        apiData.nombre_producto = productData.name;
      if (productData.photo !== undefined) apiData.foto = productData.photo;
      if (productData.dimensions_cm?.largo !== undefined)
        apiData.largo_cm = productData.dimensions_cm.largo;
      if (productData.dimensions_cm?.ancho !== undefined)
        apiData.ancho_cm = productData.dimensions_cm.ancho;
      if (productData.dimensions_cm?.alto !== undefined)
        apiData.alto_cm = productData.dimensions_cm.alto;
      if (productData.weight_kg !== undefined)
        apiData.peso_kg = productData.weight_kg;
      if (productData.stock !== undefined)
        apiData.existencias = productData.stock;
      if (productData.price !== undefined) apiData.precio = productData.price;
      if (productData.cost !== undefined) apiData.costo = productData.cost;
      if (productData.supplier?.id !== undefined)
        apiData.id_proveedor = productData.supplier.id;
      if (productData.qty_per_carton !== undefined)
        apiData.cantidad_x_ctn = productData.qty_per_carton;
      if (productData.standard_tarima !== undefined)
        apiData.inventario_standar_tarima = productData.standard_tarima;
      if (productData.cajas_x_tarima !== undefined)
        apiData.cajas_x_tarima = productData.cajas_x_tarima;
      if (productData.no_estiba !== undefined)
        apiData.no_estiba = productData.no_estiba;
      if (productData.category !== undefined)
        apiData.id_categoria = productData.category ? parseInt(String(productData.category)) : null;
      if (productData.considerar_modelo_matematico !== undefined)
        apiData.considerar_modelo_matematico = productData.considerar_modelo_matematico;
      if (productData.updated_at)
        apiData.updated_at = productData.updated_at;

      await fetchAPI(`/(api)/productos?id=${productData.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiData),
      });

      // Sync to Odoo after update
      try {
        await fetchAPI(`/api/odoo/sync/producto/${productData.id}`, { method: "POST" });
      } catch (odooErr) {
        console.warn("Odoo sync failed (product will sync later):", odooErr);
      }

      // Optimización: mantener la página actual
      await fetchProducts();
  };

  // Delete product
  const handleDeleteProduct = async () => {
    if (!productToDelete) return;

    setDeleteLoading(true);
    try {
      await fetchAPI(`/(api)/productos?id=${productToDelete.id}`, {
        method: "DELETE",
      });

      setDeleteModalVisible(false);
      setProductToDelete(null);

      // Optimización: mantener la página actual si no es la última y tiene productos
      await fetchProducts();
    } catch (err) {
      console.error("Error deleting product:", err);
      setError(err instanceof Error ? err.message : "Error deleting product");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Open modal for creating
  const openCreateModal = () => {
    setSelectedProduct(null);
    setModalMode("create");
    setModalVisible(true);
  };

  const openEditModal = async (product: Product) => {
    setModalMode("edit");
    setSelectedProduct(product);
    setModalVisible(true);
    try {
      const raw = (await fetchAPI(`/(api)/productos?id=${product.id}`)) as Record<string, unknown>;
      setSelectedProduct({
        ...(raw as unknown as Product),
        china_sku: raw.sku_china != null ? String(raw.sku_china) : null,
      });
    } catch (err) {
      console.warn("No se pudo refrescar el producto antes de editar:", err);
    }
  };

  // Open delete confirmation
  const openDeleteModal = (product: Product) => {
    setProductToDelete(product);
    setDeleteModalVisible(true);
  };

  // Client-side pagination over the filtered result set
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pagedProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Column definitions for the Excel-style header filters
  const PROD_COLUMNS: { key: string; label: string }[] = [
    { key: "name", label: "Nombre" },
    { key: "sku", label: "MOD" },
    { key: "proveedor", label: "Proveedor" },
    { key: "stock", label: "Stock" },
    { key: "price", label: "Precio" },
    { key: "cost", label: "Costo" },
  ];

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <div className="flex flex-row items-center justify-between">
          <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">
            Productos
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              disabled={exportLoading}
              className="px-4 py-2 border border-green-600 dark:border-green-500 text-green-700 dark:text-green-400 hover:bg-green-600 hover:text-white dark:hover:bg-green-500 dark:hover:text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {exportLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                  Exportando...
                </>
              ) : '📊 Exportar Excel'}
            </button>
            <button
              onClick={openCreateModal}
              className="px-6 py-2 border border-black dark:border-white hover:bg-black dark:hover:bg-white hover:text-white dark:hover:text-black transition-colors text-sm font-medium text-gray-900 dark:text-white"
            >
              + Agregar Producto
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por MOD o nombre..."
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-base bg-white dark:bg-gray-700 dark:text-white pr-10 placeholder-gray-500 dark:placeholder-gray-400"
            />
            {searchText ? (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-3 top-3 text-gray-400 dark:text-gray-500 text-xl hover:text-gray-600 dark:hover:text-gray-400"
              >
                ✕
              </button>
            ) : (
              <div className="absolute right-3 top-3 text-gray-400 dark:text-gray-500 text-xl pointer-events-none">
                🔍
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-row items-center mt-4 gap-3">
          {(filterName ||
            filterSKU ||
            filterProveedor ||
            filterCategoria ||
            filterStock ||
            hasColFilters ||
            sortBy) && (
            <button
              onClick={clearFilters}
              className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-robotoMedium"
            >
              Limpiar Filtros
            </button>
          )}
          {searchText && (
            <div className="bg-blue-100 dark:bg-blue-900 px-3 py-2 rounded-lg">
              <p className="text-blue-700 dark:text-blue-300 text-sm font-robotoMedium">
                Buscando: "{searchText}"
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg">
            <p className="text-red-700 dark:text-red-300">Error: {error}</p>
            <button
              onClick={() => fetchProducts()}
              className="mt-2 text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
        {/* Excel-style header row with grid lines */}
        <div
          className="grid [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600"
          style={{ gridTemplateColumns: TABLE_GRID_COLUMNS }}
        >
          <div className="w-28 py-4 px-3 border-r border-gray-400 dark:border-gray-600 flex justify-center items-center">
            <h3 className="font-robotoMedium text-gray-900 dark:text-white text-lg text-center">
              Foto
            </h3>
          </div>
          {PROD_COLUMNS.map((col) => (
            <div
              key={col.key}
              className="py-4 px-2 border-r border-gray-400 dark:border-gray-600 flex justify-center items-center"
            >
              <ColumnFilter
                label={col.label}
                textClass="text-lg"
                options={distinctValues(products, PROD_COL_ACCESSORS[col.key])}
                selected={colFilters[col.key] ?? []}
                onChange={(next) =>
                  setColFilters((prev) => ({ ...prev, [col.key]: next }))
                }
                sortDir={sortBy?.column === col.key ? sortBy.direction : null}
                onSort={(dir) => setSortBy({ column: col.key, direction: dir })}
              />
            </div>
          ))}
          <div className="flex-[1.5] py-4 px-3 flex justify-center items-center">
            <h3 className="font-robotoMedium text-gray-900 dark:text-white text-lg text-center">
              Acciones
            </h3>
          </div>
        </div>

        {/* Excel-style data rows with grid lines */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {loading && products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 font-robotoRegular mt-4">
                Cargando Productos...
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-gray-500 font-robotoRegular">
                No se encontraron Productos
              </p>
            </div>
          ) : (
            pagedProducts.map((product, index) => (
              <div
                key={product.id}
                className={`grid [&>*]:min-w-0 border-b border-gray-300 dark:border-gray-700 ${
                  index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"
                } hover:bg-blue-50 dark:hover:bg-blue-900/30`}
                style={{ gridTemplateColumns: TABLE_GRID_COLUMNS }}
              >
                {/* Foto */}
                <div className="w-28 py-2 px-2 border-r border-gray-300 dark:border-gray-700 flex justify-center items-center">
                  {product.photo ? (
                    <button
                      onClick={() => {
                        setZoomedImage(product.photo!);
                        setImageZoomVisible(true);
                      }}
                      className="hover:opacity-75"
                    >
                      <img
                        src={product.photo}
                        alt={product.name}
                        className="w-20 h-20 rounded object-cover"
                      />
                    </button>
                  ) : (
                    <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded flex justify-center items-center">
                      <p className="text-gray-400 dark:text-gray-500 text-xs">Sin foto</p>
                    </div>
                  )}
                </div>
                {/* Nombre */}
                <div className="flex-[3] py-4 px-3 border-r border-gray-300 dark:border-gray-700 flex justify-center items-center">
                  <p className="text-gray-900 dark:text-white font-robotoRegular text-base text-center line-clamp-2">
                    {product.name}
                  </p>
                </div>

                {/* SKU */}
                <div className="flex-[1.5] py-4 px-3 border-r border-gray-300 dark:border-gray-700 flex justify-center items-center">
                  <p className="text-gray-900 dark:text-white font-robotoRegular text-base text-center">
                    {product.sku}
                  </p>
                </div>

                {/* Proveedor */}
                <div className="flex-[2] py-4 px-3 border-r border-gray-300 dark:border-gray-700 flex justify-center items-center">
                  <p className="text-gray-900 dark:text-white font-robotoRegular text-base text-center truncate">
                    {product.supplier?.name || "-"}
                  </p>
                </div>

                {/* Stock */}
                <div className="flex-[1.2] py-4 px-3 border-r border-gray-300 dark:border-gray-700 flex justify-center items-center">
                  <p className="text-gray-900 dark:text-white font-robotoRegular text-base text-center">
                    {product.stock}
                  </p>
                </div>

                {/* Precio */}
                <div className="flex-[1.2] py-4 px-3 border-r border-gray-300 dark:border-gray-700 flex justify-center items-center">
                  <p className="text-gray-900 dark:text-white font-robotoRegular text-base text-center">
                    ${parseFloat(String(product.price)).toFixed(2)}
                  </p>
                </div>

                {/* Costo */}
                <div className="flex-[1.2] py-4 px-3 border-r border-gray-300 dark:border-gray-700 flex justify-center items-center">
                  <p className="text-gray-900 dark:text-white font-robotoRegular text-base text-center">
                    ${parseFloat(String(product.cost || 0)).toFixed(2)}
                  </p>
                </div>

                {/* Acciones */}
                <div className="flex-[1.5] py-2 px-2 flex justify-center items-center flex-row gap-2">
                  <button
                    onClick={() => openEditModal(product)}
                    className="px-3 py-1.5 bg-blue-500 rounded hover:bg-blue-600 text-white text-xs font-robotoMedium"
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {!loading && !error && products.length > 0 && totalPages > 1 && (
        <div className="bg-white dark:bg-gray-800 mx-6 mt-2 mb-4 px-6 py-4 border border-gray-400 dark:border-gray-700 border-t-0">
          <div className="flex flex-row items-center justify-between">
            <p className="text-gray-600 dark:text-gray-300 font-robotoRegular">
              Página {page} de {totalPages}
            </p>
            <div className="flex flex-row gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`px-4 py-2 rounded-lg font-robotoMedium ${
                  page === 1 ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={`px-4 py-2 rounded-lg font-robotoMedium ${
                  page >= totalPages ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ProductModal
        visible={modalVisible}
        product={selectedProduct}
        mode={modalMode}
        onClose={() => {
          setModalVisible(false);
          setSelectedProduct(null);
        }}
        onSave={
          modalMode === "create" ? handleCreateProduct : handleUpdateProduct
        }
        onDelete={
          modalMode === "edit"
            ? () => {
                if (!selectedProduct) return;
                setModalVisible(false);
                openDeleteModal(selectedProduct);
              }
            : undefined
        }
      />

      <DeleteConfirmModal
        visible={deleteModalVisible}
        productName={productToDelete?.name || ""}
        loading={deleteLoading}
        onConfirm={handleDeleteProduct}
        onCancel={() => {
          setDeleteModalVisible(false);
          setProductToDelete(null);
        }}
      />

      {/* Image Zoom Modal */}
      {imageZoomVisible && (
        <div
          className="fixed inset-0 bg-black/90 flex justify-center items-center z-50"
          onClick={() => setImageZoomVisible(false)}
        >
          <button
            onClick={() => setImageZoomVisible(false)}
            className="absolute top-8 right-8 z-10 bg-white/20 rounded-full p-3 hover:bg-white/30"
          >
            <span className="text-white text-3xl font-bold">✕</span>
          </button>
          {zoomedImage && (
            <img
              src={zoomedImage}
              alt="Zoomed"
              className="w-full h-full object-contain"
            />
          )}
        </div>
      )}
    </div>
  );
}