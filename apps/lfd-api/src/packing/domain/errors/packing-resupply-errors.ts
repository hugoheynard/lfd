import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de la fiche de réassort au colisage** (réassort, lot R3b,
 * `reassort-boutiques/plan-reapprovisionnement.md` §13). Lus par l'équipe du
 * poste : chacun nomme le point et le geste de sortie.
 */

/** La fiche n'est pas (encore) au colisage. */
export class PackingResupplyNotDrawnError extends ResourceNotFoundError {
  constructor(resupplyId: string) {
    super(
      "packing.resupply.not_drawn",
      `Le réassort ${resupplyId} n'est pas au poste de colisage pour cette journée : soit le plan du fournil n'est pas encore arrêté, soit son point n'est pas servi par un transfert (il n'est alors pas colisé). Vérifiez la journée, ou réessayez dans un instant si le plan vient d'être arrêté.`,
    );
  }
}

/** Cet article n'est pas demandé sur ce réassort. */
export class PackingResupplyLineNotFoundError extends ResourceNotFoundError {
  constructor(sku: string, title: string) {
    super(
      "packing.resupply.line_not_found",
      `Aucune ligne « ${sku} » sur la fiche ${title} : on n'emballe que ce que le point a demandé.`,
    );
  }
}

/** La quantité emballée est hors de 0…demandée. */
export class PackedResupplyQuantityOutOfRangeError extends DomainError {
  constructor(productName: string, requested: number) {
    super(
      "packing.resupply.packed_out_of_range",
      `La quantité emballée de « ${productName} » doit être un nombre entier entre 0 et ${String(requested)}, la quantité demandée. Si vous en avez emballé davantage, retirez le surplus : le point n'en a pas demandé plus.`,
    );
  }
}

/** La fiche est close : l'emballé est parti au commerce. */
export class PackingResupplyClosedError extends BusinessError {
  constructor(title: string) {
    super(
      "packing.resupply.closed",
      `La fiche ${title} est close : la quantité emballée a été transmise au point. Un écart se constate à la réception, au comptoir.`,
    );
  }
}

/** On ne clôt pas une fiche dont une ligne n'a pas été saisie. */
export class PackingResupplyIncompleteError extends BusinessError {
  constructor(title: string, productNames: readonly string[]) {
    super(
      "packing.resupply.incomplete",
      `La fiche ${title} ne peut pas être close : la quantité emballée de ${productNames.map((n) => `« ${n} »`).join(", ")} n'est pas saisie. Saisissez 0 pour un article qui ne part pas.`,
    );
  }
}

/** Une réservation de réassort sans pièce, ou en pièces fractionnaires. */
export class StockReservationQuantityInvalidError extends DomainError {
  constructor(sku: string, quantity: number) {
    super(
      "packing.resupply.reservation_invalid",
      `La réservation de « ${sku} » pour un réassort lancé doit porter un nombre entier de pièces supérieur à 0 (reçu : ${String(quantity)}). Le fait du fournil est hors contrat : corriger l'émetteur, puis rejouer le message depuis la carte de santé.`,
    );
  }
}
