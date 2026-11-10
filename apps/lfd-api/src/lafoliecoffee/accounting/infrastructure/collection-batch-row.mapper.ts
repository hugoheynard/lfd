import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { BankRejectionStamp } from "../domain/entities/collection-batch-stamps.js";
import { sequenceTypeFrom, type SequenceType } from "../domain/services/sepa-sequence.js";

/**
 * Les colonnes d'un lot et de ses lignes que plusieurs adaptateurs relisent —
 * le dépôt du lot, son lecteur d'écran, celui des retours. Recopiées dans
 * chacun jusqu'au 2026-10-23 : une seule lecture désormais, pour qu'un
 * `CHECK` changé ne se relise pas de trois façons.
 */

/**
 * Le rejet déclaré d'un lot : les trois colonnes ou rien — le CHECK
 * `collection_batch_rejected_is_signed` les pose ensemble.
 */
export function bankRejectionFromRow(
  at: Date | null,
  staffId: string | null,
  reason: string | null,
): BankRejectionStamp | null {
  return at === null || staffId === null || reason === null ? null : { at, staffId, reason };
}

/** La séquence d'une ligne ; la base la tient par `CHECK`, une autre valeur est une ligne corrompue. */
export function sequenceFromRow(raw: string): SequenceType {
  const sequence = sequenceTypeFrom(raw);
  if (sequence === null) {
    throw new CorruptBatchLineError(raw);
  }
  return sequence;
}

/** Inatteignable tant que le `CHECK` existe ; on refuse plutôt que deviner une séquence. */
class CorruptBatchLineError extends TechnicalError {
  constructor(raw: string) {
    super(
      "accounting.collection.corrupt_line",
      `Une ligne de lot porte la séquence « ${raw} », ni RCUR ni OOFF : la contrainte collection_batch_line_sequence a été levée. Prévenir la technique.`,
    );
  }
}
