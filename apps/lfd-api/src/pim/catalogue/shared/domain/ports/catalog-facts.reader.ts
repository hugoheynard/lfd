import type { ContextVat } from "../value-objects/context-vat.js";
import type { Audience } from "../value-objects/audience.js";
import type { LocalizedText } from "../value-objects/localized-text.js";
import type { ProductRecord } from "../../../product/domain/ports/product.repository.js";

/**
 * Une famille telle que les faits la décrivent — **archivée comprise**, et
 * avec son audience, ce que `ChannelCategory` ne porte pas.
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
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`).
 *
 * Port de lecture à part de `CatalogueReader` (ISP) : celui-là sert le push et
 * ses aperçus, et n'a pas à savoir lire une fiche archivée ni l'audience d'une
 * famille. Celui-ci relit DANS la transaction de l'émetteur — l'adaptateur suit
 * la transaction ambiante — et rend archivées comprises : une fiche archivée
 * s'émet aussi, pour que la plateforme la retire.
 */
export abstract class CatalogFactsReader {
  abstract products(ids: readonly string[]): Promise<ProductRecord[]>;
  abstract families(ids: readonly string[]): Promise<CatalogFamilyRecord[]>;
  abstract productIdsOfFamilies(familyIds: readonly string[]): Promise<string[]>;
  abstract allProductIds(): Promise<string[]>;
  abstract allFamilyIds(): Promise<string[]>;
}
