import type { LibraryFilter } from "../domain/ports/media-library-reader.js";
import { depositPeriodOf, shotPeriodOf } from "./library-period.js";

/**
 * **Les filtres du fonds, tels qu'un écran les demande** — ce que le feed et
 * la frise des couleurs partagent : les deux doivent montrer le même
 * fonds, donc traduire leurs critères au même endroit.
 */
export interface LibraryFilterCriteria {
  /** Cherché dans l'étiquette, en sous-chaîne, casse ignorée. */
  readonly q?: string | undefined;
  /** Les mots-clés que l'image doit porter — tous. */
  readonly tags?: readonly string[] | undefined;
  /** Premier et dernier jour de DÉPÔT, inclus, `AAAA-MM-JJ` à l'heure de Paris. */
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /** Premier et dernier jour de PRISE DE VUE (série, sinon dépôt), inclus. */
  readonly shotFrom?: string | undefined;
  readonly shotTo?: string | undefined;
  readonly untagged?: boolean | undefined;
  readonly unused?: boolean | undefined;
  /** Seulement les images de cette série. */
  readonly series?: string | undefined;
}

/**
 * Critères → filtre du port, périodes vérifiées.
 *
 * @throws {InvalidDepositPeriodError} une période inversée ou un jour inexistant.
 */
export function libraryFilterOf(criteria: LibraryFilterCriteria): LibraryFilter {
  const deposit = depositPeriodOf(criteria.from, criteria.to);
  const shot = shotPeriodOf(criteria.shotFrom, criteria.shotTo);
  return {
    ...(criteria.q === undefined ? {} : { q: criteria.q }),
    ...(criteria.tags === undefined ? {} : { tags: criteria.tags }),
    ...(criteria.series === undefined ? {} : { seriesId: criteria.series }),
    ...(deposit.from === undefined ? {} : { depositedFrom: deposit.from }),
    ...(deposit.before === undefined ? {} : { depositedBefore: deposit.before }),
    ...(shot.from === undefined ? {} : { takenFrom: shot.from }),
    ...(shot.to === undefined ? {} : { takenTo: shot.to }),
    ...(criteria.untagged === true ? { untagged: true } : {}),
    ...(criteria.unused === true ? { unused: true } : {}),
  };
}
