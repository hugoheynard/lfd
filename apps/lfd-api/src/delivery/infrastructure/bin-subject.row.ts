import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import type { BinSubject } from "../domain/value-objects/bin-subject.js";

/** Un bac sans sujet, ou à deux sujets : le CHECK de la table aurait dû le refuser. */
class BinSubjectCorruptedError extends TechnicalError {
  constructor() {
    super(
      "delivery.bin_subject_corrupted",
      "Un bac ne porte pas exactement un sujet (commande ou transfert) : signalez-le à l'équipe technique, sans retoucher le bac.",
    );
  }
}

/** Les deux colonnes du sujet d'un bac. */
export interface BinSubjectColumns {
  readonly orderId: string | null;
  readonly transferId: string | null;
}

/**
 * Le sujet relu d'une ligne de `delivery_bin` (lot T3). La contrainte
 * `delivery_bin_subject_check` le garantit en base ; on le revérifie plutôt
 * que de choisir une colonne au jugé.
 *
 * @throws {BinSubjectCorruptedError}
 */
export function binSubjectOfRow(row: BinSubjectColumns): BinSubject {
  if (row.orderId !== null && row.transferId === null) {
    return { kind: "order", orderId: row.orderId };
  }
  if (row.orderId === null && row.transferId !== null) {
    return { kind: "transfer", transferId: row.transferId };
  }
  throw new BinSubjectCorruptedError();
}

/** Le sujet → ses deux colonnes. */
export function binSubjectColumns(subject: BinSubject): BinSubjectColumns {
  return subject.kind === "order"
    ? { orderId: subject.orderId, transferId: null }
    : { orderId: null, transferId: subject.transferId };
}
