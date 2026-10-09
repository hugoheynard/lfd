import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **retours bancaires** (plan
 * `documentation/comptabilite/prelevement/plan-retours-bancaires.md`, R5a).
 *
 * Lus par la comptabilité, sans le code sous les yeux : chacun nomme le cas
 * réel et le geste de sortie. Aucun ne porte d'IBAN.
 */

/** Le motif saisi ou lu n'est pas un motif admis. */
export class InvalidBankReturnReasonError extends DomainError {
  constructor(
    readonly reasonCode: string,
    readonly why: string,
  ) {
    super(
      "accounting.collection_return.invalid_reason",
      `Motif « ${reasonCode} » refusé : ${why}.`,
    );
  }
}

/** Une saisie de retour mal formée — date, frais, note. */
export class InvalidCollectionReturnError extends DomainError {
  constructor(readonly why: string) {
    super("accounting.collection_return.invalid", `Retour bancaire refusé : ${why}.`);
  }
}

/** La ligne visée n'existe pas — ni par son lot et son rang, ni par son `EndToEndId`. */
export class ReturnableLineNotFoundError extends ResourceNotFoundError {
  constructor(readonly reference: string) {
    super(
      "accounting.collection_return.line_not_found",
      `Aucune ligne de prélèvement ne correspond à « ${reference} ». Vérifier la référence de bout en bout (EndToEndId) sur l'avis de la banque.`,
    );
  }
}

/** Le retour visé n'existe pas. */
export class CollectionReturnNotFoundError extends ResourceNotFoundError {
  constructor(readonly returnId: string) {
    super("accounting.collection_return.not_found", `Retour bancaire introuvable : ${returnId}.`);
  }
}

/** Le lot n'a pas été déposé : la banque n'a rien pu rejeter. */
export class ReturnOnUndepositedBatchError extends BusinessError {
  constructor(
    readonly endToEndId: string,
    readonly batchStatus: string,
  ) {
    super(
      "accounting.collection_return.batch_not_deposited",
      `La ligne ${endToEndId} appartient à un lot ${batchStatus === "cancelled" ? "annulé" : "pas encore déposé"} : la banque n'a rien prélevé, il n'y a rien à rejeter. Vérifier la référence de la banque.`,
    );
  }
}

/** Un débit ne se rejette qu'une fois : la ligne a déjà son retour. */
export class LineAlreadyReturnedError extends BusinessError {
  constructor(readonly endToEndId: string) {
    super(
      "accounting.collection_return.already_returned",
      `La ligne ${endToEndId} a déjà un retour bancaire enregistré. Le traiter depuis la liste des retours du lot.`,
    );
  }
}

/** Le montant du retour diffère de celui de la ligne. */
export class ReturnAmountMismatchError extends BusinessError {
  constructor(
    readonly endToEndId: string,
    readonly lineCents: number,
    readonly returnedCents: number,
  ) {
    super(
      "accounting.collection_return.amount_mismatch",
      `Le retour de ${returnedCents} centimes ne correspond pas à la ligne ${endToEndId} (${lineCents} centimes) : un retour porte sur toute la ligne. Vérifier l'avis de la banque, ou la ligne visée.`,
    );
  }
}

/** Pas de remboursement en interentreprises. */
export class RefundRequestOnB2bError extends BusinessError {
  constructor(readonly endToEndId: string) {
    super(
      "accounting.collection_return.refund_request_on_b2b",
      `La ligne ${endToEndId} est d'un lot interentreprises (B2B) : le débiteur n'y a pas droit au remboursement. Saisir un retour, ou vérifier le schéma du lot.`,
    );
  }
}

/** Le retour a déjà été traité. */
export class CollectionReturnAlreadyResolvedError extends BusinessError {
  constructor(
    readonly returnId: string,
    readonly resolution: string,
  ) {
    super(
      "accounting.collection_return.already_resolved",
      `Ce retour bancaire est déjà traité (${resolution}). Il ne se traite qu'une fois.`,
    );
  }
}

/** Pourquoi une ligne ne se re-présente pas. */
export type RepresentationRefusal =
  "statement_line" | "legacy_line" | "mandate_not_active" | "one_off_consumed";

const REFUSALS: Readonly<Record<RepresentationRefusal, string>> = {
  statement_line:
    "la ligne prélevait un arrêté de facturation (bons d'avant la facture du mois) : la re-présenter la referait facturer. Régler autrement, ou passer en perte",
  legacy_line:
    "la ligne est d'un lot d'avant l'arrêté de facturation : la re-présenter la referait facturer. Régler autrement, ou passer en perte",
  mandate_not_active:
    "le mandat n'est plus actif — il faut une nouvelle signature. Régler autrement (lien de paiement), ou faire signer un nouveau mandat puis régler autrement",
  one_off_consumed:
    "le mandat était ponctuel et a servi — il ne prélève plus. Envoyer un lien de paiement, puis régler autrement",
};

/** Les mots d'un refus de re-présentation — l'écran les montre avant le clic. */
export function representationRefusalText(refusal: RepresentationRefusal): string {
  return REFUSALS[refusal];
}

/** La re-présentation est refusée, et le message dit le geste de sortie. */
export class RepresentationRefusedError extends BusinessError {
  constructor(readonly refusal: RepresentationRefusal) {
    super(
      `accounting.collection_return.representation_${refusal}`,
      `Re-présentation refusée : ${REFUSALS[refusal]}.`,
    );
  }
}
