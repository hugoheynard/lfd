import { CollectionTestLookalikeError } from "../errors/collection-test-errors.js";
import { parisDayOf } from "./collection-test-file.js";

/**
 * La fenêtre, en jours, pendant laquelle la banque peut prendre pour un
 * doublon deux débits au même débiteur, de même montant et même échéance —
 * « 10 à 15 jours » (réponse 21 de la banque ; décision de Hugo du
 * 2026-10-26 : on prend la borne haute).
 */
export const LOOKALIKE_WINDOW_DAYS = 15;

const DAY_MS = 86_400_000;

/** Un essai déjà généré sur le même mandat, tel que la garde le compare. */
export interface PriorCollectionTest {
  readonly endToEndId: string;
  readonly amountCents: number;
  readonly createdAt: Date;
}

/** Le premier instant que la fenêtre couvre, vue depuis `at`. */
export function lookalikeWindowStart(at: Date): Date {
  return new Date(at.getTime() - LOOKALIKE_WINDOW_DAYS * DAY_MS);
}

/**
 * Refuse un essai du MÊME montant qu'un essai généré sur le même mandat dans
 * la fenêtre : la banque pourrait rejeter le second comme doublon, et l'essai
 * n'éprouverait plus rien.
 *
 * @throws {CollectionTestLookalikeError}
 */
export function assertNoLookalike(
  prior: readonly PriorCollectionTest[],
  amountCents: number,
  at: Date,
): void {
  const start = lookalikeWindowStart(at).getTime();
  const twin = prior.find(
    (test) => test.amountCents === amountCents && test.createdAt.getTime() >= start,
  );
  if (twin !== undefined) {
    throw new CollectionTestLookalikeError(
      twin.endToEndId,
      parisDayOf(twin.createdAt),
      amountCents,
      LOOKALIKE_WINDOW_DAYS,
    );
  }
}
