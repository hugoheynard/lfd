import type { CounterParticularOrderPayload } from "@lfd/contracts";

/**
 * L'équipe du comptoir **note la commande d'un particulier**, à régler à la
 * caisse de la boutique
 * (`documentation/commandes/passation/commande-particulier-reglee-en-boutique.md`, § 4–5).
 *
 * Deux identités : `staffUserId`, celui qui saisit (posé par la porte staff),
 * et `payload.buyerUserId`, la fiche choisie à la recherche — vérifiée par le
 * handler, jamais crue.
 */
export class PlaceParticularOrderAtCounterCommand {
  constructor(
    readonly staffUserId: string,
    readonly payload: CounterParticularOrderPayload,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}

/** La commande notée, et le TTC qui sera encaissé sur la caisse de la boutique. */
export interface PlaceParticularOrderAtCounterResult {
  readonly id: string;
  readonly orderNumber: string;
  readonly totalCents: number;
}
