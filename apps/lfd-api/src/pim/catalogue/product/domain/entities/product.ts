import {
  ArchivedProductNotPublishableError,
  InvalidProductVariantsError,
  ProductNotPublishableError,
  VariantNotFoundError,
} from "../errors/product-errors.js";
import { Variant, type VariantSnapshot } from "./variant.js";
import {
  slugify,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";
import type { Sku } from "../value-objects/sku.value-object.js";

export type ProductKind = "daily" | "made_to_order" | "resale";
export type ProductStatus = "draft" | "published" | "archived";

export interface ProductSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly status: ProductStatus;
  readonly variants: readonly VariantSnapshot[];
}

/**
 * Ouvrir un produit, c'est ouvrir **sa déclinaison par défaut avec lui**.
 * Les créer séparément ouvrirait une fenêtre où l'invariant 2 est faux.
 */
export interface NewProductInput {
  readonly id: string;
  readonly sku: Sku;
  readonly name: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly defaultVariant: { readonly id: string; readonly sku: Sku; readonly name: LocalizedText };
}

/**
 * **Le produit — l'agrégat, déclinaisons comprises.**
 *
 * Ce qu'il garantit :
 *
 * - **invariant 2** — au moins une déclinaison, et **exactement une** par
 *   défaut. Vérifié à l'ouverture ET à la reconstitution : une ligne
 *   incohérente se signale au chargement plutôt que de ressortir vers les
 *   canaux ;
 * - le **slug suit le nom**, comme pour la famille ;
 * - une déclinaison ne se tarife que si elle **appartient** au produit — sinon
 *   une requête forgée tariferait la variante d'un autre ;
 * - prix et poids sont des **entiers positifs ou nuls**. La route HTTP
 *   l'exigeait déjà (`z.number().int().min(0)`), le domaine non : un seed ou
 *   un import passait à côté.
 *
 * Ce qu'il ne voit pas, et qui reste aux handlers : que la famille visée
 * existe et n'est pas archivée, et que le SKU est libre dans l'espace global
 * (le registre est une autre table).
 */
export class Product {
  private constructor(
    private readonly identity: string,
    private readonly skuValue: string,
    private nameValue: LocalizedText,
    private slugValue: LocalizedText,
    private kindValue: ProductKind,
    private categoryIdValue: string,
    private statusValue: ProductStatus,
    private readonly variantList: readonly Variant[],
  ) {}

  static open(input: NewProductInput): Product {
    return new Product(
      input.id,
      input.sku.value,
      input.name,
      slugOf(input.name),
      input.kind,
      input.categoryId,
      // Un produit naît INVISIBLE : c'est ce qui rend l'invariant 7 tenable.
      "draft",
      [Variant.openDefault(input.defaultVariant)],
    );
  }

  static reconstitute(snapshot: ProductSnapshot): Product {
    assertVariants(snapshot);
    return new Product(
      snapshot.id,
      snapshot.sku,
      snapshot.name,
      snapshot.slug,
      snapshot.kind,
      snapshot.categoryId,
      snapshot.status,
      snapshot.variants.map((variant) => Variant.reconstitute(variant)),
    );
  }

  get id(): string {
    return this.identity;
  }

  get sku(): string {
    return this.skuValue;
  }

  get status(): ProductStatus {
    return this.statusValue;
  }

  get categoryId(): string {
    return this.categoryIdValue;
  }

  /** Renomme — et re-dérive le slug. */
  rename(name: LocalizedText): void {
    this.nameValue = name;
    this.slugValue = slugOf(name);
  }

  changeKind(kind: ProductKind): void {
    this.kindValue = kind;
  }

  /** Range le produit dans une autre famille (`ReclassifyProduct`). */
  reclassify(categoryId: string): void {
    this.categoryIdValue = categoryId;
  }

  /**
   * **Invariant 7** : on ne met pas en vente ce qu'on ne peut pas étiqueter.
   *
   * Toute déclinaison **active** doit porter une fiche réglementaire. `[]`
   * compte comme déclarée — « aucun allergène » est une affirmation, pas une
   * absence de réponse. Les déclinaisons arrêtées ne comptent pas : elles ne
   * partiront chez aucun canal.
   *
   * Un produit archivé se restaure d'abord : passer d'« retiré de la vente » à
   * « en ligne » d'un seul geste ferait sauter l'étape où quelqu'un regarde.
   */
  publish(): void {
    if (this.statusValue === "archived") {
      throw new ArchivedProductNotPublishableError(this.identity);
    }
    const missing = this.variantList
      .filter((variant) => !variant.isDiscontinued && !variant.hasRegulatorySheet)
      .map((variant) => variant.sku);
    if (missing.length > 0) {
      throw new ProductNotPublishableError(this.identity, missing);
    }
    this.statusValue = "published";
  }

  /** Retire de la vente en ligne, sans archiver : le produit redevient brouillon. */
  unpublish(): void {
    if (this.statusValue === "published") {
      this.statusValue = "draft";
    }
  }

  /** Retire de la vente sans supprimer. Idempotent. */
  archive(): void {
    this.statusValue = "archived";
  }

  /** Remet en brouillon — jamais directement en ligne. */
  restore(): void {
    this.statusValue = "draft";
  }

  /** Tarif et poids d'une déclinaison **du produit**. */
  priceVariant(variantId: string, priceCents: number | null, weightGrams: number | null): void {
    this.variant(variantId).price(priceCents, weightGrams);
  }

  /**
   * Refuse si la déclinaison n'est pas du produit. Utile aux verbes dont
   * l'écriture passe par un satellite (la fiche réglementaire) : c'est
   * l'agrégat qui dit ce qui lui appartient, pas une requête sur l'id seul.
   */
  requireVariant(variantId: string): void {
    this.variant(variantId);
  }

  private variant(variantId: string): Variant {
    const found = this.variantList.find((candidate) => candidate.id === variantId);
    if (found === undefined) {
      throw new VariantNotFoundError(this.identity, variantId);
    }
    return found;
  }

  snapshot(): ProductSnapshot {
    return {
      id: this.identity,
      sku: this.skuValue,
      name: this.nameValue,
      slug: this.slugValue,
      kind: this.kindValue,
      categoryId: this.categoryIdValue,
      status: this.statusValue,
      variants: this.variantList.map((variant) => variant.snapshot()),
    };
  }
}

/** Invariant 2 du socle — la seule règle qui rende l'agrégat cohérent. */
function assertVariants(snapshot: ProductSnapshot): void {
  if (snapshot.variants.length === 0) {
    throw new InvalidProductVariantsError(snapshot.id, "aucune déclinaison");
  }
  const defaults = snapshot.variants.filter((variant) => variant.isDefault).length;
  if (defaults !== 1) {
    throw new InvalidProductVariantsError(
      snapshot.id,
      `${String(defaults)} déclinaison(s) par défaut au lieu d’une`,
    );
  }
}

/** Le slug d'un produit — dérivé du nom, jamais saisi. */
function slugOf(name: LocalizedText): LocalizedText {
  return name.en === undefined
    ? { fr: slugify(name.fr) }
    : { fr: slugify(name.fr), en: slugify(name.en) };
}
