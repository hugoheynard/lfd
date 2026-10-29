/**
 * **Les refus du REPORT d'un prix négocié** sur la référence née d'un
 * détachement (`plan-tarif-date-sur-une-reference.md`, § 6 — le geste L7c).
 *
 * Lus par le staff sur la fiche produit, pas par quelqu'un qui a le code sous
 * les yeux : chacun nomme le cas et le geste de sortie.
 */

import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * **La nouvelle référence n'est pas née de l'ancienne.** Le report ne vaut que
 * pour une filiation de détachement : reporter un prix sur n'importe quelle
 * référence serait une pose déguisée, sans aucun des contrôles de la pose.
 */
export class NotDetachedFromError extends BusinessError {
  constructor(
    readonly toSku: string,
    readonly fromSku: string,
    readonly actualOrigin: string | null,
  ) {
    super(
      "pricing.mercuriale.carry_over.not_detached",
      actualOrigin === null
        ? `La référence « ${toSku} » n'est pas née d'un détachement de « ${fromSku} » au catalogue du commerce : le prix ne peut pas y être reporté. Si le détachement vient d'avoir lieu, attendez que la fiche soit reçue au commerce, puis réessayez.`
        : `La référence « ${toSku} » est née de « ${actualOrigin} », pas de « ${fromSku} » : reportez depuis la bonne ancienne référence.`,
    );
  }
}

/** **L'ancienne référence n'a plus de prix négocié** en cours ni à venir dans cette mercuriale. */
export class NoNegotiatedLineToCarryError extends BusinessError {
  constructor(
    readonly fromSku: string,
    readonly mercurialeId: string,
  ) {
    super(
      "pricing.mercuriale.carry_over.nothing_to_carry",
      `La mercuriale ${mercurialeId} ne porte plus de prix en cours ni à venir pour « ${fromSku} » : il n'y a rien à reporter. Rechargez la liste des décisions.`,
    );
  }
}

/** **La mercuriale à reporter n'existe pas, ou elle est close.** */
export class CarriedMercurialeNotFoundError extends ResourceNotFoundError {
  constructor(readonly mercurialeId: string) {
    super(
      "pricing.mercuriale.carry_over.mercuriale_not_found",
      `Aucune mercuriale ${mercurialeId} à reporter : elle a pu être close entre-temps. Rechargez la liste des décisions.`,
    );
  }
}
