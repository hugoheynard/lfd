import {
  InvalidPackagingQuantityError,
  InvalidVariantPricingError,
} from "../errors/product-errors.js";
import type { Sku } from "../value-objects/sku.value-object.js";

/** Les formes d'emballage que la maison vend en volume. */
export const PACKAGING_TYPES = ["carton", "sac", "plateau"] as const;

export type PackagingType = (typeof PACKAGING_TYPES)[number];

/** Le libellé lisible d'un type, au singulier — la moitié du libellé dérivé. */
const TYPE_LABEL: Record<PackagingType, string> = {
  carton: "Carton",
  sac: "Sac",
  plateau: "Plateau",
};

export interface PackagingSnapshot {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly type: PackagingType;
  /** Nombre d'unités de la déclinaison emballées. Entier > 0. */
  readonly quantity: number;
  /** Poids BRUT, emballage inclus, en grammes ; `null` = non renseigné. */
  readonly grossWeightGrams: number | null;
  /** Prix canonique HT en centimes ; `null` = pas encore tarifé. */
  readonly priceCents: number | null;
  /** Canaux de vente propres au conditionnement. `[]` = aucun, donc invendable. */
  readonly channels: readonly string[];
}

/**
 * **Le conditionnement — une unité de vente en volume qui EMBALLE une déclinaison.**
 *
 * Il se rattache à une déclinaison, jamais au produit : « carton de 20 » ne veut
 * rien dire tant qu'on ne sait pas de quoi — de parts individuelles, ou de
 * tartes 6 parts ? La relation EST l'information (cf.
 * `documentation/b2b/architecture-conditionnements-pricing.md`, révision du
 * 2026-08-23, qui renverse la décision de le modéliser en déclinaison plate).
 *
 * Trois faits lui sont propres, et c'est ce qui en fait une entité :
 *
 * - **Le poids BRUT**, emballage inclus. Il ne se déduit pas du poids net de la
 *   déclaration nutritionnelle : un carton de 20 parts ne pèse pas 20 × le net,
 *   il pèse cela plus le carton, les intercalaires et le film. Sans lui, pas
 *   d'expédition.
 * - **Le prix canonique.** Un carton de 20 ne vaut pas 20 × l'unité — c'est le
 *   principe même de la vente en volume. Un prix dérivé ne saurait pas exprimer
 *   la remise de gros qui est la raison d'être du conditionnement.
 * - **Les canaux.** Un plateau de 6 se vend à emporter ; hériter de la famille
 *   rendrait ce cas inexprimable.
 *
 * Le **libellé est dérivé**, jamais stocké : `type` × `quantity`. Deux personnes
 * ne peuvent donc pas écrire « Carton 20 » et « carton de 20 » pour la même
 * chose — le même argument que le slug proposé depuis le nom.
 */
export class Packaging {
  private constructor(
    private readonly identity: string,
    private readonly variantIdValue: string,
    private readonly skuValue: string,
    private typeValue: PackagingType,
    private quantityValue: number,
    private grossWeightGramsValue: number | null,
    private priceCentsValue: number | null,
    private channelsValue: readonly string[],
  ) {}

  /** Un conditionnement neuf : emballé, mais ni pesé, ni tarifé, ni diffusé. */
  static open(input: {
    id: string;
    variantId: string;
    sku: Sku;
    type: PackagingType;
    quantity: number;
  }): Packaging {
    return new Packaging(
      input.id,
      input.variantId,
      input.sku.value,
      input.type,
      requirePositiveQuantity(input.quantity),
      null,
      null,
      [],
    );
  }

  static reconstitute(snapshot: PackagingSnapshot): Packaging {
    return new Packaging(
      snapshot.id,
      snapshot.variantId,
      snapshot.sku,
      snapshot.type,
      snapshot.quantity,
      snapshot.grossWeightGrams,
      snapshot.priceCents,
      snapshot.channels,
    );
  }

  get id(): string {
    return this.identity;
  }

  get variantId(): string {
    return this.variantIdValue;
  }

  get sku(): string {
    return this.skuValue;
  }

  /**
   * Le libellé lisible, DÉRIVÉ — « Carton de 20 ».
   *
   * Il n'est pas un champ : le stocker rouvrirait la porte aux deux graphies
   * pour la même chose.
   */
  get label(): string {
    return `${TYPE_LABEL[this.typeValue]} de ${String(this.quantityValue)}`;
  }

  /**
   * Prêt à expédier ? Un conditionnement sans poids brut ne peut pas partir :
   * le transporteur le refuse, et c'est ce qui le fait entrer dans la
   * complétude d'un produit.
   */
  get isShippable(): boolean {
    return this.grossWeightGramsValue !== null;
  }

  /** Ce qu'il emballe, et en quelle quantité. */
  repack(type: PackagingType, quantity: number): void {
    this.typeValue = type;
    this.quantityValue = requirePositiveQuantity(quantity);
  }

  /** Tarif, poids brut et canaux en un geste — comme le back-office les saisit. */
  describe(input: {
    grossWeightGrams: number | null;
    priceCents: number | null;
    channels: readonly string[];
  }): void {
    this.grossWeightGramsValue = requireCountOrNull("grossWeightGrams", input.grossWeightGrams);
    this.priceCentsValue = requireCountOrNull("priceCents", input.priceCents);
    // Dédupliqué et ordonné : deux écritures des mêmes canaux dans un ordre
    // différent ne doivent pas se lire comme une modification.
    this.channelsValue = [...new Set(input.channels)].sort();
  }

  snapshot(): PackagingSnapshot {
    return {
      id: this.identity,
      variantId: this.variantIdValue,
      sku: this.skuValue,
      type: this.typeValue,
      quantity: this.quantityValue,
      grossWeightGrams: this.grossWeightGramsValue,
      priceCents: this.priceCentsValue,
      channels: this.channelsValue,
    };
  }
}

/** Un conditionnement emballe au moins une unité — zéro n'emballe rien. */
function requirePositiveQuantity(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InvalidPackagingQuantityError(value);
  }
  return value;
}

/** Les centimes et les grammes sont des ENTIERS positifs — ou rien. */
function requireCountOrNull(field: string, value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidVariantPricingError(field, value);
  }
  return value;
}
