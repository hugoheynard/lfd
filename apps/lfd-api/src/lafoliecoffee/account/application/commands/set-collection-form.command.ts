import type { CollectionForm } from "@lfd/contracts";

/** Le staff règle la forme de prélèvement d'un site, à l'instant du geste (§2.1 ter). */
export class SetCollectionFormCommand {
  constructor(
    readonly companyId: string,
    readonly form: CollectionForm,
  ) {}
}
