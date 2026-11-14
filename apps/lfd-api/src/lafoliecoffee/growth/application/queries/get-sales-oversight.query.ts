import type { SalesOversightQuery } from "@lfd/contracts";

/** Query : une page du suivi commercial, filtrée. */
export class GetSalesOversightQuery {
  constructor(readonly filters: SalesOversightQuery) {}
}
