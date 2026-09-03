import type { LocalizedText } from "@lfd/pim-contracts";

/**
 * La forme du **catalogue de départ** — ce que `catalogue.ts` porte et ce que
 * `seed-pim.ts` rejoue.
 *
 * ## Aucun identifiant ne traverse
 *
 * Tout se désigne par **clé portable** : le nom d'une famille, la clé d'un
 * contexte, le libellé d'un point de vente, le nom d'un taux, le SKU d'une
 * fiche. Jamais par `id` — le rejeu passe par les commandes, qui assignent
 * leurs propres ULID, et un identifiant recopié serait un identifiant que le
 * domaine n'a pas frappé.
 *
 * Le SKU fait exception, et c'est délibéré : `CreateProductCommand` accepte une
 * référence existante précisément pour la reprise d'un catalogue. C'est lui qui
 * rend le rejeu **idempotent** — on retrouve une fiche par son SKU.
 */
export interface CatalogueCorpus {
  /**
   * Le rapport prix pro / prix public, en points de base (9000 = le pro paie
   * 90 % du public). Sans lui, la projection du miroir B2B lève
   * `ProPriceRatioNotSetError` et **rien** ne part : un catalogue publié, vendu
   * aux pros et tarifé reste invisible côté commerce. C'est le dernier réglage
   * qui manquait pour que « catalogue valide » veuille dire quelque chose.
   */
  readonly proPriceRatioBp: number;
  readonly salesContexts: readonly CorpusSalesContext[];
  readonly pointsOfSale: readonly CorpusPointOfSale[];
  readonly vatRates: readonly CorpusVatRate[];
  readonly categories: readonly CorpusCategory[];
  readonly products: readonly CorpusProduct[];
}

export interface CorpusSalesContext {
  readonly key: string;
  readonly label: string;
  readonly handleSuffix: string;
  readonly active: boolean;
  readonly shopifyProjected: boolean;
}

export interface CorpusPointOfSale {
  readonly label: string;
  readonly kind: "shop" | "platform";
  readonly baseUrl: string;
  readonly contexts: readonly string[];
  readonly tableCount: number;
}

export interface CorpusVatRate {
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

export interface CorpusCategory {
  readonly name: LocalizedText;
  /** Le nom source de la famille parente, ou `null` à la racine. */
  readonly parentName: string | null;
  /** Matrice de la famille — l'héritage dont les fiches partent. */
  readonly channels: readonly CorpusChannel[];
  /** Taux par clé de contexte, désigné par le **nom** du taux. */
  readonly vat: Readonly<Record<string, string>>;
}

/** Une case de la matrice, désignée par le libellé du point de vente. */
export interface CorpusChannel {
  readonly pointOfSaleLabel: string;
  readonly context: string;
}

export interface CorpusProduct {
  readonly sku: string;
  readonly name: LocalizedText;
  readonly kind: "daily" | "made_to_order" | "resale";
  /** Nom source de la famille — les `id` ne traversent pas. */
  readonly categoryName: string;
  readonly status: "draft" | "published" | "archived";
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  readonly descriptionShort?: LocalizedText | undefined;
  readonly descriptionLong?: LocalizedText | undefined;
  /**
   * La fiche réglementaire **telle que la source la porte**. `null` = la source
   * n'en porte pas, et le rejeu ne l'inventera que si on le lui demande
   * explicitement (cf. `declarations.ts`).
   */
  readonly declaration: CorpusDeclaration | null;
  /** `null` = la fiche suit sa famille ; sinon, sa dérogation. */
  readonly channels: readonly CorpusChannel[] | null;
  readonly vat: Readonly<Record<string, string>>;
}

export interface CorpusDeclaration {
  readonly allergens: readonly string[];
  readonly mayContain: readonly string[];
  readonly nutrition: CorpusNutrition;
}

/** Pour 100 g ; `null` = non renseigné, et ce n'est pas zéro. */
export interface CorpusNutrition {
  readonly energyKcal: number | null;
  readonly fatG: number | null;
  readonly saturatedFatG: number | null;
  readonly carbsG: number | null;
  readonly sugarsG: number | null;
  readonly proteinG: number | null;
  readonly saltG: number | null;
  readonly glycemicIndex: number | null;
}
