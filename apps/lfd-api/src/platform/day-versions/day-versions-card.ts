import type { SubjectReading } from "./day-versions-cache.js";

/**
 * La fenêtre des sujets journaliers : l'intervalle même des onglets (15 s,
 * `day-version-watcher.ts`). Une seule relecture des numéros par tranche de
 * 15 s et par journée, quel que soit le nombre d'onglets : l'objet fait lire
 * moins la base dès deux onglets (Hugo, 2026-11-12). Le prix : un écran voit
 * un numéro au plus 15 s après la base, soit 30 s de retard au pire avec
 * l'intervalle de l'onglet ; les gestes restent jugés par le serveur.
 */
export const DAY_VERSIONS_FRESH_MS = 15_000;

/**
 * Vrai si le numéro a été lu il y a moins de `freshMs`. Un numéro « du
 * futur » (horloge d'une autre instance un peu en avance) est frais : l'écart
 * se compte en millisecondes, jamais en secondes.
 */
export function isFresh(reading: SubjectReading, nowMs: number, freshMs: number): boolean {
  return nowMs - reading.readAtMs < freshMs;
}
