import {
  ArchivedProductNotPublishableError,
  ArchivedProductNotWithdrawableError,
  InvalidProductVariantsError,
  NotArchivedProductNotRestorableError,
  ProductNotPublishableError,
  ProductVatWithoutChannelError,
  ProductUnknownContextError,
  VariantNotFoundError,
  VariantNotInProductError,
} from "../errors/product-errors.js";
import { Variant, type VariantPricing, type VariantSnapshot } from "./variant.js";
import {
  slugify,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";
import {
  normalizeSalesChannels,
  type SalesChannels,
} from "../../../shared/domain/value-objects/sales-channels.js";
import type { SalesContext } from "../../../../sales-contexts/domain/value-objects/sales-context.js";
import {
  contextIsSold,
  type ContextVat,
} from "../../../shared/domain/value-objects/context-vat.js";
import type { Sku } from "../value-objects/sku.value-object.js";

export type ProductKind = "daily" | "made_to_order" | "resale";
export type ProductStatus = "draft" | "published" | "archived";

/**
 * Ce qu'un verbe de cycle de vie a **réellement** fait.
 *
 * `false` = le produit y était déjà. Il n'y a alors rien à écrire, et surtout
 * **rien à journaliser** : le journal est la trace d'audit, et un fait
 * `product.unpublished` sur une fiche qui n'était pas en vente est un fait qui
 * n'a pas eu lieu. Trois des quatre verbes journalisaient inconditionnellement
 * (audit 2026-09-01).
 *
 * À distinguer d'une transition **impossible**, qui lève : « il y était déjà »
 * est un non-événement, « ça n'a pas de sens » est une erreur d'appelant.
 */
export type StatusChanged = boolean;

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
  readonly vatByContext: ContextVat;
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
    private readonly variantList: Variant[],
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
      snapshot.vatByContext,
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
  get vatByContext(): ContextVat {
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
  publish(): StatusChanged {
    if (this.statusValue === "archived") {
      throw new ArchivedProductNotPublishableError(this.identity);
    }
    if (this.statusValue === "published") {
      return false;
    }
    const missing = this.variantList
      .filter((variant) => !variant.isDiscontinued && !this.isCovered(variant))
      .map((variant) => variant.sku);
    if (missing.length > 0) {
      throw new ProductNotPublishableError(this.identity, missing);
    }
    this.statusValue = "published";
    return true;
  }

  /**
   * Retire de la vente en ligne, sans archiver : le produit redevient brouillon.
   *
   * Refuse sur un produit **archivé** : il n'est pas en vente, il est sorti du
   * catalogue, et « le retirer de la vente » ne veut rien dire. Le refus n'est
   * pas de la rigueur gratuite — c'est ici que le front envoyait sa demande de
   * RESTAURATION (audit 2026-09-01, §1). Le verbe ne faisait rien, le handler
   * journalisait quand même, et l'écran peignait « Brouillon » sur une fiche
   * restée archivée. Un no-op silencieux avait donc l'exacte apparence d'un
   * succès.
   */
  unpublish(): StatusChanged {
    if (this.statusValue === "archived") {
      throw new ArchivedProductNotWithdrawableError(this.identity);
    }
    if (this.statusValue !== "published") {
      return false;
    }
    this.statusValue = "draft";
    return true;
  }

  /**
   * Retire de la vente sans supprimer. Idempotent — l'archivage en lot passe par
   * là, et une sélection contient couramment ce qui l'est déjà.
   */
  archive(): StatusChanged {
    if (this.statusValue === "archived") {
      return false;
    }
    this.statusValue = "archived";
    return true;
  }

  /**
   * Remet un produit archivé en brouillon — jamais directement en ligne.
   *
   * Refuse sur un produit qui n'est pas archivé. Sans ce refus, restaurer un
   * produit **en ligne** le rétrogradait silencieusement en brouillon : le
   * verbe posait `draft` sans regarder d'où il venait, et le produit sortait de
   * la vente sur un geste qui prétendait l'y ramener.
   */
  restore(): StatusChanged {
    if (this.statusValue !== "archived") {
      throw new NotArchivedProductNotRestorableError(this.identity, this.statusValue);
    }
    this.statusValue = "draft";
    return true;
  }

  /** Tarif et poids d'une déclinaison **du produit**. */
  priceVariant(variantId: string, pricing: VariantPricing): void {
    this.variant(variantId).price(pricing);
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

  /**
   * **La déclinaison par défaut** — l'invariant 2 garantit qu'il y en a une.
   *
   * Le `?? this.variantList[0]` n'est pas une prudence de plus : `at()` rend
   * `T | undefined` quel que soit l'invariant, et le compilateur ne lit pas les
   * garanties écrites en prose.
   */
  private get defaultVariant(): Variant {
    return this.variantList.find((variant) => variant.isDefault) ?? this.variantList[0]!;
  }

  /**
   * Cette déclinaison est-elle **étiquetable** — par sa propre fiche, ou par
   * celle du défaut qu'elle suit ?
   *
   * La question ne peut pas vivre sur la déclinaison : elle seule ne voit pas le
   * défaut, et un objet ne garantit que ce qu'il voit. C'est le même partage que
   * pour les taux, où la fiche ne juge sa dérogation qu'une fois qu'on lui
   * montre les canaux de sa famille.
   */
  private isCovered(variant: Variant): boolean {
    return variant.regulatoryFollowsDefault
      ? this.defaultVariant.hasOwnRegulatorySheet
      : variant.hasOwnRegulatorySheet;
  }

  /**
   * Ajoute une déclinaison — **jamais la première**, jamais celle par défaut.
   *
   * Elle prend le rang suivant, et sa fiche réglementaire suit celle du défaut :
   * une déclinaison née nue rendrait le produit impubliable, et sur un produit
   * déjà en vente elle partirait au canal sans allergènes déclarés.
   *
   * @returns la déclinaison ouverte — l'appelant a besoin de son id et de son SKU.
   */
  addVariant(input: {
    id: string;
    sku: Sku;
    name: LocalizedText;
    options: Readonly<Record<string, string>>;
  }): Variant {
    const variant = Variant.open({ ...input, position: this.nextVariantPosition });
    this.variantList.push(variant);
    return variant;
  }

  /**
   * Le rang de la prochaine déclinaison — jamais leur nombre.
   *
   * Public parce que la RÉFÉRENCE en dérive (`P-XXXXXX-3`) et qu'elle se
   * fabrique avant l'ajout, contre le registre. Le compter au dehors — un
   * `count` en base, la longueur d'une liste — rouvrirait la porte à deux `-2`
   * sous la même fiche le jour où une déclinaison est retirée du milieu : seul
   * le registre les refuserait, et trop tard pour le dire bien.
   */
  get nextVariantPosition(): number {
    return (
      this.variantList.reduce((highest, variant) => Math.max(highest, variant.position), -1) + 1
    );
  }

  /**
   * Aligne une déclinaison sur la fiche du défaut, ou l'en détache.
   *
   * L'appartenance est tenue ici — une requête forgée ne peut pas aligner la
   * déclinaison d'un autre produit, exactement comme pour le tarif.
   */
  alignVariantRegulatory(variantId: string, aligned: boolean): void {
    const variant = this.variantList.find((candidate) => candidate.id === variantId);
    if (variant === undefined) {
      throw new VariantNotInProductError(this.identity, variantId);
    }
    variant.alignRegulatoryOnDefault(aligned);
  }

  /** La fiche du défaut, recopiée dans l'instantané d'une déclinaison alignée. */
  private resolvedSnapshot(variant: Variant): VariantSnapshot {
    const own = variant.snapshot();
    if (!variant.regulatoryFollowsDefault) {
      return own;
    }
    const source = this.defaultVariant.snapshot();
    return { ...own, allergens: source.allergens, nutrition: source.nutrition };
  }

  /**
   * L'instantané, **fiches réglementaires résolues**.
   *
   * Une déclinaison alignée sort d'ici avec les allergènes du défaut, pas avec
   * `null`. C'est le seul endroit où le faire : tout ce qui consomme le
   * référentiel — la projection des canaux, l'empreinte de révision, le rapport
   * de parité — lit cet instantané, et résoudre l'héritage chez chacun d'eux
   * finirait par donner trois réponses.
   */
  snapshot(): ProductSnapshot {
    return {
      id: this.identity,
      sku: this.skuValue,
      name: this.nameValue,
      slug: this.slugValue,
      kind: this.kindValue,
      categoryId: this.categoryIdValue,
      status: this.statusValue,
      variants: this.variantList.map((variant) => this.resolvedSnapshot(variant)),
      vatByContext: this.vatByContextValue,
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
