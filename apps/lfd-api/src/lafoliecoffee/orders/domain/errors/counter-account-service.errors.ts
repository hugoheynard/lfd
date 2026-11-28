import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un compte ouvert au comptoir ne se sert qu'en retrait (**409**,
 * `plan-comptes-du-comptoir.md`, § 3.7, Hugo 2026-11-28) : retrait en
 * boutique (`pickup`) ou « Retrait immédiat » (`immediate_pickup`, un
 * `pickup` lui aussi). Toute livraison est refusée jusqu'à la conversion.
 */
export class CounterAccountDeliveryRefusedError extends BusinessError {
  constructor() {
    super(
      "orders.counter.account_pickup_only",
      "Un compte ouvert au comptoir se retire en boutique : choisissez le retrait, ou convertissez le compte pour livrer.",
    );
  }
}

/**
 * Un compte ouvert au comptoir n'a pas de reliquat (**409**, § 3.7) : ce qui
 * n'est pas parti est abandonné, et une transformation ou une estimation de
 * reliquat lui est refusée.
 */
export class CounterAccountBackorderRefusedError extends BusinessError {
  constructor() {
    super(
      "orders.counter.account_no_backorder",
      "Un compte ouvert au comptoir n'a pas de reliquat : saisissez une nouvelle commande en retrait pour ce qui manque, ou convertissez le compte d'abord.",
    );
  }
}
