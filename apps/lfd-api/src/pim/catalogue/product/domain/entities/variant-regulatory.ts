import { DormantSheetWouldWakeError } from "../errors/variant-lifecycle-errors.js";
import type { AllergenDeclaration } from "../value-objects/nutrition-declaration.js";
import type {
  VariantAllergenSheetSnapshot,
  VariantNutritionSnapshot,
  VariantNutritionValues,
  VariantSnapshot,
} from "./variant-snapshot.js";

/** Les deux moitiés de la fiche réglementaire qu'une déclinaison peut suivre. */
export type RegulatoryHalf = "regulatory" | "nutrition";

/**
 * **La fiche réglementaire d'une déclinaison** — ses allergènes (traces
 * comprises : une trace EST un allergène) et ses valeurs nutritionnelles, deux
 * moitiés qui s'enregistrent et s'héritent séparément, avec le drapeau « suit
 * le défaut » de chacune.
 *
 * `null` = personne ne s'est prononcé ; `declared: []` = « aucun allergène »,
 * une affirmation. Un value object immuable : chaque geste rend le nouvel état.
 *
 * Le geste ne touche **que le drapeau** quand on (dés)aligne : la fiche propre,
 * si elle existait, reste en place et dort. S'aligner puis se désaligner rend
 * ce qu'on avait écrit plutôt que de le détruire — effacer aurait fait d'une
 * case à cocher une suppression de donnée réglementaire.
 *
 * La validation d'une déclaration n'est PAS ici : elle demande le référentiel
 * des allergènes, qui vit en base. Le domaine reçoit une déclaration déjà
 * construite par `allergenDeclaration()` — valide ou rien. Et l'écriture reste
 * aux ports dédiés (un par table) : un renommage ou une publication ne doit
 * pas pouvoir écraser une déclaration faite entre temps.
 */
export class VariantRegulatory {
  private constructor(
    readonly allergenSheet: VariantAllergenSheetSnapshot | null,
    readonly nutrition: VariantNutritionSnapshot | null,
    /** Suit les allergènes du défaut. Toujours `false` sur le défaut. */
    readonly followsAllergens: boolean,
    /** Suit les valeurs du défaut. Toujours `false` sur le défaut. */
    readonly followsNutrition: boolean,
  ) {}

  static fromSnapshot(snapshot: VariantSnapshot): VariantRegulatory {
    return new VariantRegulatory(
      snapshot.allergenSheet,
      snapshot.nutrition,
      snapshot.regulatoryFollowsDefault,
      snapshot.nutritionFollowsDefault,
    );
  }

  /**
   * **Déclare-t-elle SES allergènes ?** — et rien d'autre. `[]` compte comme
   * déclaré (une affirmation positive), `null` est un silence : c'est le seul
   * fait que l'invariant 7 regarde. Les valeurs nutritionnelles n'y comptent
   * pas : le règlement (UE) n° 1169/2011 les exempte (art. 44 §1, annexe V
   * pt 19), les allergènes sont obligatoires (art. 9 §1 c).
   *
   * Ne répond que pour ELLE : une alignée n'en porte aucune, et c'est la
   * fiche — seule à voir le défaut — qui décide si elle est couverte.
   */
  get declaresOwnAllergens(): boolean {
    return this.allergenSheet !== null;
  }

  follows(half: RegulatoryHalf): boolean {
    return half === "nutrition" ? this.followsNutrition : this.followsAllergens;
  }

  /** S'aligne sur le défaut pour CETTE moitié, ou reprend la sienne. */
  align(half: RegulatoryHalf, aligned: boolean): VariantRegulatory {
    return half === "nutrition"
      ? new VariantRegulatory(this.allergenSheet, this.nutrition, this.followsAllergens, aligned)
      : new VariantRegulatory(this.allergenSheet, this.nutrition, aligned, this.followsNutrition);
  }

  /**
   * **La moitié « sécurité » seule** — ce que la déclinaison contient, et ses
   * traces. Les valeurs ne bougent pas : enregistrer l'une ne peut pas
   * fabriquer ni effacer l'autre (oublier les allergènes reviendrait à
   * affirmer « aucun »).
   */
  declareAllergens(declaration: AllergenDeclaration): VariantRegulatory {
    return new VariantRegulatory(
      { declared: declaration.allergens, mayContain: declaration.mayContain },
      this.nutrition,
      this.followsAllergens,
      this.followsNutrition,
    );
  }

  /** **La moitié « valeurs » seule.** Les allergènes, y compris `null`, restent ce qu'ils étaient. */
  declareNutritionValues(values: VariantNutritionValues): VariantRegulatory {
    return new VariantRegulatory(
      this.allergenSheet,
      values,
      this.followsAllergens,
      this.followsNutrition,
    );
  }

  /**
   * Devient celle du défaut : elle ne peut plus se suivre elle-même, donc
   * chaque moitié qu'elle suivait passe en PROPRE avec la valeur qu'elle
   * voyait (`resolved`, résolu AVANT la bascule). Ce qu'elle ne suivait pas
   * reste tel quel.
   *
   * @throws {DormantSheetWouldWakeError} elle suit une moitié que le défaut n'a
   *   jamais déclarée, et en garde une ancienne à elle : la recevoir « vide »
   *   demanderait d'effacer cette saisie, et la garder la réveillerait.
   */
  promote(sku: string, resolved: VariantSnapshot): VariantRegulatory {
    refuseDormantWake(
      sku,
      "allergens",
      this.followsAllergens,
      resolved.allergenSheet,
      this.allergenSheet,
    );
    refuseDormantWake(sku, "nutrition", this.followsNutrition, resolved.nutrition, this.nutrition);
    return new VariantRegulatory(
      this.followsAllergens ? resolved.allergenSheet : this.allergenSheet,
      this.followsNutrition ? resolved.nutrition : this.nutrition,
      false,
      false,
    );
  }
}

function refuseDormantWake(
  sku: string,
  half: "allergens" | "nutrition",
  follows: boolean,
  seen: object | null,
  own: object | null,
): void {
  if (follows && seen === null && own !== null) {
    throw new DormantSheetWouldWakeError(sku, half);
  }
}
