import type { Data } from '@angular/router';

/**
 * **Quel journal l'écran lit** — le journal d'activité entier, ou sa tranche
 * fiscale (plan `journalisation/plan-journal-d-activite.md`, lot 4).
 *
 * Un seul écran pour les deux : ils se lisent de la même façon — mêmes lignes,
 * même recherche, mêmes pages figées — et ne diffèrent que par la route qu'ils
 * interrogent et le filtre par module, que la tranche fiscale n'a pas. Deux
 * copies auraient divergé au premier correctif posé d'un seul côté.
 *
 * - `activity` — `GET /admin/activity`, sous `activity:read` ;
 * - `tax` — `GET /admin/activity/tax`, sous `pim_tax:write` : la comptabilité
 *   relit ce qu'elle écrit, bornée **au serveur** à une liste fermée de types.
 */
export type JournalSource = 'activity' | 'tax';

/** La clé de donnée de route qui choisit la source. */
export const JOURNAL_SOURCE_KEY = 'journalSource';

/**
 * La source que la route déclare. Absente ou inconnue : le journal entier —
 * c'est la route qui existait avant la tranche fiscale, et elle ne déclare rien.
 *
 * Lue sur la donnée de route plutôt que par un `input()` lié : l'écran lit dès
 * son constructeur, avant que le routeur ait posé ses entrées.
 */
export function readJournalSource(data: Data): JournalSource {
  return data[JOURNAL_SOURCE_KEY] === 'tax' ? 'tax' : 'activity';
}
