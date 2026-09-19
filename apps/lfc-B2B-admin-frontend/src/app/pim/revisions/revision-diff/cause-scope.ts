import type { CatalogRevisionCauseView } from '@lfd/pim-contracts';

import { contextWord } from '../../../shared/journal/context-word';
import { keyLabel } from '../../../shared/journal/key-labels';

/**
 * **La portée d'une cause, en une ligne** — « Brunch : 1 · À emporter : 2 ».
 *
 * Chaque clé de `blast` se dit, dans cet ordre :
 *
 * 1. le libellé du contexte figé dans le fait (`contextLabels`, depuis le
 *    2026-09-19) — le nom QUAND c'est arrivé, même si le contexte a été
 *    renommé depuis ;
 * 2. le dictionnaire des contextes de vente du journal (`SALES_CONTEXT`, par
 *    `contextWord`, le même lecteur que la phrase et le détail du journal) ;
 * 3. le dictionnaire des clés du journal (`KEY_LABELS`) — c'est lui qui nomme
 *    la portée d'août (`familiesEmporter` → « Familles à emporter »), et les
 *    clés qui ne sont pas des contextes (`articles`) ;
 * 4. la clé brute : un nom technique se cherche, un nom inventé trompe.
 *
 * `''` quand la portée n'a pas été enregistrée : rien ne s'affiche alors,
 * plutôt qu'un « 0 » qui affirmerait que ça n'a rien touché.
 */
export function causeScope(cause: CatalogRevisionCauseView): string {
  const labels = { contextLabels: cause.contextLabels ?? {} };
  return Object.entries(cause.blast)
    .map(([key, count]) => `${contextWord(labels, key) ?? keyLabel(key) ?? key} : ${String(count)}`)
    .join(' · ');
}
