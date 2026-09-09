import type { PriceProjectionPayload } from "@lfd/contracts";

/**
 * « Que coûterait cet article si le cumul valait N ? » — pour des niveaux qui
 * n'existent pas encore.
 *
 * La question ne porte **pas** d'instant, et c'est délibéré : projeter, c'est
 * répondre au présent sur des volumes hypothétiques. L'instant est donc lu par
 * le handler, à l'horloge, plutôt que transporté depuis le fil — un appelant qui
 * choisirait la date rendrait la courbe négociable.
 */
export class ProjectPriceQuery {
  constructor(readonly payload: PriceProjectionPayload) {}
}
