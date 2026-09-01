import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

export class UnknownAllergenError extends DomainError {
  // Surtout PAS `code` : ce nom est déjà celui du code d'erreur lu par le filtre
  // HTTP. Le masquer ferait remonter « AF » là où on attend
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

export class NutritionPartExceedsWholeError extends DomainError {
  constructor(
    readonly part: string,
    readonly whole: string,
  ) {
    super(
      "catalogue.nutrition.part_exceeds_whole",
      `« ${part} » ne peut pas dépasser « ${whole} » : c'en est une part.`,
    );
  }
}

export class NegativeNutritionValueError extends DomainError {
  constructor(readonly field: string) {
    super("catalogue.nutrition.negative", `La valeur « ${field} » ne peut pas être négative.`);
  }
}

/**
 * Les valeurs pour 100 g, dans l'ordre de l'annexe XV (UE 1169/2011).
 *
 * `saturatedFatG` et `sugarsG` sont des **parts** : « dont acides gras saturés »
 * ne peut pas dépasser les matières grasses, ni « dont sucres » les glucides.
 */
export interface NutritionValues {
  readonly energyKcal?: number | undefined;
  readonly fatG?: number | undefined;
  readonly saturatedFatG?: number | undefined;
  readonly carbsG?: number | undefined;
  readonly sugarsG?: number | undefined;
  readonly proteinG?: number | undefined;
  readonly saltG?: number | undefined;
  /** Hors annexe XV — un renseignement produit, pas une mention obligatoire. */
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
 *
 * @param knownCodes les codes que le référentiel reconnaît, **reçus** et jamais
 *   cherchés (D3). Le référentiel vit en base depuis qu'il est administrable ;
 *   aller l'y lire rendrait cette fabrique asynchrone et dépendante de Prisma,
 *   c'est-à-dire ni pure ni éprouvable sans Nest. Le handler le charge une fois
 *   et le passe. Les entrées **archivées en font partie** (D2 bis) : relire une
 *   fiche enregistrée hier ne doit pas la déclarer invalide parce que le staff a
 *   retiré un code depuis — refuser l'AJOUT d'un code archivé est une règle du
 *   handler, qui seul sait ce que la fiche déclarait déjà.
 */
export function nutritionDeclaration(
  allergens: readonly string[],
  mayContain: readonly string[],
  values: NutritionValues,
  knownCodes: ReadonlySet<string>,
): NutritionDeclaration {
  // `may_contain` suit exactement le même référentiel et la même garde : une
  // trace est un allergène, déclaré à un autre titre.
  const present = dedupeAndValidate(allergens, knownCodes);
  const traces = dedupeAndValidate(mayContain, knownCodes);

  const overlap = present.filter((code) => traces.includes(code));
  if (overlap.length > 0) {
    throw new OverlappingAllergensError(overlap);
  }

  assertNonNegative("énergie", values.energyKcal);
  assertNonNegative("matières grasses", values.fatG);
  assertNonNegative("acides gras saturés", values.saturatedFatG);
  assertNonNegative("glucides", values.carbsG);
  assertNonNegative("sucres", values.sugarsG);
  assertNonNegative("protéines", values.proteinG);
  assertNonNegative("sel", values.saltG);
  assertNonNegative("indice glycémique", values.glycemicIndex);

  // « dont » est une part, pas une ligne de plus. Un tableau où les saturés
  // dépassent les matières grasses n'est pas discutable, il est impossible — et
  // il s'imprimerait tel quel.
  assertPartOfWhole("acides gras saturés", values.saturatedFatG, "matières grasses", values.fatG);
  assertPartOfWhole("sucres", values.sugarsG, "glucides", values.carbsG);

  return { allergens: present, mayContain: traces, ...values };
}

function dedupeAndValidate(codes: readonly string[], knownCodes: ReadonlySet<string>): string[] {
  const seen: string[] = [];
  for (const code of codes) {
    if (!knownCodes.has(code)) {
      throw new UnknownAllergenError(code);
    }
    if (!seen.includes(code)) {
      seen.push(code);
    }
  }
  return seen;
}

function assertPartOfWhole(
  part: string,
  partValue: number | undefined,
  whole: string,
  wholeValue: number | undefined,
): void {
  // Un tout NON RENSEIGNÉ ne contredit rien : on ne connaît pas encore la
  // borne. C'est « 12 g de sucres pour 4 g de glucides » qu'on refuse, pas une
  // fiche à moitié remplie.
  if (partValue !== undefined && wholeValue !== undefined && partValue > wholeValue) {
    throw new NutritionPartExceedsWholeError(part, whole);
  }
}

function assertNonNegative(field: string, value: number | undefined): void {
  if (value !== undefined && value < 0) {
    throw new NegativeNutritionValueError(field);
  }
}
