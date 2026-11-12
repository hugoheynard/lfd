import { DAY_JOURNALS, type DayJournal } from "@lfd/contracts";

import type { DayVersionsCard } from "./day-versions-cache.js";

/**
 * La fenêtre pendant laquelle une carte rangée se sert sans relire la base
 * (`plan-objet-des-journees.md`, § 1) : un écran voit un numéro au plus 5 s
 * après la base.
 */
export const DAY_VERSIONS_FRESH_MS = 5000;

/** Le numéro de chaque journal du registre. */
export type CompleteDayVersions = Readonly<Record<DayJournal, number>>;

/**
 * Les numéros d'une carte, si elle nomme TOUS les journaux du registre ;
 * `null` sinon. Un journal ajouté au registre rend donc incomplète toute carte
 * rangée avant lui : elle se relit au lieu de taire le nouveau journal.
 */
export function completeVersions(card: DayVersionsCard): CompleteDayVersions | null {
  const versions: Partial<Record<DayJournal, number>> = {};
  for (const journal of DAY_JOURNALS) {
    const version = card.versions[journal];
    if (version === undefined) {
      return null;
    }
    versions[journal] = version;
  }
  return isComplete(versions) ? versions : null;
}

function isComplete(
  versions: Partial<Record<DayJournal, number>>,
): versions is Record<DayJournal, number> {
  return DAY_JOURNALS.every((journal) => versions[journal] !== undefined);
}

/**
 * Vrai si la carte a été lue il y a moins de {@link DAY_VERSIONS_FRESH_MS}.
 * Une carte « du futur » (horloge d'une autre instance un peu en avance) est
 * fraîche : l'écart se compte en millisecondes, jamais en secondes.
 */
export function isFresh(card: DayVersionsCard, nowMs: number): boolean {
  return nowMs - card.readAtMs < DAY_VERSIONS_FRESH_MS;
}
