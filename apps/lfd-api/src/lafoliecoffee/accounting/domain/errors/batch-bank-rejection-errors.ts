import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import { parisLongDay } from "./collection-errors.js";

/**
 * Les refus de « La banque a rejeté ce fichier » (plan
 * `documentation/comptabilite/prelevement/plan-lot-rejete-par-la-banque.md`).
 *
 * Le risque qu'aucun code ne ferme est de déclarer rejeté un lot dont la
 * remise est PARTIE : le lot reconstitué débiterait une seconde fois. Chaque
 * refus dit donc ce qu'il faut vérifier sur CENET avant d'aller plus loin.
 */

/** La plus longue raison acceptée : une ligne, celle de l'accusé PSR1. */
export const BANK_REJECTION_REASON_MAX = 200;

/** Le lot n'est pas déposé : un lot préparé s'annule, il ne se « rejette » pas. */
export class BatchNotDepositedError extends BusinessError {
  constructor(
    readonly batchId: string,
    readonly status: string,
  ) {
    super(
      "accounting.collection.batch_not_deposited",
      status === "constituted"
        ? `Le lot ${batchId} n'a pas été marqué déposé : si la banque a refusé son fichier, l'annuler et le préparer de nouveau.`
        : `Le lot ${batchId} est « ${status} » : seul un lot déposé peut être déclaré rejeté par la banque.`,
    );
  }
}

/**
 * Une ligne au moins a un retour : la remise a été EXÉCUTÉE, le fichier n'a
 * donc pas été rejeté entier.
 */
export class RejectedBatchHasReturnsError extends BusinessError {
  constructor(readonly debtorNames: readonly string[]) {
    super(
      "accounting.collection.rejected_batch_has_returns",
      `Ce lot a des retours bancaires enregistrés (${debtorNames.join(", ")}) : la banque l'a exécuté, son fichier n'a pas été rejeté entier. Traiter chaque ligne revenue en retour, depuis le lot.`,
    );
  }
}

/**
 * L'échéance est atteinte : un accusé PSR1 arrive avant l'exécution, et un
 * rejet saisi maintenant est soit tardif, soit faux — c'est le second qui
 * débite deux fois (décision de Hugo, 2026-10-23, Q3).
 */
export class BankRejectionAfterCollectionDayError extends BusinessError {
  constructor(
    readonly batchId: string,
    readonly collectionDay: string | null,
  ) {
    super(
      "accounting.collection.rejection_after_collection_day",
      collectionDay === null
        ? `Le lot ${batchId} a été constitué avant le 2026-10-08 et son échéance est passée : il ne se déclare plus rejeté. Vérifier sur CENET que la remise n'est pas partie ; si elle l'est, traiter les lignes en retours.`
        : `L'échéance du lot ${batchId} (${parisLongDay(new Date(`${collectionDay}T12:00:00.000Z`))}) est atteinte : il ne se déclare plus rejeté. Vérifier sur CENET que la remise n'est pas partie ; si elle l'est, traiter les lignes en retours.`,
    );
  }
}

/** Le motif est vide ou trop long. */
export class InvalidBankRejectionReasonError extends DomainError {
  constructor(readonly length: number) {
    super(
      "accounting.collection.invalid_rejection_reason",
      length === 0
        ? "Le motif du rejet est obligatoire : recopier la raison donnée par l'accusé de la banque (PSR1)."
        : `Le motif du rejet fait ${String(length)} caractères : ${String(BANK_REJECTION_REASON_MAX)} au plus. Le résumer.`,
    );
  }
}
