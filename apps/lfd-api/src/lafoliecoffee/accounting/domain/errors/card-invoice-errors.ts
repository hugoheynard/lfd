import { ResourceNotFoundError } from "../../../../platform/shared/errors/app-error.js";

/** La commande à facturer n'existe pas (lot E5a) — un identifiant faux, jamais un cas métier. */
export class OrderToInvoiceNotFoundError extends ResourceNotFoundError {
  constructor(readonly orderId: string) {
    super(
      "accounting.card_invoice.order_not_found",
      `Aucune commande « ${orderId} » à facturer : vérifier le lien suivi depuis l'écran.`,
    );
  }
}
