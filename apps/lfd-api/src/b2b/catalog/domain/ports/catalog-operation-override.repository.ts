import type { CatalogOperationOverride } from "../entities/catalog-operation-override.js";

/** Port d'**écriture** de la surcharge d'une opération reçue (D9). */
export abstract class CatalogOperationOverrideRepository {
  abstract load(operationKey: string): Promise<CatalogOperationOverride | null>;

  abstract save(override: CatalogOperationOverride): Promise<void>;
}
