import {
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** La commande à facturer n'existe pas (lot E5a) — un identifiant faux, jamais un cas métier. */
export class OrderToInvoiceNotFoundError extends ResourceNotFoundError {
  constructor(readonly orderId: string) {
    super(
      "accounting.card_invoice.order_not_found",
      `Aucune commande « ${orderId} » à facturer : vérifier le lien suivi depuis l'écran.`,
    );
  }
}

/**
 * Une facture carte préparée sans solde posé (plan E9, lot F, § 3.3) : le
 * verdict rend `awaiting_settlement` avant toute préparation. Un défaut de
 * code, jamais rangé en `blocked` : il remonte et se relance.
 */
export class UnsettledCardInvoicePreparationError extends TechnicalError {
  constructor(readonly orderNumber: string) {
    super(
      "accounting.card_invoice.unsettled_preparation",
      `La facture carte du bon ${orderNumber} a été préparée sans solde posé : le verdict aurait ` +
        "dû l'attendre. Rien n'a été émis ; le signaler à l'équipe technique.",
    );
  }
}
