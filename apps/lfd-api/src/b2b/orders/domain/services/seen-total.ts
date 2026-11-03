import { OrderTotalChangedError } from "../errors/order-total-changed.error.js";

/**
 * **Une commande ne naît jamais à un montant que le client n'a pas vu** (plan
 * `documentation/pricing/centime-et-tva/plan-total-vu.md`, § 2.2, lot T2).
 *
 * Compare le TTC composé par l'agrégat au total vu. Appelé par les trois
 * passations juste après `draft` (les gardes de l'agrégat ont parlé) et AVANT
 * le règlement : un refus ici ne laisse aucune intention Stripe orpheline —
 * rang 7 bis de l'ordre des refus (`plan-un-seul-assemblage.md`, § 2.4).
 *
 * Absent, rien n'est comparé : le champ est facultatif jusqu'au lot T3.
 *
 * @throws {OrderTotalChangedError} les deux totaux diffèrent, d'un centime ou plus.
 */
export function ensureTotalSeen(totalCents: number, expectedTotalCents: number | undefined): void {
  if (expectedTotalCents === undefined || expectedTotalCents === totalCents) {
    return;
  }
  throw new OrderTotalChangedError(expectedTotalCents, totalCents);
}
