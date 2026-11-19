import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { AllergenDeclaration } from "../value-objects/nutrition-declaration.js";
import type { MinQuantities } from "../value-objects/min-quantities.js";
import type { SaleUnitClearance } from "../value-objects/sale-reference-usage.js";
import type { DefaultVariantChange, ProductStatus } from "./product-state.js";
import type { NewVariantInput, VariantLineup } from "./variant-lineup.js";
import type {
  Variant,
  VariantAspect,
  VariantNutritionValues,
  VariantPricing,
  VariantSnapshot,
} from "./variant.js";

/**
 * **Les gestes de `Product` qui s'adressent à UNE déclinaison**, ou à toutes.
 *
 * Le passage par la fiche n'est pas de la cérémonie : c'est elle qui refuse de
 * toucher la déclinaison d'une AUTRE fiche, et une requête forgée sur le seul
 * identifiant d'une déclinaison n'a donc aucun effet. Chaque geste ne fait que
 * trouver la déclinaison dans {@link VariantLineup} puis lui parler — les
 * règles vivent chez elle, ou dans la collection quand il faut voir les sœurs.
 *
 * Une classe de base et non un objet de plus : ces gestes SONT l'API publique
 * de `Product` (aucun handler ne change), et seuls l'état de la fiche (son
 * statut, ses vignettes) lui manque — les deux accesseurs abstraits que
 * `Product` fournit. La séparer ne change donc ni l'agrégat ni sa racine.
 */
export abstract class ProductVariantGestures {
  protected constructor(protected readonly lineup: VariantLineup) {}

  abstract get status(): ProductStatus;
  abstract get variantsAsTiles(): boolean;

  /**
   * Les déclinaisons **résolues** — une alignée porte la déclaration du défaut.
   * Le jugement et l'encart de composition la lisent tous deux, pour ne jamais
   * diverger.
   */
  resolvedVariants(): VariantSnapshot[] {
    return this.lineup.resolvedSnapshots();
  }

  /** Le nom de BOUTIQUE d'une déclinaison — qui fige le libellé interne au premier écart. */
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

  /** Tarif et poids d'une déclinaison **du produit** ; une alignée garde l'unité du défaut. */
  priceVariant(variantId: string, pricing: VariantPricing, clearance?: SaleUnitClearance): void {
    this.lineup.get(variantId).price(pricing, clearance);
    this.lineup.assertPricingUnitsAgree();
  }

  /**
   * **Les allergènes d'une déclinaison**, sans toucher à ses valeurs — la
   * moitié qui engage la sécurité du mangeur.
   *
   * 🔴 Ce verbe ne PERSISTE rien : l'écriture reste au port dédié. Il existe
   * pour que l'agrégat porte l'état qu'il est seul à savoir juger — `activate`
   * juge la déclinaison RÉSOLUE contre son défaut, sur l'état d'APRÈS.
   */
  declareAllergens(variantId: string, declaration: AllergenDeclaration): void {
    this.lineup.get(variantId).declareAllergens(declaration);
  }

  /**
   * **Ce qu'une déclinaison déclare elle-même** comme allergènes et traces —
   * sa moitié propre, héritage non résolu : ce que le dépôt des allergènes
   * persiste. `null` tant qu'elle n'a rien déclaré.
   *
   * @throws {VariantNotFoundError} la déclinaison n'est pas sous cette fiche.
   */
  ownAllergenDeclaration(variantId: string): AllergenDeclaration | null {
    const sheet = this.lineup.get(variantId).snapshot().allergenSheet;
    return sheet === null ? null : { allergens: sheet.declared, mayContain: sheet.mayContain };
  }

  /** **Les valeurs d'une déclinaison**, sans toucher à ses allergènes. */
  declareNutritionValues(variantId: string, values: VariantNutritionValues): void {
    this.lineup.get(variantId).declareNutritionValues(values);
  }

  /**
   * Refuse si la déclinaison n'est pas du produit — pour les verbes dont
   * l'écriture passe par un satellite (la fiche réglementaire).
   */
  requireVariant(variantId: string): void {
    this.lineup.get(variantId);
  }

  /**
   * **La quantité minimale d'une déclinaison** — pro et public, ou `"follow"`
   * pour suivre le défaut. Par audience seulement : aucun contexte de vente à
   * vérifier.
   *
   * @returns `false` quand la déclinaison le disait déjà.
   */
  changeMinQuantities(variantId: string, next: MinQuantities | "follow"): boolean {
    return this.lineup.get(variantId).changeMinQuantities(next);
  }

  /**
   * **Déclare une déclinaison sur mesure** — ou la rend ouverte. Seule elle
   * bascule : ses sœurs gardent leur case. Se règle quel que soit le statut :
   * le geste prépare, il ne vend pas ; le commerce ne sert un article sur
   * mesure qu'aux comptes auxquels il l'a attribué.
   *
   * @returns `false` quand elle le disait déjà.
   * @throws {CustomRecipeDefaultWithoutTilesError} le défaut d'une fiche sans vignettes.
   */
  declareVariantCustomRecipe(variantId: string, customRecipe: boolean): boolean {
    const target = this.lineup.get(variantId);
    if (customRecipe && target.isDefault) {
      this.lineup.refuseCustomDefaultWithoutTiles(target, this.variantsAsTiles, true);
    }
    return target.declareCustomRecipe(customRecipe);
  }

  /**
   * **Archive une déclinaison** — hors vente, en base pour toujours : elle
   * RESTE dans la fiche et son rang reste pris. Les refus (le défaut, la
   * dernière vivante, une déjà archivée) sont ceux de {@link VariantLineup}.
   */
  discontinueVariant(variantId: string): void {
    this.lineup.discontinue(variantId);
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
   * **Fait d'une déclinaison la déclinaison par défaut.** Ce qui SUIT le
   * défaut est décrit par {@link VariantLineup.makeDefault} ; la fiche y ajoute
   * ce qu'elle seule sait, si elle montre ses vignettes.
   *
   * @returns l'ancien défaut, et les moitiés de fiche que la nouvelle a reçues
   *   en propre — elles se persistent par leurs ports dédiés.
   */
  makeVariantDefault(variantId: string): DefaultVariantChange {
    return this.lineup.makeDefault(variantId, this.variantsAsTiles);
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
    return this.lineup.add(input, this.status === "published");
  }

  /** Le rang de la prochaine déclinaison — jamais leur nombre ({@link VariantLineup.nextPosition}). */
  get nextVariantPosition(): number {
    return this.lineup.nextPosition;
  }

  /** Aligne une déclinaison sur la fiche du défaut, ou l'en détache. */
  alignVariant(variantId: string, aspect: VariantAspect, aligned: boolean): void {
    this.lineup.align(variantId, aspect, aligned);
  }
}
