import type { AdminBackorderConvertPayload } from "@lfd/contracts";

/**
 * **Transformer un reliquat en commande**, depuis le back-office (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4).
 *
 * `staffUserId` vient de la porte staff ; `payload.buyerUserId`, du corps —
 * l'acheteur d'origine proposé par l'écran, vérifié contre la société comme
 * pour toute saisie de l'équipe.
 */
export class ConvertBackorderCommand {
  constructor(
    readonly staffUserId: string,
    readonly backorderId: string,
    readonly payload: AdminBackorderConvertPayload,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un double clic rend la même commande. */
    readonly intentKey: string,
    /** Le droit `lfc_product_limit_override:write`, lu en base par la porte staff. */
    readonly exceedItemLimits: boolean,
    /** Le droit `b2b_offer_order:write`, lu en base par la porte staff. */
    readonly mayOffer: boolean,
  ) {}
}
