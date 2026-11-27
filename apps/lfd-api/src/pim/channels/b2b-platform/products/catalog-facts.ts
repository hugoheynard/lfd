import type { SyncMedia, SyncMinQuantities, SyncOptionGroup, SyncVariant } from "@lfd/catalog-sync";

import type { AllergenNaming } from "../../../reference/allergens/domain/services/allergen-naming.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import type { CompletenessRules } from "../../../catalogue/product/domain/services/variant-completeness.js";
import type { CatalogFamilyRecord } from "../domain/ports/catalog-facts.reader.js";
import type { CategoryVatPercents } from "../../../catalogue/shared/domain/value-objects/vat-percents.js";
import type { Audience } from "../../../catalogue/shared/domain/value-objects/audience.js";
import type { Showcase } from "./projection.js";
import type { CatalogTranslations } from "./translations.js";

export type { CatalogTranslations };

/**
 * L'état d'une fiche **dans les mots de l'écran** (C1) : la valeur d'enum du
 * référentiel (`draft`, `published`) ne se renomme pas en base, mais elle ne
 * traverse pas non plus — la plateforme n'a jamais su ce qu'était un brouillon.
 */
export type CatalogEntryStatus = "inactive" | "active" | "archived";

/** La famille telle qu'un fait la porte — celle d'une fiche, ou la sienne. */
export interface CatalogFamilyFactBody {
  readonly id: string;
  readonly name: string;
  /** Les traductions du nom — `null` sur un fait d'avant le lot des langues. */
  readonly nameTranslations: CatalogTranslations | null;
  readonly slug: string;
  readonly parentId: string | null;
  readonly position: number;
  /** Le taux du contexte `b2b`, `null` s'il n'est pas réglé — jamais inventé. */
  readonly vatRatePercent: number | null;
  readonly audience: Audience;
  readonly archived: boolean;
}

/** La fiche, sans ses déclinaisons — ce que la plateforme range par fiche. */
export interface CatalogProductHead {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly kind: ProductRecord["kind"];
  readonly note: string | null;
  /** Les traductions de la ligne de vitrine — `null` sur un fait d'avant le lot des langues. */
  readonly noteTranslations: CatalogTranslations | null;
  /** La description longue, affichée sur la fiche de la boutique — `null` sur un fait d'avant elle. */
  readonly description: string | null;
  /** Ses traductions — `null` sur un fait d'avant elle. */
  readonly descriptionTranslations: CatalogTranslations | null;
  readonly image: SyncMedia | null;
  readonly thumbnail: SyncMedia | null;
  readonly operationOnly: boolean;
  readonly requiresCold: boolean;
  /**
   * **Sur mesure de la fiche** (fil v17) — **relu, plus émis** : depuis la v18,
   * le fait est porté par chaque déclinaison (`CatalogVariantFact.customRecipe`,
   * `plan-sur-mesure-par-declinaison.md`, V3). Un fait v17 en vol le porte
   * encore, et le commerce s'y replie quand la déclinaison ne dit rien ; absent
   * des deux, il laisse sa colonne intacte — jamais lu `false`.
   */
  readonly customRecipe?: boolean | undefined;
  /**
   * **L'ancienne référence de vente** d'une fiche née d'un détachement — le SKU
   * de la déclinaison d'origine (`plan-pro-voit-les-declinaisons.md`, L7).
   * Porté par le fait seul : l'instantané du push reste en v16, il ne la
   * demande pas. `null` pour toute autre fiche.
   * Le commerce s'en sert pour lister les décisions tarifaires restées sur
   * l'ancienne référence ; il ne les déplace jamais tout seul.
   */
  readonly detachedFromSku: string | null;
}

/**
 * Une déclinaison telle qu'un fait la porte : celle du fil, plus les
 * traductions de son nom — le nom d'un article en boutique est celui de sa
 * déclinaison. `null` sur un fait d'avant le lot des langues.
 *
 * `minQuantities` est `null` sur un fait d'avant le fil v15 — relu, jamais
 * émis : l'émission porte toujours les minimums effectifs, `null` compris.
 */
export type CatalogVariantFact = Omit<SyncVariant, "minQuantities" | "customRecipe"> & {
  readonly nameTranslations: CatalogTranslations | null;
  /**
   * **Sur mesure** (fil v18) — toujours émis ; absent d'un fait d'avant la
   * v18, et alors le commerce retombe sur l'en-tête v17, sinon laisse sa
   * colonne intacte. Jamais lu `false` : un fait en vol rouvrirait au public
   * un article reporté.
   */
  readonly customRecipe?: boolean | undefined;
  readonly minQuantities: SyncMinQuantities | null;
  /**
   * **Le SKU de la déclinaison dont celle-ci est la copie**, quand un
   * détachement l'a fait naître (`plan-pro-voit-les-declinaisons.md`, « Trace
   * de la déclinaison d'origine »). Fait seul, comme `detachedFromSku` : le
   * push reste en v16. `null` pour toute autre déclinaison, pour une copie
   * née avant la trace, et sur un fait émis avant elle.
   */
  readonly detachedFromVariantSku: string | null;
};

/**
 * **L'instantané d'une fiche**, tel que `pim.catalog_product_changed` le porte
 * (2a1). Un instantané, pas un diff : il se rejoue seul.
 */
export interface CatalogProductFactBody {
  readonly status: CatalogEntryStatus;
  /** L'audience EFFECTIVE : la dérogation de la fiche, sinon sa famille. */
  readonly audience: Audience;
  /**
   * La fiche hérite-t-elle l'audience de sa famille (`product.audience` vide) ?
   * `null` sur un fait émis avant le lot 3 : on ne sait pas.
   */
  readonly audienceInherited: boolean | null;
  readonly product: CatalogProductHead;
  /**
   * Les déclinaisons **complètes** au sens de `variantGaps` — non arrêtées,
   * avec le prix d'au moins une audience visée et un taux par contexte en
   * service. Le prix d'une audience absente part `null` (`priceMillicents`,
   * `publicTtcCents`), jamais zéro : le commerce ne la sert qu'à l'audience
   * dont elle a le prix (2026-10-27, `saisir-un-prix.md`). Une
   * déclaration d'allergènes n'est plus exigée depuis le 2026-10-27 : sans
   * elle, la déclinaison part par précaution (`allergensPrecautionary`). Ce sont les seules qu'une fiche ACTIVE vend ; une
   * fiche inactive les porte aussi, et la plateforme ne les vend pas.
   */
  readonly variants: readonly CatalogVariantFact[];
  /** SKU de déclinaison → ce qui lui manque. Une déclinaison arrêtée n'y est pas : rien ne lui manque, elle ne se vend plus. */
  readonly gaps: Readonly<Record<string, readonly string[]>>;
  /** La famille de la fiche : la plateforme la crée si elle ne la connaît pas encore. */
  readonly family: CatalogFamilyFactBody;
}

/** Ce que la projection d'une fiche reçoit, tout résolu — elle reste pure. */
export interface ProductFactInput {
  readonly product: ProductRecord;
  readonly family: CatalogFamilyRecord;
  readonly familyPercents: CategoryVatPercents;
  /** Les taux effectifs de la fiche (dérogation par-dessus la famille). */
  readonly percents: CategoryVatPercents;
  /**
   * Les contextes en service et la règle du prix pro — ce que la règle de
   * complétude partagée avec l'activation (`variantGaps`) ne voit pas d'une
   * fiche. La politique n'est jamais `null` (lot S) : sans règles, la saisie
   * se vend.
   */
  readonly rules: CompletenessRules;
  /** Le référentiel des allergènes, projeté dans chaque langue (le français fait foi). */
  readonly naming: AllergenNaming;
  readonly showcase: Showcase | undefined;
  /**
   * Les allergènes que la composition de la fiche cite — ajoutés à ce que
   * chaque déclinaison déclare (règle A de `plan-allergenes-jamais-bloquants.md`).
   */
  readonly cited: readonly string[];
  /**
   * L'union des allergènes déclarés du catalogue publié — les traces d'une
   * déclinaison sans déclaration (règle B). Lue une fois par projection.
   */
  readonly catalogueUnion: readonly string[];
  /** Le SKU de la déclinaison d'origine, si la fiche est née d'un détachement. */
  readonly detachedFromSku: string | null;
  /**
   * Id de déclinaison d'origine → son SKU, pour la trace de chaque
   * déclinaison copiée ; un id absent n'est pas résolu, la trace part `null`.
   */
  readonly variantOrigins: ReadonlyMap<string, string>;
  /**
   * Id de déclinaison → ses groupes d'options actifs, en service et avec au
   * moins un choix en service (v19). Une déclinaison absente n'en a aucun.
   */
  readonly optionGroups: ReadonlyMap<string, readonly SyncOptionGroup[]>;
}
