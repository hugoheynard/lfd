import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import type { BatchAttestationKind } from "../services/collection-batch-attestations.js";

/**
 * Les refus des attestations d'un lot (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2, P3). Lus par la
 * comptabilité, sans le code sous les yeux : chacun nomme le geste et la
 * sortie.
 */

/** Le nom d'une attestation, tel que l'écran la dit. */
export const BATCH_ATTESTATION_LABELS: Readonly<Record<BatchAttestationKind, string>> = {
  audit_reviewed: "« Contrôle CSV relu »",
  remittance_signed: "« Remise signée sur CENET »",
  psr_read: "« Comptes rendus PSR lus »",
};

/** Une sorte inconnue, une note de retrait vide ou trop longue. */
export class InvalidBatchAttestationError extends DomainError {
  constructor(readonly why: string) {
    super("accounting.batch_attestation.invalid", `Attestation du lot refusée : ${why}.`);
  }
}

/** Déjà attestée : une seconde attestation ne dirait rien de plus. */
export class BatchAttestationAlreadyGivenError extends BusinessError {
  constructor(readonly kind: BatchAttestationKind) {
    super(
      "accounting.batch_attestation.already_given",
      `${BATCH_ATTESTATION_LABELS[kind]} est déjà noté pour ce lot. Si c'était faux, retirez-le d'abord.`,
    );
  }
}

/** Retirer ce qui n'est pas attesté : il n'y a rien à retirer. */
export class BatchAttestationNotGivenError extends BusinessError {
  constructor(readonly kind: BatchAttestationKind) {
    super(
      "accounting.batch_attestation.not_given",
      `${BATCH_ATTESTATION_LABELS[kind]} n'est pas noté pour ce lot : il n'y a rien à retirer. Rechargez la page, quelqu'un l'a peut-être déjà retiré.`,
    );
  }
}

/**
 * Le lot n'en est pas là : la remise ne se signe qu'après « J'ai déposé le
 * fichier dans CENET », les accusés PSR ne se lisent qu'après un dépôt, et un
 * lot annulé n'a plus rien à relire.
 */
export class BatchAttestationOutOfOrderError extends BusinessError {
  constructor(
    readonly kind: BatchAttestationKind,
    readonly exit: string,
  ) {
    super(
      "accounting.batch_attestation.out_of_order",
      `${BATCH_ATTESTATION_LABELS[kind]} ne peut pas être noté sur ce lot : ${exit}`,
    );
  }
}
