import type { AdminOrderEntryOrigin } from '@lfd/contracts';

/**
 * **D'où vient une saisie de l'équipe**, mis en mots pour le back-office
 * (Hugo, 2026-11-04). Le serveur dit déjà `counter` pour un « Retrait
 * immédiat » d'avant la colonne ; une origine inconnue (`null`) n'a pas de
 * libellé, et chaque écran garde alors ce qu'il disait.
 */
export const ORDER_ENTRY_ORIGIN_LABELS: Readonly<Record<AdminOrderEntryOrigin, string>> = {
  counter: 'Prise au comptoir',
  commercial: 'Prise par le commercial',
};

/** Le libellé de l'origine, ou `null` quand on ne la connaît pas. */
export function entryOriginLabelOf(origin: AdminOrderEntryOrigin | null): string | null {
  return origin === null ? null : ORDER_ENTRY_ORIGIN_LABELS[origin];
}
