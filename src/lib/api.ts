// Backend REST client: auth token storage, generic request helper, and
// typed methods for auth/user management endpoints.
import type { UserRole } from './roles';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Store the current Firebase ID token
let currentIdToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentIdToken = token;
}

export function getAuthToken(): string | null {
  return currentIdToken;
}

// Backend user response
export interface BackendUserData {
  id_usuario: number;
  uid: string | null;
  email: string;
  role: UserRole;
  nombre: string;
  apellido: string;
  displayName?: string;
  photoURL?: string;
  isActive: boolean;
  [key: string]: unknown;
}

// Raw row shape returned by GET /api/auth/users
interface BackendUserRow {
  id_usuario: number;
  firebase_uid: string | null;
  username: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  is_active: boolean | number;
  [key: string]: unknown;
}

function mapBackendUser(row: BackendUserRow): BackendUserData {
  return {
    id_usuario: row.id_usuario,
    uid: row.firebase_uid,
    email: row.email,
    role: row.rol,
    nombre: row.nombre || '',
    apellido: row.apellido || '',
    displayName: [row.nombre, row.apellido].filter(Boolean).join(' ') || row.username,
    isActive: !!row.is_active,
  };
}

// Login to backend after Firebase authentication
export async function loginToBackend(idToken: string): Promise<BackendUserData> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Backend authentication failed');
  }

  const data = await response.json();
  return data.user || data;
}

// Get current user from backend
export async function getCurrentUser(): Promise<BackendUserData> {
  if (!currentIdToken) {
    throw new Error('No authentication token available');
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${currentIdToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to get user data');
  }

  const data = await response.json();
  return data.user || data;
}

// Generic API request helper with authentication
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (currentIdToken) {
    headers['Authorization'] = `Bearer ${currentIdToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// Specific API methods for your app
export const api = {
  // Auth
  login: loginToBackend,
  getCurrentUser,

  // User management (SuperAdmin only - via auth router)
  getAllUsers: async () => {
    const data = await apiRequest<{ users: BackendUserRow[] }>('/api/auth/users');
    return data.users.map(mapBackendUser);
  },
  updateUserProfile: (id: number | string, data: { nombre: string; apellido: string; email: string }) =>
    apiRequest(`/api/auth/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  toggleUserActive: (id: number | string, isActive: boolean) => apiRequest(`/api/auth/users/${id}/toggle-active`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive })
  }),
  createUser: (data: { email: string; nombre: string; apellido?: string }) =>
    apiRequest('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  deleteUser: (id: number | string) => apiRequest(`/api/auth/users/${id}`, {
    method: 'DELETE'
  }),
  assignRole: (email: string, role: UserRole) =>
    apiRequest('/api/auth/assign-role', {
      method: 'POST',
      body: JSON.stringify({ email, role })
    }),

  // Dashboard
  getDashboard: () => apiRequest('/api/misc/dashboard'),
  getProductosCatalogo: (pageSize = 50) => apiRequest(`/api/productos?pageSize=${pageSize}`),
};
