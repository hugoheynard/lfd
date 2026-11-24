import { NEGOTIATED_SCOPE_ERRORS } from "@lfd/contracts";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un article hors du tarif convenu** (409) : le payeur commande sur devis
 * de période, et ce qu'il commande est ce qui a été négocié en amont — la
 * mercuriale active au jour de livraison en est la trace. Le refus vaut aussi
 * quand l'équipe saisit à sa place. Le message nomme l'article par son
 * libellé, lu par le client comme par l'équipe.
 */
export class OutsideNegotiatedScopeError extends BusinessError {
  constructor(
    readonly sku: string,
    articleName: string,
  ) {
    super(
      NEGOTIATED_SCOPE_ERRORS.outsideScope,
      `Cet article n'est pas dans le tarif convenu avec votre service : ${articleName}. ` +
        "Retirez-le de la commande, ou demandez à votre commercial de l'ajouter à votre tarif.",
    );
  }
}

/**
 * **Un jour de livraison illisible** (400), posé au tarif convenu : le jour
 * `AAAA-MM-JJ` n'a pas de midi à Paris, donc aucune mercuriale ne s'y lit.
 */
export class NegotiatedScopeDayError extends DomainError {
  constructor(day: string) {
    super(
      NEGOTIATED_SCOPE_ERRORS.invalidDay,
      `Le jour de livraison « ${day} » n'est pas une date lisible : choisissez de nouveau le jour de livraison.`,
    );
  }
}
