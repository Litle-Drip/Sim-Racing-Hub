import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';

// The companion API-key endpoints are not part of the generated api-client,
// so both the Companion page and the dashboard onboarding checklist used to
// need their own copy of this fetch. They share it now, which also means the
// checklist ticks the moment the key is generated without a page reload.

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export interface ApiKeyStatus {
  hasKey: boolean;
  createdAt: string | null;
}

export const COMPANION_KEY_QUERY_KEY = ['companion', 'apikey'] as const;

async function request(
  token: string,
  path: string,
  opts?: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
}

export function useCompanionKeyStatus(enabled = true) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: COMPANION_KEY_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<ApiKeyStatus> => {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await request(token, '/companion/apikey');
      if (!res.ok) throw new Error('Failed to load API key status');
      return (await res.json()) as ApiKeyStatus;
    },
  });
}

export function useGenerateCompanionKey() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await request(token, '/companion/apikey', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate API key');
      const data = (await res.json()) as { key: string };
      return data.key;
    },
    onSuccess: () => {
      qc.setQueryData<ApiKeyStatus>(COMPANION_KEY_QUERY_KEY, {
        hasKey: true,
        createdAt: new Date().toISOString(),
      });
    },
  });
}

export function useRevokeCompanionKey() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await request(token, '/companion/apikey', { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to revoke API key');
    },
    onSuccess: () => {
      qc.setQueryData<ApiKeyStatus>(COMPANION_KEY_QUERY_KEY, {
        hasKey: false,
        createdAt: null,
      });
    },
  });
}
