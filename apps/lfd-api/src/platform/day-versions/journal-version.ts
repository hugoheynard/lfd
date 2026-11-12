import { TechnicalError } from "../shared/errors/app-error.js";

/** La place du compte dans le numéro : 2^21 lignes, bien au-delà de sept jours d'un journal. */
const COUNT_SLOT = 2 ** 21;

/** Le journal a dépassé ce que le numéro sait porter sans perte. */
export class JournalVersionOverflowError extends TechnicalError {
  constructor() {
    super(
      "day_versions.journal_version_overflow",
      "Le numéro d'un journal de version dépasse ce qu'un nombre JSON porte sans perte " +
        "(identifiant au-delà de 2^32). Les écrans se relisent au filet de 5 min ; " +
        "il faut changer l'encodage du numéro (`journal-version.ts`).",
    );
  }
}

/**
 * **Le numéro d'un journal en ajout seul** : la paire `max(id)` + `count(*)`
 * sur le même périmètre, lue dans la même requête, encodée en un nombre.
 *
 * `max(id)` seul rate une validation tardive : A prend l'id 100, B le 101 et
 * valide d'abord ; un lecteur voit 101 ; A valide ensuite, le max reste 101.
 * Le compte, lui, monte : le numéro change. Une purge fait baisser le compte —
 * une relecture de trop, jamais un numéro qui ment. Un numéro se compare par
 * ÉGALITÉ, jamais par ordre (décidé par Hugo le 2026-11-12).
 *
 * @throws {JournalVersionOverflowError} un identifiant au-delà de 2^32.
 */
export function journalVersion(maxId: bigint | null, count: number): number {
  if (maxId === null) {
    return 0;
  }
  const version = Number(maxId) * COUNT_SLOT + (count % COUNT_SLOT);
  if (!Number.isSafeInteger(version)) {
    throw new JournalVersionOverflowError();
  }
  return version;
}
