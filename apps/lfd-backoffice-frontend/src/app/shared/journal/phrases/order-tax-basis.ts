import type { Payload } from '../payload-read';

/**
 * **Quels totaux l'historique d'une commande montre** (décidé par Hugo le
 * 2026-11-21) : le HT pour une commande pro, le TTC pour une commande
 * particulier, et l'étiquette toujours dite — les libellés par type
 * (`KEY_LABELS_BY_TYPE`) portent « HT » ou « TTC ».
 *
 * Rend les clés à TAIRE au détail : la clientèle toujours (elle choisit la
 * base, elle ne se lit pas), puis les totaux de l'autre base. Un fait écrit
 * avant le HT (sans HT ni clientèle) montre son total, qui EST le TTC.
 */
export function hiddenTotals(
  payload: Payload,
  ttcKeys: readonly string[],
  pretaxKeys: readonly string[],
): string[] {
  const pretaxServed = pretaxKeys.every((key) => typeof payload[key] === 'number');
  const shown = payload['clientele'] === 'pro' && pretaxServed ? 'pretax' : 'ttc';
  return ['clientele', ...(shown === 'pretax' ? ttcKeys : pretaxKeys)];
}
