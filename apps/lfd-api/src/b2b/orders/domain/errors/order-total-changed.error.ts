import { ORDER_TOTAL_CHANGED } from "@lfd/contracts";

import {
  BusinessError,
  type PublicErrorFacts,
} from "../../../../platform/shared/errors/app-error.js";

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const CENTS_PER_EURO = 100;

/**
 * Le TTC recomposé à la passation n'est pas celui que le client a vu (**409**) —
 * plan `documentation/pricing/centime-et-tva/plan-total-vu.md`, lot T2.
 *
 * Entre le devis et le clic, un prix, une promotion, un supplément de retard,
 * les frais d'une zone ou un bon ont changé. Rien n'est écrit, aucune
 * intention de paiement n'est créée, et la clé d'idempotence est rendue : le
 * client rechiffre, voit le nouveau total, et renvoie sous la même clé.
 *
 * Les deux totaux sortent en faits publiables : des nombres, sans contenu.
 */
export class OrderTotalChangedError extends BusinessError {
  override readonly facts: PublicErrorFacts;
  /** Le TTC composé — celui que le client confirme pour devenir son total vu (T3). */
  readonly totalCents: number;

  constructor(expectedTotalCents: number, totalCents: number) {
    super(
      ORDER_TOTAL_CHANGED,
      `Le total de votre commande est passé de ${euros(expectedTotalCents)} à ${euros(totalCents)} depuis l'affichage de votre panier : vérifiez le nouveau montant, puis validez à nouveau.`,
    );
    this.facts = { expectedTotalCents, totalCents };
    this.totalCents = totalCents;
  }
}

function euros(cents: number): string {
  return EUROS.format(cents / CENTS_PER_EURO);
}
