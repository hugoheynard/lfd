import type { CustomerRequestStatus, RequestKind } from "@lfd/contracts";

/** Query : la boîte « Demandes clients » — à traiter / traitées, d'un type ou de tous (`null`). */
export class ListCustomerRequestsQuery {
  constructor(
    readonly status: CustomerRequestStatus,
    readonly kind: RequestKind | null,
  ) {}
}
