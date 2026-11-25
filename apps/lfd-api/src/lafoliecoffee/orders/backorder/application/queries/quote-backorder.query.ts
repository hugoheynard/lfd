import type { AdminBackorderQuotePayload } from "@lfd/contracts";

/**
 * **Ce que la transformation d'un reliquat coûterait, au centime**, avant de
 * la passer (`documentation/commandes/reliquat/reliquat.md`,
 * § 6.3) : composée par le même chemin et sous la même politique que la
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
