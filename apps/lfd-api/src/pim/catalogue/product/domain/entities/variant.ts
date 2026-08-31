import { InvalidVariantPricingError } from "../errors/product-errors.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { Sku } from "../value-objects/sku.value-object.js";

/** Valeurs nutritionnelles pour 100 g ; chaque champ `null` = non renseigné. */
export interface VariantNutritionSnapshot {
  readonly mayContain: readonly string[];
  readonly energyKcal: number | null;
  readonly fatG: number | null;
  readonly saturatedFatG: number | null;
  readonly carbsG: number | null;
  readonly sugarsG: number | null;
  readonly proteinG: number | null;
  readonly saltG: number | null;
  readonly glycemicIndex: number | null;
}

export interface VariantSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly options: Readonly<Record<string, string>>;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly position: number;
  /** Prix canonique en centimes ; `null` = pas encore tarifé. */
  readonly priceCents: number | null;
  /** Poids net de l'unité vendue, en grammes ; `null` = non renseigné. */
  readonly weightGrams: number | null;
  /** `null` = fiche **non renseignée** ; `[]` = « aucun allergène » déclaré. */
  readonly allergens: readonly string[] | null;
  readonly nutrition: VariantNutritionSnapshot | null;
}

/**
 * **La déclinaison — une entité DANS l'agrégat produit.**
 *
 * Elle ne vit jamais seule : on ne la charge pas, on ne la sauve pas, on
 * l'atteint par son produit. C'est ce qui rend tenables les invariants qui
 * traversent les deux (« exactement une par défaut », « pas de publication
 * sans fiche sur chaque déclinaison active »).
 *
 * La fiche réglementaire (`allergens` / `nutrition`) est ici en **lecture
 * seule** : elle s'écrit par son propre verbe, à travers `NutritionRepository`.
 * La déclinaison la porte pour que le produit puisse répondre « suis-je
 * publiable ? » sans aller la rechercher ailleurs.
 */
/** Ce que la section « Tarif & TVA » possède, pour une déclinaison. */
export interface VariantPricing {
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
}

export class Variant {
  private readonly identity: string;
  private readonly skuValue: string;
  private readonly nameValue: LocalizedText;
  private readonly optionsValue: Readonly<Record<string, string>>;
  private defaultFlag: boolean;
  private discontinuedFlag: boolean;
  private positionValue: number;
  private priceCentsValue: number | null;
  private weightGramsValue: number | null;
  private readonly allergensValue: readonly string[] | null;
  private readonly nutritionValue: VariantNutritionSnapshot | null;

  /**
   * L'instantané, et non onze arguments positionnels.
   *
   * Ils étaient onze, et l'assiette du prix en aurait fait douze — dont trois
   * `boolean` et quatre `number | null` voisins, qu'aucun compilateur ne
   * distingue si on les intervertit. La même raison a fait passer
   * `VatRate.revise` et `Category.setVat` au record.
   */
  private constructor(snapshot: VariantSnapshot) {
    this.identity = snapshot.id;
    this.skuValue = snapshot.sku;
    this.nameValue = snapshot.name;
    this.optionsValue = snapshot.options;
    this.defaultFlag = snapshot.isDefault;
    this.discontinuedFlag = snapshot.isDiscontinued;
    this.positionValue = snapshot.position;
    this.priceCentsValue = snapshot.priceCents;
    this.weightGramsValue = snapshot.weightGrams;
    this.allergensValue = snapshot.allergens;
    this.nutritionValue = snapshot.nutrition;
  }

  /**
   * La déclinaison née avec son produit : par défaut, en tête, sans tarif.
   *
   * Elle naît **hors taxe**, l'assiette historique du référentiel. Un article
   * neuf n'a aucune raison de basculer sans qu'on le décide, et le défaut de la
   * base dit la même chose.
   */
  static openDefault(input: { id: string; sku: Sku; name: LocalizedText }): Variant {
    return new Variant({
      id: input.id,
      sku: input.sku.value,
      name: input.name,
      options: {},
      isDefault: true,
      isDiscontinued: false,
      position: 0,
      priceCents: null,
      weightGrams: null,
      allergens: null,
      nutrition: null,
    });
  }

  static reconstitute(snapshot: VariantSnapshot): Variant {
    return new Variant(snapshot);
  }

  get id(): string {
    return this.identity;
  }

  get sku(): string {
    return this.skuValue;
  }

  get isDefault(): boolean {
    return this.defaultFlag;
  }

  get isDiscontinued(): boolean {
    return this.discontinuedFlag;
  }

  /** Invariant 7 : `[]` compte comme déclaré — c'est une affirmation positive. */
  get hasRegulatorySheet(): boolean {
    return this.allergensValue !== null;
  }

  /**
   * Tarif et poids en un geste : c'est ainsi que le back-office les saisit.
   *
   * Un record plutôt que deux arguments positionnels : deux `number | null`
   * voisins qu'aucun compilateur ne distingue si on les intervertit. La même
   * raison a fait passer `VatRate.revise` au record.
   *
   * `priceCents` EST un prix public TTC — il n'y a plus d'assiette à côté pour
   * le dire, parce qu'il n'y a plus qu'une assiette. Le hors taxe se déduit du
   * taux de chaque canal, au moment de la projection.
   */
  price(input: VariantPricing): void {
    this.priceCentsValue = requireCountOrNull("priceCents", input.priceCents);
    this.weightGramsValue = requireCountOrNull("weightGrams", input.weightGrams);
  }

  snapshot(): VariantSnapshot {
    return {
      id: this.identity,
      sku: this.skuValue,
      name: this.nameValue,
      options: this.optionsValue,
      isDefault: this.defaultFlag,
      isDiscontinued: this.discontinuedFlag,
      position: this.positionValue,
      priceCents: this.priceCentsValue,
      weightGrams: this.weightGramsValue,
      allergens: this.allergensValue,
      nutrition: this.nutritionValue,
    };
  }
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
