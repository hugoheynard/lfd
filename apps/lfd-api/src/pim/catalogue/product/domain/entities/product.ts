import { refuseEditOfArchived } from "../errors/archived-product-edit-errors.js";
import { Variant } from "./variant.js";
import { type LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { SalesContext } from "../../../../reference/sales-contexts/domain/value-objects/sales-context.js";
import type { ContextVat } from "../../../shared/domain/value-objects/context-vat.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import type { ActivationGaps } from "../services/activation-gaps.js";
import { ProductCompleteness, type CompletenessInputs } from "../services/product-completeness.js";
import type { ComplianceFinding } from "../services/product-compliance.js";
import * as transition from "./product-lifecycle.js";
import { ProductVariantGestures } from "./product-variant-gestures.js";
import { VariantLineup } from "./variant-lineup.js";
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
  type ProductSnapshot,
  type ProductStatus,
  type StatusChanged,
} from "./product-state.js";
import { VatByContext } from "../value-objects/vat-by-context.js";
import { ProductCommerceOptions } from "../value-objects/product-commerce-options.js";

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
 * Il garantit l'**invariant 2** (au moins une déclinaison, exactement une par
 * défaut — à l'ouverture ET à la reconstitution), le **slug qui suit le nom**,
 * et qu'une déclinaison ne se touche que si elle **appartient** au produit.
 * Il possède ses réglages de vente, sa TVA, ses déclinaisons et son
 * instantané comme objets, et tient les règles qui les traversent. Ce qu'il ne
 * voit pas (la famille existe-t-elle, le SKU est-il libre : une autre table)
 * reste aux handlers.
 */
export class Product extends ProductVariantGestures {
  private constructor(
    private fields: ProductFields,
    lineup: VariantLineup,
  ) {
    super(lineup);
  }

  static open(input: NewProductInput): Product {
    return new Product(openedFields(input), VariantLineup.open(input.id, input.defaultVariant));
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

  /** Déroge au taux de la famille, ou revient à l'héritage ({@link VatByContext}). */
  setVat(vat: ContextVat, contexts: readonly SalesContext[]): void {
    this.fields = { ...this.fields, vat: VatByContext.declare(vat, contexts) };
  }

  get operationOnly(): boolean {
    return this.fields.options.operationOnly;
  }

  /**
   * **Réserve la fiche aux opérations** — ou la rend à la vente courante.
   * Aucun refus : ce que le drapeau change se juge chez ceux qui VENDENT.
   * @returns `false` quand elle y était déjà ({@link StatusChanged}).
   */
  reserveForOperations(operationOnly: boolean): boolean {
    return this.changeOptions(this.fields.options.withOperationOnly(operationOnly));
  }

  get requiresCold(): boolean {
    return this.fields.options.requiresCold;
  }

  /**
   * **Déclare que la fiche demande le froid** — ou le retire. Aucun refus : ce
   * que le froid change se juge chez ceux qui CHARGENT (la livraison).
   * @returns `false` quand elle le disait déjà ({@link StatusChanged}).
   */
  declareColdRequirement(requiresCold: boolean): boolean {
    return this.changeOptions(this.fields.options.withRequiresCold(requiresCold));
  }

  get variantsAsTiles(): boolean {
    return this.fields.options.variantsAsTiles;
  }

  /**
   * **Montre chaque déclinaison en vignette** au rayon — ou seulement le
   * défaut. Un seul refus : décocher quand le défaut est sur mesure.
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

  get audience(): Audience | null {
    return this.fields.options.audience;
  }

  /**
   * À qui la fiche vend — `null` la rend à sa famille. Aucun refus : l'audience
   * se juge à l'activation et chez ceux qui vendent.
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
   * **Fait d'une déclinaison un produit** : il naît brouillon de ce qu'elle
   * VOYAIT (sa vue résolue) et de la fiche (famille, genre, TVA, réglages),
   * sous le nom de la déclinaison ; l'origine l'archive dans le même geste.
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
      detachedFields(
        this.fields,
        { id: input.id, sku: input.sku.value, name: resolved.name },
        variantId,
      ),
      VariantLineup.fromDetached(
        input.id,
        Variant.openDefaultFrom(resolved, { ...input.defaultVariant, name: resolved.name }),
      ),
    );
  }

  /**
   * L'instantané, **héritage résolu** : une alignée sort avec les allergènes
   * du défaut, pas avec `null`. La projection des canaux, l'empreinte de
   * révision et le rapport de parité le lisent tous — le résoudre ailleurs
   * donnerait trois réponses.
   */
  snapshot(): ProductSnapshot {
    return productSnapshot(this.fields, this.lineup.resolvedSnapshots());
  }

  /**
   * L'instantané **non résolu**, celui qu'on PERSISTE : écrire le résolu dans
   * les colonnes propres d'une alignée recopierait le défaut chez elle, et
   * « s'aligner puis se désaligner rend ce qu'on avait écrit » serait faux.
   */
  persistenceSnapshot(): ProductSnapshot {
    return productSnapshot(this.fields, this.lineup.ownSnapshots());
  }
}
