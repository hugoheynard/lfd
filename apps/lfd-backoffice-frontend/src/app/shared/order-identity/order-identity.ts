import type { FulfillmentMethod, OrderClientele } from '@lfd/contracts';

/**
 * **Les mots d'une commande que plusieurs écrans disent** : sa clientèle (le
 * badge Pro / Particulier) et son mode (Retrait / Livraison).
 *
 * Sortis de la liste des commandes le 2026-11-01, quand la Supervision a dû
 * dire les mêmes : une seule règle, sans quoi un écran finit par appeler
 * « Client » ce que l'autre appelle « Particulier ».
 */
export const CLIENTELE_LABELS: Readonly<Record<OrderClientele, string>> = {
  pro: 'Pro',
  public: 'Particulier',
};

export const METHOD_LABELS: Readonly<Record<FulfillmentMethod, string>> = {
  pickup: 'Retrait',
  delivery: 'Livraison',
};

/** Le badge de clientèle : `info` pour un pro, `neutral` pour un particulier. */
export interface ClienteleBadge {
  readonly label: string;
  readonly variant: 'info' | 'neutral';
}

/** Libellé de la clientèle — `null` pour une commande d'avant la distinction. */
export function clienteleLabel(clientele: OrderClientele | null): string | null {
  return clientele === null ? null : CLIENTELE_LABELS[clientele];
}

/**
 * Le badge, ou `null` : une commande d'avant la distinction n'en a pas, et on
 * ne le déduit pas de sa société après coup (« sans société » ne voulait pas
 * dire particulier).
 */
export function clienteleBadgeOf(
  clientele: OrderClientele | null | undefined,
): ClienteleBadge | null {
  if (clientele === null || clientele === undefined) {
    return null;
  }
  return { label: CLIENTELE_LABELS[clientele], variant: clientele === 'pro' ? 'info' : 'neutral' };
}

export function methodLabel(method: FulfillmentMethod): string {
  return METHOD_LABELS[method];
}
