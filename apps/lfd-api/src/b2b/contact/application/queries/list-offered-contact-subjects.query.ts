import type { CustomerAudience } from "@lfd/contracts";

/** Query : les objets que la boutique propose à ce public. */
export class ListOfferedContactSubjectsQuery {
  constructor(readonly audience: CustomerAudience) {}
}
