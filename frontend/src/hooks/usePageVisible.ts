import { useState, useEffect } from 'react';

/**
 * Retorna true quando a aba está visível (Page Visibility API).
 * Usado para pausar polling quando o usuário não está olhando.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(!document.hidden);

  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return visible;
}

/**
 * Retorna o intervalo de polling ou false quando a aba está inativa.
 * Quando inativa, para completamente. Quando volta, retoma.
 */
export function usePollingInterval(intervalMs: number): number | false {
  const visible = usePageVisible();
  return visible ? intervalMs : false;
}
