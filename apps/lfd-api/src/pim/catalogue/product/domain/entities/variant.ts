import { InvalidVariantPricingError } from "../errors/product-errors.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { Sku } from "../value-objects/sku.value-object.js";

/** Valeurs nutritionnelles pour 100 g ; chaque champ `null` = non renseigné. */
export interface VariantNutritionSnapshot {
  readonly mayContain: readonly string[];
  readonly energyKcal: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly proteinG: number | null;
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
  /** Prix canonique HT en centimes ; `null` = pas encore tarifé. */
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
export class Variant {
  private constructor(
    private readonly identity: string,
    private readonly skuValue: string,
    private readonly nameValue: LocalizedText,
    private readonly optionsValue: Readonly<Record<string, string>>,
    private defaultFlag: boolean,
    private discontinuedFlag: boolean,
    private positionValue: number,
    private priceCentsValue: number | null,
    private weightGramsValue: number | null,
    private readonly allergensValue: readonly string[] | null,
    private readonly nutritionValue: VariantNutritionSnapshot | null,
  ) {}

  /** La déclinaison née avec son produit : par défaut, en tête, sans tarif. */
  static openDefault(input: { id: string; sku: Sku; name: LocalizedText }): Variant {
    return new Variant(
      input.id,
      input.sku.value,
      input.name,
      {},
      true,
      false,
      0,
      null,
      null,
      null,
      null,
    );
  }

  static reconstitute(snapshot: VariantSnapshot): Variant {
    return new Variant(
      snapshot.id,
      snapshot.sku,
      snapshot.name,
      snapshot.options,
      snapshot.isDefault,
      snapshot.isDiscontinued,
      snapshot.position,
      snapshot.priceCents,
      snapshot.weightGrams,
      snapshot.allergens,
      snapshot.nutrition,
    );
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

  /** Tarif et poids en un geste : c'est ainsi que le back-office les saisit. */
  price(priceCents: number | null, weightGrams: number | null): void {
    this.priceCentsValue = requireCountOrNull("priceCents", priceCents);
    this.weightGramsValue = requireCountOrNull("weightGrams", weightGrams);
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
