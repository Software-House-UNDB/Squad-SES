import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';

// Erros 4xx não melhoram ao repetir; só tenta de novo falhas de rede/5xx.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (axios.isAxiosError(error) && error.response && error.response.status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
  },
});
