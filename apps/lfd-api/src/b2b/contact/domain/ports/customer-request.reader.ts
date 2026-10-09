import type { CustomerRequestStatus, CustomerRequestView, RequestKind } from "@lfd/contracts";

/** Où relire une photo : sa clé, et le type relu au dépôt. */
export interface StoredRequestPhoto {
  readonly storageKey: string;
  readonly contentType: string;
}

/** Port de **lecture** des demandes, pour la boîte du back-office. */
export abstract class CustomerRequestReader {
  /**
   * « À traiter » : urgent d'abord, puis le plus ancien ; « traitées » : la
   * plus récemment traitée. `kind` `null` = tous les types. Bornée.
   */
  abstract list(
    status: CustomerRequestStatus,
    kind: RequestKind | null,
    limit: number,
  ): Promise<CustomerRequestView[]>;

  /** Une photo NON purgée de cette demande, ou `null`. */
  abstract photo(requestId: string, photoId: string): Promise<StoredRequestPhoto | null>;
}
