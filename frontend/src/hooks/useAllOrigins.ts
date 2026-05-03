import { useQuery } from '@tanstack/react-query';
import { leadsApi } from '../api/client';
import { DEFAULT_ORIGINS } from '../constants';

/**
 * Retorna todas as origens distintas no banco + as padrões.
 * Garante que origens customizadas (ex: "Pro-Busca") apareçam nos filtros.
 */
export function useAllOrigins(): string[] {
  const { data: fromDb = [] } = useQuery({
    queryKey: ['lead-origins'],
    queryFn: () => leadsApi.origins().then(r => r.data),
    staleTime: 60_000,
  });

  const all = new Set([...DEFAULT_ORIGINS, ...(fromDb as string[])]);
  return Array.from(all).sort();
}
