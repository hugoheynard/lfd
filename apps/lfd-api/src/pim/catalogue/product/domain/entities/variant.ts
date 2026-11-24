import { DefaultVariantCannotFollowItselfError } from "../errors/product-errors.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { AllergenDeclaration } from "../value-objects/nutrition-declaration.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { SaleUnitClearance } from "../value-objects/sale-reference-usage.js";
import { BlankVariantInternalLabelError } from "../errors/variant-label-errors.js";
import type { MinQuantities } from "../value-objects/min-quantities.js";
import type { SaleUnit } from "../value-objects/sale-terms.js";
import {
  defaultSnapshotFrom,
  openedDefaultSnapshot,
  openedSnapshot,
  variantSnapshot,
  type OpenedVariantInput,
} from "./variant-snapshot-mapper.js";
import { VariantSale } from "./variant-sale.js";
import { VariantRegulatory } from "./variant-regulatory.js";
import { VariantLifecycle } from "./variant-lifecycle.js";
import { ASPECT_FLAG, type VariantAspect } from "./variant-aspect.js";
import type {
  VariantNutritionValues,
  VariantPricing,
  VariantSnapshot,
} from "./variant-snapshot.js";

export { followsDefaultIn, type VariantAspect } from "./variant-aspect.js";
export type {
  VariantAllergenSheetSnapshot,
  VariantNutritionSnapshot,
  VariantNutritionValues,
  VariantPricing,
  VariantSnapshot,
} from "./variant-snapshot.js";

/**
 * **La déclinaison — une entité DANS l'agrégat produit.** Elle ne vit jamais
 * seule : on l'atteint par son produit, ce qui rend tenables les invariants qui
 * traversent les deux. Elle possède son cycle de vie ({@link VariantLifecycle}),
 * sa fiche réglementaire ({@link VariantRegulatory}, persistée par deux ports
 * dédiés mais portée ici pour répondre « suis-je publiable ? ») et sa façon de
 * se vendre ({@link VariantSale}).
 */
export class Variant {
  private lifecycle: VariantLifecycle;
  private regulatory: VariantRegulatory;
  private sale: VariantSale;
  private readonly identity: string;
  private readonly skuValue: string;
  private nameValue: LocalizedText;
  private internalLabelValue: string | null;
  private readonly optionsValue: Readonly<Record<string, string>>;
  private readonly positionValue: number;
  private customRecipeFlag: boolean;
  private audienceValue: Audience | null;

  /** L'instantané plutôt que des arguments positionnels : le tarif seul aligne des `number | null` voisins qu'aucun compilateur ne distingue. */
  private constructor(snapshot: VariantSnapshot) {
    this.identity = snapshot.id;
    this.skuValue = snapshot.sku;
    this.nameValue = snapshot.name;
    this.internalLabelValue = snapshot.internalLabel ?? null;
    this.optionsValue = snapshot.options;
    this.positionValue = snapshot.position;
    this.customRecipeFlag = snapshot.customRecipe ?? false;
    this.audienceValue = snapshot.audience ?? null;
    this.lifecycle = VariantLifecycle.fromSnapshot(snapshot);
    this.regulatory = VariantRegulatory.fromSnapshot(snapshot);
    this.sale = VariantSale.fromSnapshot(snapshot);
  }

  /** La déclinaison née avec son produit : par défaut, en tête, sans tarif, hors taxe ({@link openedDefaultSnapshot}). */
  static openDefault(input: { id: string; sku: Sku; name: LocalizedText }): Variant {
    return new Variant(openedDefaultSnapshot(input));
  }

  /** Une déclinaison **de plus** — jamais la première, jamais le défaut ({@link openedSnapshot}). */
  static open(input: OpenedVariantInput): Variant {
    return new Variant(openedSnapshot(input));
  }

  static reconstitute(snapshot: VariantSnapshot): Variant {
    return new Variant(snapshot);
  }

  /** Le défaut d'un produit **né d'une déclinaison détachée** ({@link defaultSnapshotFrom}). */
  static openDefaultFrom(
    resolved: VariantSnapshot,
    input: { id: string; sku: Sku; name: LocalizedText },
  ): Variant {
    return new Variant(defaultSnapshotFrom(resolved, input));
  }

  get id(): string {
    return this.identity;
  }

  get sku(): string {
    return this.skuValue;
  }

  get isDefault(): boolean {
    return this.lifecycle.isDefault;
  }

  get isDiscontinued(): boolean {
    return this.lifecycle.isDiscontinued;
  }

  get position(): number {
    return this.positionValue;
  }

  get regulatoryFollowsDefault(): boolean {
    return this.regulatory.followsAllergens;
  }

  get nutritionFollowsDefault(): boolean {
    return this.regulatory.followsNutrition;
  }

  get pricingFollowsDefault(): boolean {
    return this.sale.followsPricing;
  }

  follows(aspect: VariantAspect): boolean {
    const flag = ASPECT_FLAG[aspect];
    return flag === "pricing" ? this.sale.followsPricing : this.regulatory.follows(flag);
  }

  /** **Déclare-t-elle SES allergènes ?** — et rien d'autre ({@link VariantRegulatory.declaresOwnAllergens}) ; une alignée est jugée par la fiche. */
  get declaresOwnAllergens(): boolean {
    return this.regulatory.declaresOwnAllergens;
  }

  /**
   * **La moitié « sécurité » seule**, pour que l'agrégat juge l'état d'APRÈS.
   * 🔴 L'écriture reste au port dédié : `save()` réécrit TOUTES les
   * déclinaisons, et écraserait une déclaration faite entre temps.
   */
  declareAllergens(declaration: AllergenDeclaration): void {
    this.regulatory = this.regulatory.declareAllergens(declaration);
  }

  /** **La moitié « valeurs » seule** : enregistrer un tableau nutritionnel ne peut pas fabriquer une affirmation d'allergène. */
  declareNutritionValues(values: VariantNutritionValues): void {
    this.regulatory = this.regulatory.declareNutritionValues(values);
  }

  /**
   * S'aligne sur le défaut pour CETTE section, ou reprend la sienne (le drapeau seul).
   * @throws {DefaultVariantCannotFollowItselfError} le défaut ne se suit pas.
   */
  alignOnDefault(aspect: VariantAspect, aligned: boolean): void {
    if (aligned && this.lifecycle.isDefault) {
      throw new DefaultVariantCannotFollowItselfError(this.skuValue);
    }
    const flag = ASPECT_FLAG[aspect];
    if (flag === "pricing") {
      this.sale = this.sale.alignPricing(aligned);
    } else {
      this.regulatory = this.regulatory.align(flag, aligned);
    }
  }

  /** **Change le nom de BOUTIQUE** — « Boîte de 220 g », pas le nom de la fiche ; la référence reste immuable. */
  renameForShop(name: LocalizedText): void {
    // Le libellé se FIGE au premier écart, sans quoi renommer la boutique renommerait l'onglet.
    this.internalLabelValue ??= this.nameValue.fr;
    this.nameValue = name;
  }

  /** Le **libellé interne** — l'onglet du référentiel, jamais la boutique : le nom de boutique ne bouge pas. */
  renameInternalLabel(label: string): void {
    const trimmed = label.trim();
    if (trimmed.length === 0) {
      throw new BlankVariantInternalLabelError(this.skuValue);
    }
    this.internalLabelValue = trimmed;
  }

  get internalLabel(): string {
    return this.internalLabelValue ?? this.nameValue.fr;
  }

  /** Tarif et poids en un geste, comme le back-office les saisit ({@link VariantSale.price}). */
  price(input: VariantPricing, clearance?: SaleUnitClearance): void {
    this.sale = this.sale.price(input, this.skuValue, clearance);
  }

  get minQuantityFollowsDefault(): boolean {
    return this.sale.fields.minQuantityFollowsDefault;
  }

  /** **Pose sa quantité minimale** — une paire, ou `"follow"` ({@link VariantSale.changeMinQuantities}). `false` : déjà celle-là. */
  changeMinQuantities(next: MinQuantities | "follow"): boolean {
    const { sale, changed } = this.sale.changeMinQuantities(next, {
      isDefault: this.lifecycle.isDefault,
      sku: this.skuValue,
    });
    this.sale = sale;
    return changed;
  }

  get customRecipe(): boolean {
    return this.customRecipeFlag;
  }

  /** **La déclare sur mesure** — ou la rend ouverte (le refus lié à la fiche est celui de l'agrégat). `false` : elle le disait déjà. */
  declareCustomRecipe(customRecipe: boolean): boolean {
    if (this.customRecipeFlag === customRecipe) {
      return false;
    }
    this.customRecipeFlag = customRecipe;
    return true;
  }

  /** Son audience propre ; `null` = elle suit sa fiche. */
  get audience(): Audience | null {
    return this.audienceValue;
  }

  /** **Pose son audience**, ou `null` pour suivre la fiche (les refus liés à la fiche sont ceux de l'agrégat). `false` : déjà celle-là. */
  changeAudience(next: Audience | null): boolean {
    if (this.audienceValue === next) {
      return false;
    }
    this.audienceValue = next;
    return true;
  }

  get saleUnit(): SaleUnit {
    return this.sale.saleUnit;
  }

  /** Inscrit qu'elle part à la vente — irréversible ({@link VariantLifecycle.markPublished}). */
  markPublished(): void {
    this.lifecycle = this.lifecycle.markPublished();
  }

  /** **La sort de la vente**, sans la supprimer ; les refus qui dépendent de ses sœurs sont ceux de l'agrégat. */
  discontinue(): void {
    this.lifecycle = this.lifecycle.discontinue(this.skuValue);
  }

  /** L'archive en la disant devenue ce produit — le détachement. */
  detachTo(productId: string): void {
    this.lifecycle = this.lifecycle.detachTo(this.skuValue, productId);
  }

  get detachedToProductId(): string | null {
    return this.lifecycle.detachedToProductId;
  }

  /** **La remet en vente**, à son rang ; refuse celle devenue un produit ({@link VariantLifecycle.restore}). */
  restore(detachedProductLabel?: string): void {
    this.lifecycle = this.lifecycle.restore(this.skuValue, detachedProductLabel);
  }

  /** **Cède la place de défaut** : elle garde tout ce qu'elle porte. */
  demote(): void {
    this.lifecycle = this.lifecycle.demote();
  }

  /**
   * **Devient la déclinaison par défaut** — elle ne peut plus se suivre
   * elle-même, donc chaque moitié qu'elle suivait passe en PROPRE avec la
   * valeur qu'elle voyait (`resolved`, résolu AVANT la bascule). Les refus
   * qui dépendent de la fiche sont ceux de l'agrégat.
   *
   * @throws {DormantSheetWouldWakeError} cf. {@link VariantRegulatory.promote}.
   */
  promoteToDefault(resolved: VariantSnapshot): void {
    this.regulatory = this.regulatory.promote(this.skuValue, resolved);
    this.sale = this.sale.promote(resolved);
    this.lifecycle = this.lifecycle.promote();
  }

  get hasOwnProPrice(): boolean {
    return this.sale.hasOwnProPrice;
  }

  snapshot(): VariantSnapshot {
    return variantSnapshot(
      {
        id: this.identity,
        sku: this.skuValue,
        name: this.nameValue,
        internalLabel: this.internalLabelValue,
        options: this.optionsValue,
        position: this.positionValue,
        customRecipe: this.customRecipeFlag,
        audience: this.audienceValue,
      },
      this.lifecycle,
      this.regulatory,
      this.sale,
    );
  }
}
