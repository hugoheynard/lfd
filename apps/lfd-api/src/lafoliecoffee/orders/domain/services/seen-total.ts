import { OrderTotalChangedError } from "../errors/order-total-changed.error.js";

/**
 * **Une commande ne naît jamais à un montant que le client n'a pas vu** (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, § 7.1, lot T2).
 *
 * Compare le TTC composé par l'agrégat au total vu. Appelé par les trois
 * passations juste après `draft` (les gardes de l'agrégat ont parlé) et AVANT
 * le règlement : un refus ici ne laisse aucune intention Stripe orpheline —
 * rang 7 bis de l'ordre des refus (`le-prix-d-un-panier.md`, § 2.4).
 *
 * Le champ est obligatoire au contrat depuis le lot T3 : il n'y a plus de
 * passation qui échappe à la comparaison.
 *
 * @throws {OrderTotalChangedError} les deux totaux diffèrent, d'un centime ou plus.
 */
export function ensureTotalSeen(totalCents: number, expectedTotalCents: number): void {
  if (expectedTotalCents === totalCents) {
    return;
  }
  throw new OrderTotalChangedError(expectedTotalCents, totalCents);
}
