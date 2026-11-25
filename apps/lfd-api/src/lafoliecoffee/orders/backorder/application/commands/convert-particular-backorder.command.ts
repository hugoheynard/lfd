import type {
  AdminBackorderParticularConvertPayload,
  AdminBackorderParticularPlacedResponse,
} from "@lfd/contracts";

/**
 * **Transformer un reliquat de particulier en commande**, réglée à la caisse
 * de la boutique ou offerte (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5 bis,
 * décision 13).
 *
 * `staffUserId` vient de la porte staff ; `payload.buyerUserId`, du corps
 * quand l'équipe a choisi une autre personne — l'acheteur passe le mur du
 * particulier, comme à la saisie du comptoir.
 */
export class ConvertParticularBackorderCommand {
  constructor(
    readonly staffUserId: string,
    readonly backorderId: string,
    readonly payload: AdminBackorderParticularConvertPayload,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un double clic rend la même commande. */
    readonly intentKey: string,
    /** Le droit `b2b_offer_order:write`, lu en base par la porte staff. */
    readonly mayOffer: boolean,
  ) {}
}

/** La commande issue du reliquat, son lieu de règlement et son TTC. */
export type ConvertParticularBackorderResult = AdminBackorderParticularPlacedResponse;
