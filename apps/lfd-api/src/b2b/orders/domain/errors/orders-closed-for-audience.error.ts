import { ORDERS_CLOSED_FOR_AUDIENCE, type CustomerAudience } from "@lfd/contracts";

import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/** Comment le refus nomme la clientèle : c'est elle que la personne reconnaît. */
const AUDIENCE_NAMES: Readonly<Record<CustomerAudience, string>> = {
  b2b: "des pros",
  b2c: "des particuliers",
};

/**
 * La boutique ne prend pas les commandes de cette clientèle (**409**) — le
 * staff l'a fermée dans « E-commerce LFC → Réglages → Ouverture de la
 * boutique ».
 *
 * Un GARDE : la boutique ne montre pas le bouton de commande à une clientèle
 * fermée, et ce refus n'arrive que d'un écran resté ouvert ou d'un appel
 * direct. Le catalogue et les prix, eux, restent servis ; et une commande
 * peut toujours être saisie par l'équipe.
 */
export class OrdersClosedForAudienceError extends BusinessError {
  constructor(readonly audience: CustomerAudience) {
    super(
      ORDERS_CLOSED_FOR_AUDIENCE,
      `La boutique ne prend pas de commandes ${AUDIENCE_NAMES[audience]} pour le moment. Le catalogue reste consultable : réessayez plus tard.`,
    );
  }
}
