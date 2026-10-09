import { InvalidBatchIdError } from "../errors/collection-errors.js";
import type { SequenceType } from "./pain008-document.js";

/**
 * **Les références SEPA d'un lot** — dérivées de l'identifiant du LOT, jamais
 * du cycle (plan `lot-de-prelevement-fige.md` ; trouvaille T16).
 *
 * ## 🔴 Format ARRÊTÉ le 2026-10-05 — irréversible dès le premier dépôt
 *
 * | Champ        | Forme                   | Longueur |
 * | ------------ | ----------------------- | -------- |
 * | `MsgId`      | `<lot>`                 | 26       |
 * | `PmtInfId`   | `<lot>-<RCUR\|OOFF>`    | 31       |
 * | `EndToEndId` | `<lot>-<rang sur 4>`    | 31       |
 *
 * `<lot>` est l'ULID du lot, en majuscules Crockford — dans le jeu SEPA, sous la
 * borne de 35. La banque rapproche un rejet par `EndToEndId` : changer ce
 * format après un dépôt rendrait introuvables les lignes déjà parties. Un lot
 * annulé puis reconstitué prend un AUTRE ULID, donc n'émet jamais deux fois le
 * même `MsgId`, et un rang ne désigne jamais deux débiteurs d'un fichier à
 * l'autre.
 *
 * Le rang est sur quatre chiffres : 9 999 débiteurs par fichier. Au-delà, le
 * refus est explicite plutôt qu'un rang à cinq chiffres qui changerait le format.
 */

/** Un ULID : 26 caractères Crockford base32 (sans I, L, O, U). */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

/** Le dernier rang exprimable. */
export const MAX_LINE_RANK = 9_999;

export interface BatchSepaIdentifiers {
  readonly messageId: string;
  readonly paymentInfoIdOf: (sequence: SequenceType) => string;
  /** @param rank 1 à `MAX_LINE_RANK`. */
  readonly endToEndIdOf: (rank: number) => string;
}

/** @throws {InvalidBatchIdError} l'identifiant n'est pas un ULID, ou le rang sort du format. */
export function batchSepaIdentifiers(batchId: string): BatchSepaIdentifiers {
  if (!ULID.test(batchId)) {
    throw new InvalidBatchIdError(batchId);
  }
  return {
    messageId: batchId,
    paymentInfoIdOf: (sequence) => `${batchId}-${sequence}`,
    endToEndIdOf: (rank) => {
      if (!Number.isInteger(rank) || rank < 1 || rank > MAX_LINE_RANK) {
        throw new InvalidBatchIdError(`${batchId} (rang ${String(rank)})`);
      }
      return `${batchId}-${String(rank).padStart(4, "0")}`;
    },
  };
}
