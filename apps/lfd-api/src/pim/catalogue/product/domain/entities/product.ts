import {
  ArchivedProductNotPublishableError,
  InvalidProductVariantsError,
  ProductNotPublishableError,
  ProductVatWithoutChannelError,
  ProductUnknownContextError,
  VariantNotFoundError,
} from "../errors/product-errors.js";
import { Variant, type VariantSnapshot } from "./variant.js";
import {
  slugify,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";
import {
  normalizeSalesChannels,
  type SalesChannels,
} from "../../../shared/domain/value-objects/sales-channels.js";
import {
  contextIsSold,
  type ContextVat,
  type SalesContext,
} from "../../../shared/domain/value-objects/sales-context.js";
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
  /**
   * Les taux propres à CE produit, par clé de contexte — sa **dérogation** à sa
   * famille. Clé absente = il hérite, et c'est le cas courant.
   */
  readonly tvaByContext: ContextVat;
  /**
   * Où la fiche se vend quand elle ne suit pas sa famille. `null` = elle hérite.
   *
   * Tout-ou-rien, à la différence des taux : une matrice à moitié redéfinie ne
   * se lit pas. Les taux, eux, sont des faits indépendants — déroger en B2B et
   * suivre sa famille au comptoir est le cas courant.
   */
  readonly channelOverride: SalesChannels | null;
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
    private vatByContextValue: ContextVat,
    private channelOverrideValue: SalesChannels | null,
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
      // Un produit naît SANS dérogation : il suit sa famille jusqu'à ce que
      // quelqu'un décide le contraire, et cette décision se voit.
      {},
      null,
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
      snapshot.tvaByContext,
      snapshot.channelOverride,
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

  /** Les taux propres au produit — sa dérogation. Vide = il hérite. */
  get tvaByContext(): ContextVat {
    return this.vatByContextValue;
  }

  /** Sa matrice propre, ou `null` s'il suit sa famille. */
  get channelOverride(): SalesChannels | null {
    return this.channelOverrideValue;
  }

  /**
   * Où cette fiche se vend RÉELLEMENT : sa matrice si elle en a une, celle de
   * sa famille sinon.
   *
   * La règle de résolution vit ici plutôt que chez chaque appelant — c'est elle
   * qui décide où un taux peut se poser, et deux copies finiraient par ne plus
   * dire la même chose.
   */
  effectiveChannels(familyChannels: SalesChannels): SalesChannels {
    return this.channelOverrideValue ?? familyChannels;
  }

  /**
   * Redéfinit où la fiche se vend — ou la rend à sa famille avec `null`.
   *
   * Fermer un canal **efface** les taux que la fiche y avait posés, exactement
   * comme sur la famille : sans cet effacement, une fiche qui ne se vend plus en
   * B2B garderait son taux B2B, il compterait comme un usage, et la suppression
   * de ce taux resterait bloquée par une décision que plus rien n'applique.
   */
  setChannels(
    channels: SalesChannels | null,
    contexts: readonly SalesContext[],
    familyChannels: SalesChannels,
  ): void {
    this.channelOverrideValue = channels === null ? null : normalizeSalesChannels(channels);
    const effective = this.effectiveChannels(familyChannels);
    const kept: Record<string, string> = {};
    for (const context of contexts) {
      const rateId = this.vatByContextValue[context.key];
      if (rateId !== undefined && contextIsSold(context, effective)) {
        kept[context.key] = rateId;
      }
    }
    this.vatByContextValue = kept;
  }

  /**
   * Déroge au taux de la famille, ou **revient à l'héritage**.
   *
   * Une carte vide n'est pas une dérogation vide : c'est le retour au taux de
   * la famille, et c'est ce qui rend le geste réversible sans écrire un état
   * « pas de dérogation » qui ressemblerait à une décision.
   *
   * Deux refus, et l'agrégat ne peut en tenir qu'un seul seul : le contexte
   * doit exister (registre), et le contexte doit être VENDU par la famille —
   * d'où les canaux passés en argument. Un produit ne voit pas sa famille ;
   * un objet ne garantit que ce qu'il voit.
   */
  setVat(vat: ContextVat, contexts: readonly SalesContext[], familyChannels: SalesChannels): void {
    // Les canaux EFFECTIFS : une fiche qui a redéfini où elle se vend juge ses
    // taux là-dessus, pas sur ceux de sa famille. Sans quoi elle pourrait poser
    // un taux sur un canal qu'elle vient elle-même de fermer.
    const sellingChannels = this.effectiveChannels(familyChannels);
    const known = new Map(contexts.map((context) => [context.key, context]));
    for (const key of Object.keys(vat)) {
      const context = known.get(key);
      if (context === undefined) {
        throw new ProductUnknownContextError(key);
      }
      if (!contextIsSold(context, sellingChannels)) {
        throw new ProductVatWithoutChannelError(key);
      }
    }
    this.vatByContextValue = { ...vat };
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
      tvaByContext: this.vatByContextValue,
      channelOverride: this.channelOverrideValue,
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
