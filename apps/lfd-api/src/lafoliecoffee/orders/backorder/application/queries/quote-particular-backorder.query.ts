import type { AdminBackorderParticularQuotePayload } from "@lfd/contracts";

/**
 * **Ce que la transformation d'un reliquat de particulier coûterait, au
 * centime** (plan `documentation/commandes/reliquat/plan-reliquat-de-commande.md`,
 * § 5 bis) : composée par la même préparation et sous la même politique que
 * la transformation — une seule arithmétique.
 */
export class QuoteParticularBackorderQuery {
  constructor(
    readonly staffUserId: string,
    readonly backorderId: string,
    readonly payload: AdminBackorderParticularQuotePayload,
  ) {}
}
