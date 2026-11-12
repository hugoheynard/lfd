import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { ProductStatus } from "../../../product/domain/entities/product.js";
import type { VariantSnapshot } from "../../../product/domain/entities/variant.js";

/**
 * Une déclinaison telle que la matrice la lit : son nom, son rang, son arrêt
 * et ses allergènes **résolus** (`alignedAllergenSheet`) — ni prix, ni
 * nutrition. Un `VariantSnapshot` la satisfait.
 */
export type MatrixVariantRecord = Pick<
  VariantSnapshot,
  "id" | "sku" | "name" | "position" | "isDiscontinued" | "allergenSheet"
>;

/**
 * Une fiche telle que la matrice la lit — un type ALLÉGÉ : ni nutrition, ni
 * TVA de contexte, que la matrice ne montre pas. Un `ProductSnapshot` la
 * satisfait (les spécimens en passent).
 */
export interface MatrixProductRecord {
  readonly id: string;
  readonly name: LocalizedText;
  readonly status: ProductStatus;
  readonly categoryId: string;
  readonly variants: readonly MatrixVariantRecord[];
}

/** Une famille telle que la matrice la range : son nom et son rang. */
export interface MatrixFamilyRecord {
  readonly id: string;
  readonly name: LocalizedText;
  /** Le filtre « famille » retient aussi ses sous-familles. */
  readonly parentId: string | null;
  readonly position: number;
  /** Une famille archivée range encore ses fiches, mais ne se propose plus au filtre. */
  readonly isArchived: boolean;
}

/**
 * Port de **lecture** de la matrice des allergènes — ce qu'elle lit du
 * catalogue, et rien d'autre (ISP).
 *
 * Ni `ProductRepository` (un port d'écriture : la matrice ne ferait que
 * `listAll`, et dépendrait de `save()`), ni `CatalogueReader` (le point
 * d'entrée des canaux, cinq méthodes dont elle n'en appellerait qu'une).
 */
export abstract class AllergenMatrixSource {
  /**
   * Les fiches NON archivées, **déclinaisons résolues** : une déclinaison
   * alignée sur le défaut en sort avec la déclaration du défaut
   * (`Product.snapshot()`), jamais `null` — sans quoi elle se lirait « non
   * renseigné » (objection BLOQUANTE de vitruve, plan §6).
   */
  abstract products(): Promise<readonly MatrixProductRecord[]>;

  /** Toutes les familles, archivées comprises : une fiche peut encore y être rangée. */
  abstract families(): Promise<readonly MatrixFamilyRecord[]>;

  /**
   * Le plus récent des instants de mise à jour de ces fiches : la ligne de la
   * fiche, celles de ses déclinaisons (nom, alignement) et leurs déclarations
   * d'allergènes. `null` = aucune fiche.
   *
   * Ce sont les `updated_at` des lignes — la seule trace datée qui existe
   * (vérifié le 2026-10-20 : `ReadinessRepository.contentUpdatedAt` lit les
   * mêmes, et le journal n'a pas de lecture « dernier fait » sur un lot).
   * Une publication touche la ligne de la fiche, et c'est voulu ici : elle
   * change la matrice.
   */
  abstract lastModifiedAt(productIds: readonly string[]): Promise<Date | null>;
}
