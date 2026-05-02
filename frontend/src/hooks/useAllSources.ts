import { useQuery } from '@tanstack/react-query';
import { leadsApi, importApi, type LeadStats } from '../api/client';
import { SOURCES } from '../constants';

/**
 * Retorna todas as listas/empreendimentos disponíveis:
 * - Listas criadas pelo usuário (LeadList)
 * - Sources existentes nos leads (do banco)
 * - Sources fixas padrão (Iniciada, Malibu, Amari, Outro)
 * Sem duplicatas, ordenadas alfabeticamente.
 */
export function useAllSources(): string[] {
  const { data: stats } = useQuery({
    queryKey: ['lead-stats'],
    queryFn: () => leadsApi.stats().then(r => r.data),
    staleTime: 30_000,
  });

  const { data: lists = [] } = useQuery({
    queryKey: ['lead-lists'],
    queryFn: () => importApi.lists.list().then(r => r.data),
    staleTime: 30_000,
  });

  const fromStats = Object.keys((stats as LeadStats | undefined)?.bySource || {});
  const fromLists = (lists as any[]).map((l: any) => l.name);

  const all = new Set([...SOURCES, ...fromStats, ...fromLists]);
  return Array.from(all).sort();
}
