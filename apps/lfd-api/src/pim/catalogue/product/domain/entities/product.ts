import { refuseEditOfArchived } from "../errors/archived-product-edit-errors.js";
import { type LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { SalesContext } from "../../../../reference/sales-contexts/domain/value-objects/sales-context.js";
import type { ContextVat } from "../../../shared/domain/value-objects/context-vat.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import type { ActivationGaps } from "../services/activation-gaps.js";
import { ProductCompleteness, type CompletenessInputs } from "../services/product-completeness.js";
import type { ComplianceFinding } from "../services/product-compliance.js";
import * as transition from "./product-lifecycle.js";
import { ProductLineup } from "./product-lineup.js";
import { VariantLineup, type NewVariantInput } from "./variant-lineup.js";
import type { Variant, VariantSnapshot } from "./variant.js";
import {
  detachedFields,
  openedFields,
  productFieldsFrom,
  productSnapshot,
  type ProductFields,
} from "./product-snapshot-mapper.js";
import {
  slugOf,
  type NewProductInput,
  type ProductKind,
  type DefaultVariantChange,
  type ProductSnapshot,
  type ProductStatus,
  type StatusChanged,
} from "./product-state.js";
import { VatByContext } from "../value-objects/vat-by-context.js";
import { ProductCommerceOptions } from "../value-objects/product-commerce-options.js";

export { isLiveStatus } from "./product-state.js";
export type * from "./product-state.js";

/**
 * **Le produit — l'agrégat, déclinaisons comprises.** Il garantit
 * l'**invariant 2** (au moins une déclinaison, exactement une par défaut — à
 * l'ouverture ET à la reconstitution), le **slug qui suit le nom**, et qu'une
 * déclinaison ne se touche que si elle **appartient** au produit. Il possède
 * ses réglages, sa TVA et ses déclinaisons ({@link ProductLineup}) comme
 * objets. Ce qu'il ne voit pas (la famille existe-t-elle, le SKU est-il libre)
 * reste aux handlers.
 */
export class Product {
  private constructor(
    private fields: ProductFields,
    private readonly lineup: ProductLineup,
  ) {}

  static open(input: NewProductInput): Product {
    const variants = VariantLineup.open(input.id, input.defaultVariant);
    return new Product(openedFields(input), new ProductLineup(variants));
  }
  static reconstitute(snapshot: ProductSnapshot): Product {
    const variants = VariantLineup.reconstitute(snapshot.id, snapshot.variants);
    return new Product(productFieldsFrom(snapshot), new ProductLineup(variants));
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
  /** Déroge au taux de la famille, ou revient à l'héritage ({@link VatByContext}). */
  setVat(vat: ContextVat, contexts: readonly SalesContext[]): void {
    this.fields = { ...this.fields, vat: VatByContext.declare(vat, contexts) };
  }

  // Les réglages de vente (`ProductCommerceOptions`) se jugent chez ceux qui vendent.
  // Un geste rend `false` si la fiche le disait déjà.

  get operationOnly(): boolean {
    return this.fields.options.operationOnly;
  }
  get requiresCold(): boolean {
    return this.fields.options.requiresCold;
  }
  get audience(): Audience | null {
    return this.fields.options.audience;
  }

  /** **Réserve la fiche aux opérations** — ou la rend à la vente courante. */
  reserveForOperations(operationOnly: boolean): boolean {
    return this.changeOptions(this.fields.options.withOperationOnly(operationOnly));
  }
  /** **Déclare que la fiche demande le froid** — ou le retire. */
  declareColdRequirement(requiresCold: boolean): boolean {
    return this.changeOptions(this.fields.options.withRequiresCold(requiresCold));
  }
  /** À qui la fiche vend — `null` la rend à sa famille. */
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

  /** Une archivée ne se modifie pas : on la restaure d'abord. */
  requireEditable(gesture: Parameters<typeof refuseEditOfArchived>[2]): void {
    refuseEditOfArchived(this.fields.status, this.fields.id, gesture);
  }
  /** Renomme — et re-dérive le slug. */
  rename(name: LocalizedText): void {
    this.requireEditable("rename");
    this.fields = { ...this.fields, name, slug: slugOf(name) };
  }
  changeKind(kind: ProductKind): void {
    this.requireEditable("change_kind");
    this.fields = { ...this.fields, kind };
  }
  /** Range le produit dans une autre famille (`ReclassifyProduct`). */
  reclassify(categoryId: string): void {
    this.requireEditable("reclassify");
    this.fields = { ...this.fields, categoryId };
  }

  /** **Invariant 7** : ce qui manque pour mettre en vente — voir {@link ProductCompleteness}. */
  activationGapsWith(...inputs: CompletenessInputs): ActivationGaps {
    return this.completeness().gaps(...inputs);
  }
  /** Le jugement unique de la fiche : tous ses constats, quel que soit son statut. */
  complianceWith(...inputs: CompletenessInputs): ComplianceFinding[] {
    return this.completeness().findings(...inputs);
  }
  /** Une activation changerait-elle la fiche ? Vrai seulement pour un brouillon complet. */
  isActivatableWith(...inputs: CompletenessInputs): boolean {
    return this.completeness().isActivatable(...inputs);
  }
  private completeness(): ProductCompleteness {
    return ProductCompleteness.of({
      status: this.fields.status,
      variants: this.resolvedVariants(),
      audience: this.fields.options.audience,
    });
  }

  /** Met la fiche en vente — toutes ses déclinaisons partent avec elle, ce qui fige leur unité de vente. */
  activate(...inputs: CompletenessInputs): StatusChanged {
    const changed = this.moveTo(
      transition.statusAfterActivation(this.fields.id, this.fields.status, () =>
        this.complianceWith(...inputs),
      ),
    );
    if (changed) {
      this.lineup.markAllPublished();
    }
    return changed;
  }

  /** Retire de la vente en ligne, sans archiver : le produit redevient brouillon. */
  deactivate(): StatusChanged {
    return this.moveTo(transition.statusAfterDeactivation(this.fields.id, this.fields.status));
  }
  /** Retire de la vente sans supprimer. Idempotent. */
  archive(): StatusChanged {
    return this.moveTo(transition.statusAfterArchiving(this.fields.id, this.fields.status));
  }
  /** Remet une archivée en brouillon — jamais directement en ligne. */
  restore(): StatusChanged {
    return this.moveTo(transition.statusAfterRestoration(this.fields.id, this.fields.status));
  }
  /** Supprime une fiche archivée — un soft delete (le SKU reste pris). */
  delete(): void {
    this.moveTo(transition.statusAfterDeletion(this.fields.id, this.fields.status));
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
   * **Fait d'une déclinaison un produit**, brouillon né de sa vue résolue et de la fiche.
   * @throws {DefaultVariantNotDetachableError} le défaut porte la fiche.
   * @throws {VariantAlreadyDiscontinuedError} une archivée ne se détache pas.
   */
  detachVariant(
    variantId: string,
    input: { id: string; sku: Sku; defaultVariant: { id: string; sku: Sku } },
  ): Product {
    const { name, lineup, audience } = this.lineup.detachInto(variantId, input);
    const identity = { id: input.id, sku: input.sku.value, name, audience };
    return new Product(detachedFields(this.fields, identity, variantId), lineup);
  }

  /** L'instantané, **héritage résolu** : canaux, empreinte de révision et parité le lisent tous. */
  snapshot(): ProductSnapshot {
    return productSnapshot(this.fields, this.lineup.resolvedVariants());
  }
  /**
   * L'instantané **non résolu**, celui qu'on PERSISTE : écrire le résolu dans
   * les colonnes propres d'une alignée recopierait le défaut chez elle, et
   * « s'aligner puis se désaligner rend ce qu'on avait écrit » serait faux.
   */
  persistenceSnapshot(): ProductSnapshot {
    return productSnapshot(this.fields, this.lineup.ownVariants());
  }

  // Les gestes adressés à une déclinaison, délégués à `ProductLineup` qui porte leurs règles.

  resolvedVariants(): VariantSnapshot[] {
    return this.lineup.resolvedVariants();
  }
  renameVariantForShop(...args: Parameters<ProductLineup["renameVariantForShop"]>): void {
    this.lineup.renameVariantForShop(...args);
  }
  variantInternalLabel(...args: Parameters<ProductLineup["variantInternalLabel"]>): string {
    return this.lineup.variantInternalLabel(...args);
  }
  renameVariantInternalLabel(
    ...args: Parameters<ProductLineup["renameVariantInternalLabel"]>
  ): void {
    this.lineup.renameVariantInternalLabel(...args);
  }
  priceVariant(...args: Parameters<ProductLineup["priceVariant"]>): void {
    this.lineup.priceVariant(...args);
  }
  declareAllergens(...args: Parameters<ProductLineup["declareAllergens"]>): void {
    this.lineup.declareAllergens(...args);
  }
  ownAllergenDeclaration(
    ...args: Parameters<ProductLineup["ownAllergenDeclaration"]>
  ): ReturnType<ProductLineup["ownAllergenDeclaration"]> {
    return this.lineup.ownAllergenDeclaration(...args);
  }
  declareNutritionValues(...args: Parameters<ProductLineup["declareNutritionValues"]>): void {
    this.lineup.declareNutritionValues(...args);
  }
  requireVariant(...args: Parameters<ProductLineup["requireVariant"]>): void {
    this.lineup.requireVariant(...args);
  }
  changeMinQuantities(...args: Parameters<ProductLineup["changeMinQuantities"]>): boolean {
    return this.lineup.changeMinQuantities(...args);
  }
  declareVariantCustomRecipe(variantId: string, customRecipe: boolean): boolean {
    return this.lineup.declareVariantCustomRecipe(variantId, customRecipe);
  }
  discontinueVariant(...args: Parameters<ProductLineup["discontinueVariant"]>): void {
    this.lineup.discontinueVariant(...args);
  }
  restoreVariant(variantId: string, detachedProductLabel?: string): void {
    this.lineup.restoreVariant(variantId, detachedProductLabel);
  }
  changeVariantAudience(variantId: string, next: Audience | null): boolean {
    return this.lineup.changeVariantAudience(variantId, next);
  }
  makeVariantDefault(variantId: string): DefaultVariantChange {
    return this.lineup.makeVariantDefault(variantId);
  }
  detachedProductOf(...args: Parameters<ProductLineup["detachedProductOf"]>): string | null {
    return this.lineup.detachedProductOf(...args);
  }
  addVariant(input: NewVariantInput): Variant {
    return this.lineup.addVariant(input, this.status === "published");
  }
  get nextVariantPosition(): number {
    return this.lineup.nextVariantPosition;
  }
  alignVariant(...args: Parameters<ProductLineup["alignVariant"]>): void {
    this.lineup.alignVariant(...args);
  }
}
