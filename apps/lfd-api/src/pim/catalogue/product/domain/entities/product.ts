import {
  ArchivedProductNotPublishableError,
  ArchivedProductNotWithdrawableError,
  DeletedProductNotChangeableError,
  InvalidProductVariantsError,
  NotArchivedProductNotDeletableError,
  NotArchivedProductNotRestorableError,
  VariantNotFoundError,
  VariantNotInProductError,
} from "../errors/product-errors.js";
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
import { effectiveAudience, type Audience } from "../../../shared/domain/value-objects/audience.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import { activationGapsOf, type ActivationGaps } from "../services/activation-gaps.js";
import {
  isCompliantForActivation,
  productCompliance,
  type ComplianceFinding,
} from "../services/product-compliance.js";
import { refusalOf } from "./activation-refusal.js";
import {
  DefaultVariantNotDetachableError,
  DefaultVariantNotDiscontinuableError,
  LastLiveVariantNotDiscontinuableError,
  DiscontinuedVariantNotDefaultableError,
  VariantAlreadyDefaultError,
  VariantAlreadyDiscontinuedError,
} from "../errors/variant-lifecycle-errors.js";
import { PricingAlignmentAcrossUnitsError } from "../errors/sale-unit-errors.js";
import { CustomRecipeDefaultWithoutTilesError } from "../errors/custom-recipe-errors.js";
import { resolveVariant } from "./variant-resolution.js";
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
    private readonly variantList: Variant[],
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
      [Variant.openDefault(input.defaultVariant)],
    );
  }

  static reconstitute(snapshot: ProductSnapshot): Product {
    assertVariants(snapshot);
    return new Product(
      productFieldsFrom(snapshot),
      snapshot.variants.map((variant) => Variant.reconstitute(variant)),
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
    this.refuseCustomDefaultWithoutTiles(this.defaultVariant, variantsAsTiles);
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
    const target = this.variant(variantId);
    if (customRecipe && target.isDefault) {
      this.refuseCustomDefaultWithoutTiles(target, this.fields.options.variantsAsTiles, true);
    }
    return target.declareCustomRecipe(customRecipe);
  }

  /**
   * **V5 (a)** — une fiche sans vignettes ne paraît au rayon que par son
   * défaut : sur mesure, elle disparaîtrait pour tous les pros sans
   * réservation. L'état que les trois gestes laisseraient est jugé ici, avant
   * toute mutation.
   */
  private refuseCustomDefaultWithoutTiles(
    defaultVariant: Variant,
    variantsAsTiles: boolean,
    customRecipe = defaultVariant.customRecipe,
  ): void {
    if (customRecipe && !variantsAsTiles) {
      throw new CustomRecipeDefaultWithoutTilesError(defaultVariant.sku);
    }
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
    return this.variant(variantId).changeMinQuantities(next);
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
   * qu'on ne peut pas étiqueter — mais le refus se fait désormais **par
   * construction**, déclinaison par déclinaison, et non sur la fiche entière.
   *
   * Activer exige **au moins une déclinaison non arrêtée complète** (C1 et 2b3
   * de `plan-catalogue-synchronise-par-audience.md`) : un prix public, un prix
   * pro HT saisi (seule source depuis le lot R3), et un taux pour chaque
   * contexte de vente en service. Les allergènes ne refusent plus rien depuis
   * le 2026-10-27 (`plan-allergenes-jamais-bloquants.md`) : la composition
   * corrige la déclaration servie, l'absence de déclaration se sert par
   * précaution (`effective-allergens.ts`). Les autres
   * déclinaisons n'empêchent rien : la projection des faits ET l'envoi actuel
   * (`variant_sans_allergenes`) les écartent de la vente — c'est ce qui rend
   * l'assouplissement sûr, et c'est pourquoi il n'a pas été fait avant.
   *
   * 🔴 **Les valeurs nutritionnelles n'entrent PAS dans ce compte**, et ce n'est
   * pas un desserrage : le règlement (UE) n° 1169/2011 rend les allergènes
   * obligatoires (art. 9 §1 point c) et exempte la déclaration nutritionnelle
   * (point l) dans les deux cas de vente de La Folie Coffee
   * (`plan-separer-allergenes-et-nutrition.md`, D2, vérifié le 2026-09-22).
   *
   * Un produit archivé se restaure d'abord : passer d'« retiré de la vente » à
   * « en ligne » d'un seul geste ferait sauter l'étape où quelqu'un regarde.
   *
   * Le jugement porte sur les déclinaisons RÉSOLUES : une alignée porte le prix
   * et la déclaration du défaut qu'elle suit. Taux et contextes arrivent
   * résolus : ils dépendent de registres que la fiche ne voit pas.
   */
  /**
   * **Ce qui manque pour activer**, sans rien muter — le même jugement que
   * `activate` refuse (elle l'appelle), pour que la liste dise « activable »
   * avec exactement le code qui accepte ou refuse le geste.
   *
   * Jugé sur les déclinaisons RÉSOLUES, quel que soit le statut : le statut
   * est l'affaire de {@link Product.isActivatableWith}.
   */
  activationGapsWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): ActivationGaps {
    return activationGapsOf(
      this.complianceWith(vatPercents, rules, citedAllergens, categoryAudience),
    );
  }

  /**
   * **Le jugement unique** de la fiche ({@link productCompliance}) — tous ses
   * constats, bloquants et avertissements, quel que soit son statut.
   * `citedAllergens` : ce que portent les ingrédients qu'elle cite, résolu par
   * le handler ; `categoryAudience` : celle de sa famille, dont elle hérite si
   * elle n'en pose pas — un prix n'est exigé que pour l'audience visée.
   */
  complianceWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): ComplianceFinding[] {
    return productCompliance(
      this.resolvedVariants(),
      vatPercents,
      rules,
      citedAllergens,
      effectiveAudience(this.fields.options.audience, categoryAudience),
    );
  }

  /**
   * Les déclinaisons **résolues** — une alignée porte la déclaration du défaut.
   * La seule résolution du référentiel : le jugement et l'encart de
   * composition la lisent tous deux, pour ne jamais diverger.
   */
  resolvedVariants(): VariantSnapshot[] {
    return this.variantList.map((variant) => this.resolvedSnapshot(variant));
  }

  /**
   * Une activation **changerait-elle** la fiche ? Vrai seulement pour un
   * brouillon complet. Une fiche publiée rend `false` (l'activer ne fait rien,
   * elle n'est pas « à activer »), une archivée aussi (`activate` la refuse :
   * elle se restaure d'abord). Choix du 2026-10-26 : le filtre « Activables »
   * de la liste ne montre que ce que « Activer » ferait passer en vente.
   */
  isActivatableWith(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): boolean {
    return (
      this.fields.status === "draft" &&
      isCompliantForActivation(
        this.complianceWith(vatPercents, rules, citedAllergens, categoryAudience),
      )
    );
  }

  activate(
    vatPercents: CategoryVatPercents,
    rules: CompletenessRules,
    citedAllergens: readonly string[],
    categoryAudience: Audience,
  ): StatusChanged {
    this.refuseIfDeleted();
    if (this.fields.status === "archived") {
      throw new ArchivedProductNotPublishableError(this.fields.id);
    }
    if (this.fields.status === "published") {
      return false;
    }
    const findings = this.complianceWith(vatPercents, rules, citedAllergens, categoryAudience);
    if (!isCompliantForActivation(findings)) {
      throw refusalOf(this.fields.id, findings);
    }
    this.fields = { ...this.fields, status: "published" };
    // Toutes partent avec la fiche : c'est ce qui fige leur unité de vente.
    for (const variant of this.variantList) {
      variant.markPublished();
    }
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
  deactivate(): StatusChanged {
    if (this.fields.status === "archived") {
      throw new ArchivedProductNotWithdrawableError(this.fields.id);
    }
    if (this.fields.status !== "published") {
      return false;
    }
    this.fields = { ...this.fields, status: "draft" };
    return true;
  }

  /**
   * Retire de la vente sans supprimer. Idempotent — l'archivage en lot passe par
   * là, et une sélection contient couramment ce qui l'est déjà.
   *
   * Refuse une **supprimée** : elle ne redevient rien par l'écran, pas même
   * archivée. La remettre en archives est un geste d'entretien.
   */
  archive(): StatusChanged {
    this.refuseIfDeleted();
    if (this.fields.status === "archived") {
      return false;
    }
    this.fields = { ...this.fields, status: "archived" };
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
    if (this.fields.status !== "archived") {
      throw new NotArchivedProductNotRestorableError(this.fields.id, this.fields.status);
    }
    this.fields = { ...this.fields, status: "draft" };
    return true;
  }

  /**
   * **Supprime** une fiche archivée — un soft delete : elle sort de tout le
   * référentiel, la ligne reste, le SKU reste pris.
   *
   * Seule une archivée se supprime : une fiche en vente ou en brouillon
   * s'archive d'abord, ce qui la retire du miroir du commerce. Le refus vaut
   * aussi pour une fiche déjà supprimée — il n'y a pas de « déjà supprimée »
   * à taire, puisque l'écran ne la montre plus : la demande vient d'ailleurs.
   *
   * @throws {NotArchivedProductNotDeletableError} la fiche n'est pas archivée.
   */
  delete(): void {
    if (this.fields.status !== "archived") {
      throw new NotArchivedProductNotDeletableError(this.fields.id, this.fields.status);
    }
    this.fields = { ...this.fields, status: "deleted" };
  }

  /** Une supprimée ne redevient rien depuis l'écran (plan v4, point 2). */
  private refuseIfDeleted(): void {
    if (this.fields.status === "deleted") {
      throw new DeletedProductNotChangeableError(this.fields.id);
    }
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
    this.variant(variantId).renameForShop(name);
  }

  /** Le libellé interne LU d'une déclinaison — le sien, sinon son nom de boutique en français. */
  variantInternalLabel(variantId: string): string {
    return this.variant(variantId).internalLabel;
  }

  /** Le libellé INTERNE d'une déclinaison — le nom de boutique ne bouge pas. */
  renameVariantInternalLabel(variantId: string, label: string): void {
    this.variant(variantId).renameInternalLabel(label);
  }

  /** Tarif et poids d'une déclinaison **du produit**. */
  priceVariant(variantId: string, pricing: VariantPricing, clearance?: SaleUnitClearance): void {
    this.variant(variantId).price(pricing, clearance);
    this.assertPricingUnitsAgree();
  }

  /**
   * Une déclinaison qui suit le tarif du défaut se vend dans la même unité
   * que lui : sinon le prix au kilo du défaut deviendrait le prix d'une de ses
   * pièces. Tenu après chaque geste qui touche l'unité ou l'alignement.
   */
  private assertPricingUnitsAgree(): void {
    const unit = this.defaultVariant.saleUnit;
    const stray = this.variantList.find(
      (variant) => variant.pricingFollowsDefault && variant.saleUnit !== unit,
    );
    if (stray !== undefined) {
      throw new PricingAlignmentAcrossUnitsError(stray.sku);
    }
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
    this.variant(variantId).declareAllergens(declaration);
  }

  /** **Les valeurs d'une déclinaison**, sans toucher à ses allergènes. */
  declareNutritionValues(variantId: string, values: VariantNutritionValues): void {
    this.variant(variantId).declareNutritionValues(values);
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
      throw new VariantNotFoundError(this.fields.id, variantId);
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
   * **Archive une déclinaison** — `is_discontinued`, hors vente, en base pour
   * toujours (`plan-gestes-de-declinaison.md`, D1).
   *
   * Elle RESTE dans l'agrégat : son rang reste pris ({@link nextVariantPosition}),
   * si bien que la suivante prend `-3` après un `-2` archivé, et jamais `-2-2`.
   * Ce sont les lectures (fiche, faits du catalogue) qui l'écartent.
   *
   * @throws {DefaultVariantNotDiscontinuableError} le défaut, tant qu'il en reste d'autres.
   * @throws {LastLiveVariantNotDiscontinuableError} la dernière vivante : c'est la fiche qu'on archive.
   * @throws {VariantAlreadyDiscontinuedError} déjà archivée.
   */
  discontinueVariant(variantId: string): void {
    const target = this.variant(variantId);
    if (target.isDiscontinued) {
      throw new VariantAlreadyDiscontinuedError(target.sku);
    }
    const othersAlive = this.variantList.some(
      (variant) => variant.id !== variantId && !variant.isDiscontinued,
    );
    if (!othersAlive) {
      throw new LastLiveVariantNotDiscontinuableError(target.sku);
    }
    if (target.isDefault) {
      throw new DefaultVariantNotDiscontinuableError(target.sku);
    }
    target.discontinue();
  }

  /**
   * **Fait d'une déclinaison un produit** (`plan-gestes-de-declinaison.md`,
   * D2 et D3) : le nouveau produit naît de ce qu'elle VOYAIT — sa vue résolue,
   * plus la famille, le genre, la TVA, l'audience, le froid et l'opération de
   * la fiche — et l'origine l'archive dans le même geste.
   *
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
    const target = this.variant(variantId);
    if (target.isDiscontinued) {
      throw new VariantAlreadyDiscontinuedError(target.sku);
    }
    if (target.isDefault) {
      throw new DefaultVariantNotDetachableError(target.sku);
    }
    const resolved = this.resolvedSnapshot(target);
    target.detachTo(input.id);
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
      [Variant.openDefaultFrom(resolved, { ...input.defaultVariant, name: resolved.name })],
    );
  }

  /**
   * **Désarchive une déclinaison** — elle reprend son rang et sa référence, et
   * revient en vente selon l'état de la fiche. Refuse celle devenue un produit.
   *
   * @param detachedProductLabel le nom du produit qu'elle est devenue, s'il y
   *   en a un, pour que le refus le dise.
   * @throws {VariantNotDiscontinuedError} elle n'est pas archivée.
   * @throws {DetachedVariantNotRestorableError} elle est devenue un produit.
   */
  restoreVariant(variantId: string, detachedProductLabel?: string): void {
    this.variant(variantId).restore(detachedProductLabel);
  }

  /**
   * **Fait d'une déclinaison la déclinaison par défaut** (`plan-gestes-de-declinaison.md`,
   * G4). Le cœur du geste est ce qui SUIT le défaut :
   *
   * - les sœurs qui suivaient l'ancien défaut (tarif, allergènes, nutrition,
   *   minimum) suivent désormais la nouvelle — rien à écrire chez elles, le
   *   lien est vivant ({@link resolvedSnapshot}) ;
   * - la nouvelle ne peut pas se suivre elle-même : elle reçoit en PROPRE les
   *   valeurs qu'elle voyait, drapeaux remis à `false` ({@link Variant.promoteToDefault}) ;
   * - l'ancienne garde ses valeurs : un défaut ne suivait rien.
   *
   * Tenu après la bascule : une sœur qui suit le tarif se vend dans l'unité
   * du nouveau défaut ({@link assertPricingUnitsAgree}).
   *
   * @returns l'ancien défaut, et les moitiés de fiche réglementaire que la
   *   nouvelle a reçues en propre — elles se persistent par leurs ports dédiés.
   * @throws {VariantAlreadyDefaultError} elle l'est déjà.
   * @throws {DiscontinuedVariantNotDefaultableError} elle est archivée.
   * @throws {CustomRecipeDefaultWithoutTilesError} elle est sur mesure sur une fiche sans vignettes (V5).
   * @throws {DormantSheetWouldWakeError} cf. {@link Variant.promoteToDefault}.
   * @throws {PricingAlignmentAcrossUnitsError} une sœur suivrait un tarif d'une autre unité.
   */
  makeVariantDefault(variantId: string): DefaultVariantChange {
    const target = this.variant(variantId);
    if (target.isDefault) {
      throw new VariantAlreadyDefaultError(target.sku);
    }
    if (target.isDiscontinued) {
      throw new DiscontinuedVariantNotDefaultableError(target.sku);
    }
    this.refuseCustomDefaultWithoutTiles(target, this.fields.options.variantsAsTiles);
    const previous = this.defaultVariant;
    const resolved = this.resolvedSnapshot(target);
    const inherited = {
      allergens: target.follows("allergens"),
      nutrition: target.follows("nutrition"),
    };
    target.promoteToDefault(resolved);
    previous.demote();
    this.assertPricingUnitsAgree();
    return { previousDefaultId: previous.id, inherited };
  }

  /** Le produit qu'une déclinaison de la fiche est devenue, ou `null`. */
  detachedProductOf(variantId: string): string | null {
    return this.variant(variantId).detachedToProductId;
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
    // Elle hérite du sur mesure du défaut : sur une fiche réservée, une
    // déclinaison neuve naît fermée comme ses sœurs plutôt qu'ouverte à tous.
    const variant = Variant.open({
      ...input,
      position: this.nextVariantPosition,
      customRecipe: this.defaultVariant.customRecipe,
    });
    // Sur une fiche en vente, elle part au prochain envoi : déjà publiée.
    if (this.fields.status === "published") {
      variant.markPublished();
    }
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
  alignVariant(variantId: string, aspect: VariantAspect, aligned: boolean): void {
    const variant = this.variantList.find((candidate) => candidate.id === variantId);
    if (variant === undefined) {
      throw new VariantNotInProductError(this.fields.id, variantId);
    }
    variant.alignOnDefault(aspect, aligned);
    this.assertPricingUnitsAgree();
  }

  /** Le jugement d'une déclinaison alignée porte sur ce que le défaut lui prête ({@link resolveVariant}). */
  private resolvedSnapshot(variant: Variant): VariantSnapshot {
    return resolveVariant(variant, this.defaultVariant);
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
    return productSnapshot(
      this.fields,
      this.variantList.map((variant) => this.resolvedSnapshot(variant)),
    );
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
    return productSnapshot(
      this.fields,
      this.variantList.map((variant) => variant.snapshot()),
    );
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
