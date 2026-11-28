import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const CENTS_PER_EURO = 100;

/**
 * La commande au compte d'un compte ouvert au comptoir dépasserait le
 * plafond réglé (**409**, `plan-comptes-du-comptoir.md`, § 3.3) : l'encours
 * déjà dû plus cette commande passe la borne. Le message nomme les deux
 * montants et les deux gestes qui existent au comptoir.
 */
export class CounterAccountCeilingExceededError extends BusinessError {
  constructor(
    readonly outstandingCents: number,
    readonly totalCents: number,
    readonly ceilingCents: number,
  ) {
    super(
      "orders.counter.ceiling_exceeded",
      `Ce compte ouvert au comptoir doit déjà ${euros(outstandingCents)} ; avec cette commande de ${euros(totalCents)}, il dépasserait le plafond de ${euros(ceilingCents)}. Convertissez le compte, ou encaissez cette commande par carte.`,
    );
  }
}

function euros(cents: number): string {
  return EUROS.format(cents / CENTS_PER_EURO);
}
