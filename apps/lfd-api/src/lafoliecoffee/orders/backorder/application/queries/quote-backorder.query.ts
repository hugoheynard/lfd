import type { AdminBackorderQuotePayload } from "@lfd/contracts";

/**
 * **Ce que la transformation d'un reliquat coûterait, au centime**, avant de
 * la passer (plan `documentation/commandes/reliquat/plan-reliquat-de-commande.md`,
 * § 4) : composée par le même chemin et sous la même politique que la
 * transformation — une seule arithmétique.
 */
export class QuoteBackorderQuery {
  constructor(
    readonly staffUserId: string,
    readonly backorderId: string,
    readonly payload: AdminBackorderQuotePayload,
    /** Le droit `lfc_product_limit_override:write`, lu en base par la porte staff. */
    readonly exceedItemLimits: boolean,
  ) {}
}
