import { refuseEditOfArchived } from "../errors/archived-product-edit-errors.js";
import {
  Variant,
  type VariantAspect,
  type VariantPricing,
  type VariantNutritionValues,
  type VariantSnapshot,
} from "./variant.js";
import { type LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { SalesContext } from "../../../../reference/sales-contexts/domain/value-objects/sales-context.js";
import type { ContextVat } from "../../../shared/domain/value-objects/context-vat.js";
import type { AllergenDeclaration } from "../value-objects/nutrition-declaration.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { SaleUnitClearance } from "../value-objects/sale-reference-usage.js";
import { type MinQuantities } from "../value-objects/min-quantities.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { ActivationGaps } from "../services/activation-gaps.js";
import { ProductCompleteness } from "../services/product-completeness.js";
import type { ComplianceFinding } from "../services/product-compliance.js";
import {
  statusAfterActivation,
  statusAfterArchiving,
  statusAfterDeactivation,
  statusAfterDeletion,
  statusAfterRestoration,
} from "./product-lifecycle.js";
import { VariantLineup, type NewVariantInput } from "./variant-lineup.js";
import {
  productFieldsFrom,
  productSnapshot,
  type ProductFields,
} from "./product-snapshot-mapper.js";
import {
  slugOf,
  type DefaultVariantChange,
  type NewProductInput,
  type ProductKind,
  type ProductSnapshot,
  type ProductStatus,
  type StatusChanged,
} from "./product-state.js";
import { VatByContext } from "../value-objects/vat-by-context.js";
import { ProductCommerceOptions } from "../value-objects/product-commerce-options.js";
import type { CompletenessRules } from "../services/variant-completeness.js";

export {
  isLiveStatus,
  type DefaultVariantChange,
  type NewProductInput,
  type ProductKind,
  type ProductSnapshot,
  type ProductStatus,
  type StatusChanged,
} from "./product-state.js";

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
    private fields: ProductFields,
    private readonly lineup: VariantLineup,
  ) {}

  static open(input: NewProductInput): Product {
    return new Product(
      {
        id: input.id,
        sku: input.sku.value,
        name: input.name,
        slug: slugOf(input.name),
        kind: input.kind,
        categoryId: input.categoryId,
        // Un produit naît INVISIBLE : c'est ce qui rend l'invariant 7 tenable.
        status: "draft",
        vat: VatByContext.none(),
        options: ProductCommerceOptions.initial(),
        originVariantId: null,
      },
      VariantLineup.open(input.id, input.defaultVariant),
    );
  }

  static reconstitute(snapshot: ProductSnapshot): Product {
    return new Product(
      productFieldsFrom(snapshot),
      VariantLineup.reconstitute(snapshot.id, snapshot.variants),
    );
  }

  get id(): string {
    return this.fields.id;
  }

  get sku(): string {
    return this.fields.sku;
  }

  get status(): ProductStatus {
    return this.fields.status;
  }

  get categoryId(): string {
    return this.fields.categoryId;
  }

  /** Les taux propres au produit — sa dérogation. Vide = il hérite. */
  get vatByContext(): ContextVat {
    return this.fields.vat.toMap();
  }

  /**
   * Déroge au taux de la famille, ou **revient à l'héritage**.
   *
   * La règle (carte vide = héritage, contexte inconnu refusé) est celle de
   * {@link VatByContext}.
   */
  setVat(vat: ContextVat, contexts: readonly SalesContext[]): void {
    this.fields = { ...this.fields, vat: VatByContext.declare(vat, contexts) };
  }

  /** Vendu seulement pendant une opération ? */
  get operationOnly(): boolean {
    return this.fields.options.operationOnly;
  }

  /**
   * **Réserve la fiche aux opérations** — ou la rend à la vente courante.
   *
   * Aucune règle ne refuse le geste, et c'est voulu : une fiche archivée ou en
   * brouillon peut se préparer pour Noël. Ce que le drapeau change se juge chez
   * ceux qui VENDENT (D5), pas ici.
   *
   * @returns `false` quand la fiche y était déjà — rien à écrire au journal,
   * comme pour un statut ({@link StatusChanged}).
   */
  reserveForOperations(operationOnly: boolean): boolean {
    return this.changeOptions(this.fields.options.withOperationOnly(operationOnly));
  }

  /** Demande le froid ? */
  get requiresCold(): boolean {
    return this.fields.options.requiresCold;
  }

  /**
   * **Déclare que la fiche demande le froid** — ou le retire.
   *
   * Aucune règle ne refuse le geste : une fiche en brouillon ou archivée se
   * prépare comme les autres. Ce que le froid change se juge chez ceux qui
   * CHARGENT (la livraison), pas ici.
   *
   * @returns `false` quand la fiche le disait déjà — rien à écrire au journal
   * ({@link StatusChanged}).
   */
  declareColdRequirement(requiresCold: boolean): boolean {
    return this.changeOptions(this.fields.options.withRequiresCold(requiresCold));
  }

  /** Montre-t-il chaque déclinaison en vignette ? */
  get variantsAsTiles(): boolean {
    return this.fields.options.variantsAsTiles;
  }

  /**
   * **Montre chaque déclinaison en vignette** au rayon — ou seulement la
   * déclinaison par défaut (`plan-declinaisons-en-vignette.md`, V1).
   *
   * Une fiche à une seule déclinaison le porte sans effet, et le prend dès
   * qu'on lui en ajoute une. Un seul refus : décocher quand le défaut est sur
   * mesure (V5 de `plan-sur-mesure-par-declinaison.md`).
   *
   * @returns `false` quand la fiche le disait déjà ({@link StatusChanged}).
   * @throws {CustomRecipeDefaultWithoutTilesError} le défaut est sur mesure.
   */
  showVariantsAsTiles(variantsAsTiles: boolean): boolean {
    if (this.fields.options.variantsAsTiles === variantsAsTiles) {
      return false;
    }
    this.lineup.refuseCustomDefaultWithoutTiles(this.lineup.defaultVariant, variantsAsTiles);
    return this.changeOptions(this.fields.options.withVariantsAsTiles(variantsAsTiles));
  }

  /**
   * **Déclare une déclinaison sur mesure** — ou la rend ouverte
   * (`plan-sur-mesure-par-declinaison.md`, V1). Seule elle bascule : ses
   * sœurs gardent leur case. Ce que la case change se juge chez ceux qui
   * VENDENT — le commerce ne sert un article sur mesure qu'aux comptes
   * auxquels il l'a attribué (D3).
   *
   * Se règle quel que soit le statut, archivée comprise : le geste prépare, il
   * ne vend pas.
   *
   * @returns `false` quand elle le disait déjà ({@link StatusChanged}).
   * @throws {CustomRecipeDefaultWithoutTilesError} le défaut d'une fiche sans vignettes (V5).
   */
  declareVariantCustomRecipe(variantId: string, customRecipe: boolean): boolean {
    const target = this.lineup.get(variantId);
    if (customRecipe && target.isDefault) {
      this.lineup.refuseCustomDefaultWithoutTiles(
        target,
        this.fields.options.variantsAsTiles,
        true,
      );
    }
    return target.declareCustomRecipe(customRecipe);
  }

  /** Sa propre audience, ou `null` s'il suit sa famille. */
  get audience(): Audience | null {
    return this.fields.options.audience;
  }

  /**
   * Élargit ou restreint à qui la fiche vend — ou la rend à sa famille avec
   * `null`. Aucun refus : comme le froid, ce que l'audience change se juge à
   * l'activation et chez ceux qui vendent.
   *
   * @returns `false` quand elle le disait déjà ({@link StatusChanged}).
   */
  changeAudience(audience: Audience | null): boolean {
    return this.changeOptions(this.fields.options.withAudience(audience));
  }

  /** Pose les nouveaux réglages ; `false` quand ils étaient déjà ceux-là. */
  private changeOptions(next: ProductCommerceOptions): boolean {
    if (next === this.fields.options) {
      return false;
    }
    this.fields = { ...this.fields, options: next };
    return true;
  }

  /**
   * **La quantité minimale d'une déclinaison** — son minimum pro et son
   * minimum public, ou `"follow"` pour suivre le défaut
   * (`plan-quantite-minimale.md`, M1). Par audience seulement (Q2) : aucun
   * contexte de vente à vérifier.
   *
   * @returns `false` quand la déclinaison le disait déjà.
   */
  changeMinQuantities(variantId: string, next: MinQuantities | "follow"): boolean {
    return this.lineup.get(variantId).changeMinQuantities(next);
  }

  /** Renomme — et re-dérive le slug. */
  rename(name: LocalizedText): void {
    refuseEditOfArchived(this.fields.status, this.fields.id, "rename");
    this.fields = { ...this.fields, name, slug: slugOf(name) };
  }

  changeKind(kind: ProductKind): void {
    refuseEditOfArchived(this.fields.status, this.fields.id, "change_kind");
    this.fields = { ...this.fields, kind };
  }

  /** Range le produit dans une autre famille (`ReclassifyProduct`). */
  reclassify(categoryId: string): void {
    refuseEditOfArchived(this.fields.status, this.fields.id, "reclassify");
    this.fields = { ...this.fields, categoryId };
  }

  /**
   * **Invariant 7, tel que le lot 2b le tient** : on ne met pas en vente ce
   * qu'on ne peut pas étiqueter — le refus se fait **par construction**,
   * déclinaison par déclinaison. Activer exige **au moins une déclinaison non
   * arrêtée complète** (un prix public, un prix pro HT saisi, un taux pour
   * chaque contexte de vente en service). Les allergènes ne refusent plus rien
   * (la composition corrige la déclaration servie, l'absence se sert par
   * précaution : `effective-allergens.ts`), et les valeurs nutritionnelles
   * n'entrent PAS dans ce compte : le règlement (UE) n° 1169/2011 les exempte
   * dans les deux cas de vente de La Folie Coffee (art. 9 §1 c) et l)).
   *
   * Un produit archivé se restaure d'abord. Le jugement lui-même — les trois
   * lectures ci-dessous — est {@link ProductCompleteness}, jugé sur les
   * déclinaisons RÉSOLUES.
   */
  activationGapsWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): ActivationGaps {
    return this.completeness().gaps(vatPercents, rules, citedAllergens, categoryAudience);
  }

  /** Le jugement unique de la fiche : tous ses constats, quel que soit son statut. */
  complianceWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): ComplianceFinding[] {
    return this.completeness().findings(vatPercents, rules, citedAllergens, categoryAudience);
  }

  /** Une activation changerait-elle la fiche ? Vrai seulement pour un brouillon complet. */
  isActivatableWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): boolean {
    return this.completeness().isActivatable(vatPercents, rules, citedAllergens, categoryAudience);
  }

  private completeness(): ProductCompleteness {
    return ProductCompleteness.of({
      status: this.fields.status,
      variants: this.resolvedVariants(),
      audience: this.fields.options.audience,
    });
  }

  /**
   * Les déclinaisons **résolues** — une alignée porte la déclaration du défaut.
   * Le jugement et l'encart de composition la lisent tous deux, pour ne jamais
   * diverger.
   */
  resolvedVariants(): VariantSnapshot[] {
    return this.lineup.resolvedSnapshots();
  }

  /**
   * Met la fiche en vente — toutes ses déclinaisons partent avec elle, ce qui
   * fige leur unité de vente. Les règles de chaque transition sont dans
   * `product-lifecycle.ts`.
   */
  activate(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): StatusChanged {
    const changed = this.moveTo(
      statusAfterActivation(this.fields.id, this.fields.status, () =>
        this.complianceWith(vatPercents, rules, citedAllergens, categoryAudience),
      ),
    );
    if (changed) {
      this.lineup.markAllPublished();
    }
    return changed;
  }

  /** Retire de la vente en ligne, sans archiver : le produit redevient brouillon. */
  deactivate(): StatusChanged {
    return this.moveTo(statusAfterDeactivation(this.fields.id, this.fields.status));
  }

  /** Retire de la vente sans supprimer. Idempotent. */
  archive(): StatusChanged {
    return this.moveTo(statusAfterArchiving(this.fields.id, this.fields.status));
  }

  /** Remet une archivée en brouillon — jamais directement en ligne. */
  restore(): StatusChanged {
    return this.moveTo(statusAfterRestoration(this.fields.id, this.fields.status));
  }

  /** Supprime une fiche archivée — un soft delete (le SKU reste pris). */
  delete(): void {
    this.moveTo(statusAfterDeletion(this.fields.id, this.fields.status));
  }

  /** Pose le statut d'après ; `false` quand la fiche y était déjà. */
  private moveTo(status: ProductStatus): StatusChanged {
    if (status === this.fields.status) {
      return false;
    }
    this.fields = { ...this.fields, status };
    return true;
  }

  /**
   * Renomme une déclinaison **du produit**.
   *
   * Le passage par l'agrégat n'est pas de la cérémonie : c'est lui qui refuse
   * de renommer la déclinaison d'une AUTRE fiche, et une requête forgée sur le
   * seul identifiant de déclinaison n'a donc aucun effet ici. Ici, le nom de
   * BOUTIQUE — qui fige le libellé au premier écart.
   */
  renameVariantForShop(variantId: string, name: LocalizedText): void {
    this.lineup.get(variantId).renameForShop(name);
  }

  /** Le libellé interne LU d'une déclinaison — le sien, sinon son nom de boutique en français. */
  variantInternalLabel(variantId: string): string {
    return this.lineup.get(variantId).internalLabel;
  }

  /** Le libellé INTERNE d'une déclinaison — le nom de boutique ne bouge pas. */
  renameVariantInternalLabel(variantId: string, label: string): void {
    this.lineup.get(variantId).renameInternalLabel(label);
  }

  /** Tarif et poids d'une déclinaison **du produit**. */
  priceVariant(variantId: string, pricing: VariantPricing, clearance?: SaleUnitClearance): void {
    this.lineup.get(variantId).price(pricing, clearance);
    this.lineup.assertPricingUnitsAgree();
  }

  /**
   * **Les allergènes d'une déclinaison**, sans toucher à ses valeurs.
   *
   * La moitié qui engage la sécurité du mangeur.
   *
   * Refuse si la déclinaison n'est pas la sienne — c'est l'agrégat qui dit ce
   * qui lui appartient, pas une requête sur l'id seul.
   *
   * 🔴 Ce verbe ne PERSISTE rien : l'écriture reste au port dédié
   * (`plan-separer-allergenes-et-nutrition.md`, §6a). Il existe pour que
   * l'agrégat porte l'état qu'il est seul à savoir juger — `activate` juge la
   * déclinaison RÉSOLUE contre son défaut, et il le fait sur l'état d'APRÈS.
   */
  declareAllergens(variantId: string, declaration: AllergenDeclaration): void {
    this.lineup.get(variantId).declareAllergens(declaration);
  }

  /** **Les valeurs d'une déclinaison**, sans toucher à ses allergènes. */
  declareNutritionValues(variantId: string, values: VariantNutritionValues): void {
    this.lineup.get(variantId).declareNutritionValues(values);
  }

  /**
   * Refuse si la déclinaison n'est pas du produit. Utile aux verbes dont
   * l'écriture passe par un satellite (la fiche réglementaire) : c'est
   * l'agrégat qui dit ce qui lui appartient, pas une requête sur l'id seul.
   */
  requireVariant(variantId: string): void {
    this.lineup.get(variantId);
  }

  /**
   * **Archive une déclinaison** — `is_discontinued`, hors vente, en base pour
   * toujours : elle RESTE dans la fiche et son rang reste pris. Les refus (le
   * défaut, la dernière vivante, une déjà archivée) sont ceux de {@link VariantLineup}.
   */
  discontinueVariant(variantId: string): void {
    this.lineup.discontinue(variantId);
  }

  /**
   * **Fait d'une déclinaison un produit** : le nouveau produit naît de ce
   * qu'elle VOYAIT — sa vue résolue, plus la famille, le genre, la TVA, les
   * réglages de vente de la fiche — et l'origine l'archive dans le même geste.
   * Il naît **brouillon** : un produit neuf n'a jamais été relu sous sa
   * nouvelle référence. Le nom du produit est celui de la déclinaison.
   *
   * @throws {DefaultVariantNotDetachableError} le défaut porte la fiche.
   * @throws {VariantAlreadyDiscontinuedError} une archivée ne se détache pas.
   */
  detachVariant(
    variantId: string,
    input: { id: string; sku: Sku; defaultVariant: { id: string; sku: Sku } },
  ): Product {
    const resolved = this.lineup.detach(variantId, input.id);
    return new Product(
      {
        id: input.id,
        sku: input.sku.value,
        name: resolved.name,
        slug: slugOf(resolved.name),
        kind: this.fields.kind,
        categoryId: this.fields.categoryId,
        status: "draft",
        vat: this.fields.vat.copy(),
        options: this.fields.options.forDetachedProduct(),
        originVariantId: variantId,
      },
      VariantLineup.fromDetached(
        input.id,
        Variant.openDefaultFrom(resolved, { ...input.defaultVariant, name: resolved.name }),
      ),
    );
  }

  /**
   * **Désarchive une déclinaison** — elle reprend son rang et sa référence.
   * Refuse celle devenue un produit ; `detachedProductLabel` est le nom de ce
   * produit, pour que le refus le dise.
   */
  restoreVariant(variantId: string, detachedProductLabel?: string): void {
    this.lineup.restore(variantId, detachedProductLabel);
  }

  /**
   * **Fait d'une déclinaison la déclinaison par défaut.** Le cœur du geste, ce
   * qui SUIT le défaut, est décrit par {@link VariantLineup.makeDefault} ; la
   * fiche y ajoute ce qu'elle seule sait, si elle montre ses vignettes.
   *
   * @returns l'ancien défaut, et les moitiés de fiche que la nouvelle a reçues
   *   en propre — elles se persistent par leurs ports dédiés.
   */
  makeVariantDefault(variantId: string): DefaultVariantChange {
    return this.lineup.makeDefault(variantId, this.fields.options.variantsAsTiles);
  }

  /** Le produit qu'une déclinaison de la fiche est devenue, ou `null`. */
  detachedProductOf(variantId: string): string | null {
    return this.lineup.get(variantId).detachedToProductId;
  }

  /**
   * Ajoute une déclinaison — **jamais la première**, jamais celle par défaut.
   * Sa fiche réglementaire suit celle du défaut : née nue, elle rendrait le
   * produit impubliable, ou partirait au canal sans allergènes déclarés.
   *
   * @returns la déclinaison ouverte — l'appelant a besoin de son id et de son SKU.
   */
  addVariant(input: NewVariantInput): Variant {
    return this.lineup.add(input, this.fields.status === "published");
  }

  /** Le rang de la prochaine déclinaison — jamais leur nombre ({@link VariantLineup.nextPosition}). */
  get nextVariantPosition(): number {
    return this.lineup.nextPosition;
  }

  /** Aligne une déclinaison sur la fiche du défaut, ou l'en détache. */
  alignVariant(variantId: string, aspect: VariantAspect, aligned: boolean): void {
    this.lineup.align(variantId, aspect, aligned);
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
    return productSnapshot(this.fields, this.lineup.resolvedSnapshots());
  }

  /**
   * L'instantané **non résolu** — chaque déclinaison avec ce qu'elle PORTE.
   *
   * 🔴 C'est celui qu'on PERSISTE : {@link snapshot} résout l'héritage, et
   * écrire CE tableau-là dans les colonnes propres d'une alignée recopierait le
   * défaut chez elle, alors que {@link Variant.follows} promet que « s'aligner
   * puis se désaligner rend ce qu'on avait écrit ». Les lecteurs n'y perdent
   * rien : ils passent par l'agrégat et reçoivent la résolution à la lecture.
   */
  persistenceSnapshot(): ProductSnapshot {
    return productSnapshot(this.fields, this.lineup.ownSnapshots());
  }
}
