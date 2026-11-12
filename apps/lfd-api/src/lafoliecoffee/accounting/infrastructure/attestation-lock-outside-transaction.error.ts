import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Une attestation (contrôle des retours, lot de prélèvement) a été chargée
 * sous verrou hors d'une unité de travail — une faute de câblage : en
 * autocommit, le verrou est relâché à la fin de sa propre instruction, et
 * l'écriture qui suit ne serait plus protégée.
 */
export class AttestationLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "accounting.attestation.lock_outside_transaction",
      "Le verrou d'une attestation exige une transaction ouverte : la charger sous UnitOfWork.run.",
    );
  }
}
