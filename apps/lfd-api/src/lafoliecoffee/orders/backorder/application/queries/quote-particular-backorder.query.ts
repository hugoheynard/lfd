import type { AdminBackorderParticularQuotePayload } from "@lfd/contracts";

/**
 * **Ce que la transformation d'un reliquat de particulier coûterait, au
 * centime** (`documentation/commandes/reliquat/reliquat.md`,
 * § 6.4) : composée par la même préparation et sous la même politique que
 * la transformation — une seule arithmétique.
 */
export class QuoteParticularBackorderQuery {
  constructor(
    readonly staffUserId: string,
    readonly backorderId: string,
    readonly payload: AdminBackorderParticularQuotePayload,
  ) {}
}
