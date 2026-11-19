import type { ContextVat } from "../../../../catalogue/shared/domain/value-objects/context-vat.js";
import type { Audience } from "../../../../catalogue/shared/domain/value-objects/audience.js";
import type { LocalizedText } from "../../../../catalogue/shared/domain/value-objects/localized-text.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";

/**
 * Une famille telle que les faits la décrivent — **archivée comprise**, et
 * avec son audience.
 *
 * Les taux sont des IDENTIFIANTS de taux par contexte : le canal les résout
 * en pourcentages, comme il le fait pour les fiches.
 */
export interface CatalogFamilyRecord {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
  readonly isArchived: boolean;
  readonly audience: Audience;
  readonly vatByContext: ContextVat;
}

/**
 * **Ce que les faits du catalogue relisent** (lot 2a de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`).
 *
 * Déclaré par le canal, implémenté dans son infrastructure en composant les
 * lectures que la fiche et la famille publient. Il relit DANS la transaction de l'émetteur — l'adaptateur suit la
 * transaction ambiante — et rend archivées comprises : une fiche archivée
 * s'émet aussi, pour que la plateforme la retire.
 */
export abstract class CatalogFactsReader {
  abstract products(ids: readonly string[]): Promise<ProductRecord[]>;
  abstract families(ids: readonly string[]): Promise<CatalogFamilyRecord[]>;
  abstract productIdsOfFamilies(familyIds: readonly string[]): Promise<string[]>;
  abstract allProductIds(): Promise<string[]>;
  abstract allFamilyIds(): Promise<string[]>;
}
