// TypeScript type definitions for the BodegaEinter API, based on API.txt.
export interface ApiPaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  items?: T[];
  pagination?: ApiPaginationMeta;
  page?: number;
  pageSize?: number;
  total?: number;
  ok?: boolean;
  id?: number;
  message?: string;
  error?: string;
  success?: boolean;
}

export interface User {
  id_usuario: number;
  username: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: number;
  created_at: string;
  updated_at: string | null;
}

export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface UserLoginResponse {
  success: boolean;
  message: string;
  user: User;
}

export interface UserCreateRequest {
  username: string;
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  rol: number;
}

export interface UserUpdateRequest {
  id_usuario: number;
  username?: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  password?: string;
  rol?: number;
}

export interface ProductDimensions {
  largo: number;
  ancho: number;
  alto: number;
}

export interface ProductSupplier {
  id: number;
  name: string;
}

export interface ProductLocation {
  id_ubicacion: number;
  nombre: string;
  tarimas: number;
  completas: number;
  distintas: number;
  escaneado: boolean;
}

export interface Product {
  id?: number;
  sku: string;
  china_sku?: string | null;
  name: string;
  photo?: string | null;
  dimensions_cm?: ProductDimensions;
  weight_kg: number;
  stock: number;
  price: number;
  cost: number;
  supplier?: ProductSupplier | null;
  locations?: ProductLocation[];
  category?: string | { id: number; name: string };
  description?: string;
  qty_per_carton?: number | null;
  standard_tarima?: number | null;
  cajas_x_tarima?: number | null;
  no_estiba?: number | null;
  considerar_modelo_matematico?: boolean;
  updated_at?: string | null;
}

export interface ProductCreateRequest {
  master_sku: string;
  nombre_producto: string;
  foto?: string;
  largo_cm?: number;
  ancho_cm?: number;
  alto_cm?: number;
  peso_kg?: number;
  existencias?: number;
  precio?: number;
  costo?: number;
  id_proveedor?: number;
}

export interface ProductUpdateRequest {
  nombre_producto?: string;
  foto?: string;
  largo_cm?: number;
  ancho_cm?: number;
  alto_cm?: number;
  peso_kg?: number;
  existencias?: number;
  precio?: number;
  costo?: number;
  id_proveedor?: number;
}

export interface Supplier {
  id: number;
  name: string;
  city: string | null;
  lead_time: number | null;
}

export interface SupplierCreateRequest {
  nombre: string;
  ciudad?: string;
  tiempo_envio?: number;
}

export interface SupplierUpdateRequest {
  nombre?: string;
  ciudad?: string;
  tiempo_envio?: number;
}

export interface InventoryLocation {
  id_inventario: number;
  id_ubicacion: number;
  nombre: string;
  tarimas: number;
  std_tarimas: number;
  completas: number;
  distintas: number;
  escaneado: boolean;
  updated_at: string;
}

export interface InventoryResponse {
  id_articulo: number;
  ubicaciones: InventoryLocation[];
}

export interface InventoryCreateRequest {
  id_articulo: number;
  id_ubicacion: number;
  tarimas?: number;
  std_inv_t?: number;
  t_completas?: number;
  t_distintas?: number;
  escaneado?: boolean;
}

export interface InventoryUpdateRequest {
  tarimas?: number;
  std_inv_t?: number;
  t_completas?: number;
  t_distintas?: number;
  escaneado?: boolean;
}

export interface Receipt {
  id_recibo: number;
  proveedor: string;
  id_orden: number;
  precio: number;
  fecha_compra: string;
  fecha_llegada: string;
  recibido: number | boolean;
}

export interface ReceiptCreateRequest {
  proveedor?: string;
  id_orden?: number;
  precio?: number;
  fecha_compra?: string;
  fecha_llegada?: string;
  recibido?: boolean;
}

export interface ReceiptUpdateRequest {
  proveedor?: string;
  precio?: number;
  fecha_compra?: string;
  fecha_llegada?: string;
  recibido?: boolean;
}

export interface ReceiptStats {
  total_recibos: number;
  recibidos: number;
  pendientes: number;
  total_precio: number;
  precio_promedio: number;
  precio_minimo: number;
  precio_maximo: number;
}

export interface OrderDetail {
  id_articulo: number;
  sku?: string;
  nombre?: string;
  cantidad: number;
  eta?: string;
  fecha_estimada?: string;
}

export interface Order {
  orden: string;
  tipo: number;
  eta: string;
  created_at: string;
  updated_at: string | null;
  detalle?: OrderDetail[];
}

export interface OrderCreateRequest {
  orden: string;
  tipo: number;
  fecha_estimada?: string;
  detalle: OrderDetail[];
}

export interface OrderUpdateRequest {
  tipo?: number;
  fecha_estimada?: string;
  detalle?: OrderDetail[];
}

export interface OrderListResponse {
  data: Order[];
  pagination: ApiPaginationMeta;
}

export interface Sale {
  id_venta: number;
  id_orden: string;
  id_folio: string;
  cliente: string;
  precio: number;
  costo: number;
  fecha: string;
}

export interface Notification {
  id: number;
  id_usuario: number;
  orden: string;
  brief: string;
  leido: number;
  created_at: string;
  nombre: string;
}

export interface Movement {
  id_movimiento: number;
  id_usuario: number;
  id_ubicacion_origen: number;
  id_ubicacion_destino: number;
  tipo: number;
  id_tarima: number;
  id_articulo: number;
  cantidad: number;
  old_masterSKU: string;
  new_masterSKU: string;
  fecha: string;
  nombre_usuario: string;
}
