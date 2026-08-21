import { findMapping } from "../../../../allergens/allergen-mapping.js";
import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

export class UnknownAllergenError extends DomainError {
  // Surtout PAS `code` : ce nom est déjà celui du code d'erreur lu par le filtre
  // HTTP. Le masquer ferait remonter « TBD_FISH » là où on attend
  // « catalogue.allergen.unknown ».
  constructor(readonly allergenCode: string) {
    super(
      "catalogue.allergen.unknown",
      `Code allergène inconnu du référentiel : « ${allergenCode} ».`,
    );
  }
}

export class OverlappingAllergensError extends DomainError {
  constructor(readonly codes: readonly string[]) {
    super(
      "catalogue.allergen.overlap",
      `Un allergène ne peut pas être à la fois présent et en trace : ${codes.join(", ")}.`,
    );
  }
}

export class NegativeNutritionValueError extends DomainError {
  constructor(readonly field: string) {
    super("catalogue.nutrition.negative", `La valeur « ${field} » ne peut pas être négative.`);
  }
}

export interface NutritionValues {
  readonly energyKcal?: number | undefined;
  readonly carbsG?: number | undefined;
  readonly fatG?: number | undefined;
  readonly proteinG?: number | undefined;
  readonly glycemicIndex?: number | undefined;
}

export interface NutritionDeclaration extends NutritionValues {
  /** `[]` = déclaration positive « aucun allergène », pas « non renseigné ». */
  readonly allergens: readonly string[];
  readonly mayContain: readonly string[];
}

/**
 * Construit une fiche **valide ou rien**.
 *
 * Sur un champ réglementé, la validation ne peut pas vivre dans un DTO HTTP : un
 * import ou un seed la contournerait. Elle est ici, sur le chemin unique.
 */
export function nutritionDeclaration(
  allergens: readonly string[],
  mayContain: readonly string[],
  values: NutritionValues,
): NutritionDeclaration {
  const present = dedupeAndValidate(allergens);
  const traces = dedupeAndValidate(mayContain);

  const overlap = present.filter((code) => traces.includes(code));
  if (overlap.length > 0) {
    throw new OverlappingAllergensError(overlap);
  }

  assertNonNegative("énergie", values.energyKcal);
  assertNonNegative("glucides", values.carbsG);
  assertNonNegative("lipides", values.fatG);
  assertNonNegative("protéines", values.proteinG);
  assertNonNegative("indice glycémique", values.glycemicIndex);

  return { allergens: present, mayContain: traces, ...values };
}

function dedupeAndValidate(codes: readonly string[]): string[] {
  const seen: string[] = [];
  for (const code of codes) {
    if (findMapping(code) === undefined) {
      throw new UnknownAllergenError(code);
    }
    if (!seen.includes(code)) {
      seen.push(code);
    }
  }
  return seen;
}

function assertNonNegative(field: string, value: number | undefined): void {
  if (value !== undefined && value < 0) {
    throw new NegativeNutritionValueError(field);
  }
}
