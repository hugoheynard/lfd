import type { CustomerAudience, RequestKind } from "@lfd/contracts";

/** Query : les motifs qu'un formulaire de la boutique propose à ce public. */
export class ListOfferedRequestReasonsQuery {
  constructor(
    readonly kind: RequestKind,
    readonly audience: CustomerAudience,
  ) {}
}
