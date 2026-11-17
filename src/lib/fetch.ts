// API client for the BodegaEinter backend: fetchAPI handles authenticated
// requests, and useFetch wraps it with React loading/error state.
import { useState, useEffect } from 'react';
import { auth } from './firebase';

// Use relative path for API in development, absolute URL from env in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function fetchAPI(path: string, options: RequestInit = {}): Promise<unknown> {
  // Convert /(api)/ prefix to /api/
  const normalizedPath = path.replace('/(api)/', '/api/');
  const url = `${API_BASE_URL}${normalizedPath}`;

  try {
    // Get the current user's ID token from Firebase
    const user = auth.currentUser;
    let token = '';
    
    if (user) {
      // Cached token: the SDK refreshes it by itself shortly before it expires. Forcing a refresh on
      // every request added a round trip to Google per call (and hits their rate limits on big screens).
      token = await user.getIdToken();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add Authorization header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!response.ok) {
      if (isJson) {
        const error = await response.json();
        throw new Error(error.error || error.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      const body = await response.text();
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}. ` +
        `Expected JSON but got "${contentType || 'unknown'}" from ${url}. ` +
        `Revisa que el backend esté corriendo y que /api esté ruteado al API (no al servidor del frontend). ` +
        `Respuesta: ${body.slice(0, 120)}`
      );
    }

    if (!isJson) {
      const body = await response.text();
      throw new Error(
        `Expected JSON but got "${contentType || 'unknown'}" from ${url}. ` +
        `Probablemente /api se está sirviendo desde el frontend (index.html) o un proxy devolvió un error. ` +
        `Respuesta: ${body.slice(0, 120)}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      console.error('API Error:', error.message);
      throw error;
    }
    throw new Error('An unexpected error occurred');
  }
}

export function useFetch<T>(url: string, options?: RequestInit) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchAPI(url, options);
        if (isMounted) {
          setData(result as T);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [url]);

  return { data, loading, error };
}

// Make fetchAPI available globally for components that expect it
if (typeof window !== 'undefined') {
  (window as Window & { fetchAPI: typeof fetchAPI }).fetchAPI = fetchAPI;
}
