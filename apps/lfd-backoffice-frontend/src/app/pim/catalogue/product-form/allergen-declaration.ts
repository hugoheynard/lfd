/**
 * **Ce qu'une déclinaison déclare d'allergènes — un seul état, tri-état.**
 *
 * 🔴 L'écran portait un booléen `declaresNone` À CÔTÉ d'une liste `selected`,
 * et rien ne les tenait d'accord : à l'enregistrement le booléen gagnait en
 * jetant la liste. Deux champs qui décrivent le même fait finissent toujours
 * par se contredire, et celui-ci s'imprime sur une étiquette.
 *
 * Ici la contradiction n'est pas validée, elle est **inexprimable** — il n'y a
 * qu'un champ à lire (plan `plan-separer-allergenes-et-nutrition.md`, §5 et D6 :
 * « une donnée peut être fausse ; une structure, non »).
 *
 * Les traces vivent avec, et pas avec la nutrition : une trace EST un
 * allergène, déclaré à un autre titre. Elle suit le même référentiel et la même
 * garde de chevauchement côté serveur (`allergenDeclaration`), garde que ce
 * modèle rend inatteignable plutôt que de la subir en 400.
 */
export interface AllergenDeclaration {
  /**
   * `null` = **personne ne s'est prononcé** · `[]` = « aucun allergène »,
   * affirmation positive · liste = la déclaration.
   *
   * ⚠️ `[]` ne naît QUE d'un geste explicite ({@link withNoAllergen}) ou du
   * serveur. Décocher la dernière case rend `null` : vider une liste n'est pas
   * affirmer qu'il n'y a rien.
   */
  readonly allergens: readonly string[] | null;
  /** Les traces « peut contenir ». Toujours disjointes d'`allergens`. */
  readonly mayContain: readonly string[];
}

/** L'état d'une déclinaison dont la fiche n'a jamais été renseignée. */
export const NO_DECLARATION: AllergenDeclaration = { allergens: null, mayContain: [] };

/**
 * Une liste vidée par décochage retombe au **silence**, jamais à l'affirmation.
 *
 * `before` garde l'affirmation intacte : retirer un code d'une liste DÉJÀ vide
 * ne se produit pas, mais si ça arrivait, `[]` deviendrait `null` et « aucun
 * allergène » disparaîtrait sans que personne l'ait décoché.
 */
function presence(before: readonly string[], after: readonly string[]): readonly string[] | null {
  return after.length === 0 && before.length > 0 ? null : after;
}

function without(codes: readonly string[], code: string): readonly string[] {
  return codes.filter((entry) => entry !== code);
}

/** « Aucun allergène » est-il AFFIRMÉ ? Une liste vide, jamais une absence. */
export function declaresNone(declaration: AllergenDeclaration): boolean {
  return declaration.allergens !== null && declaration.allergens.length === 0;
}

/** Quelqu'un s'est-il prononcé ? C'est la seule question que la publication pose. */
export function hasDeclared(declaration: AllergenDeclaration): boolean {
  return declaration.allergens !== null;
}

/** Les codes cochés, pour un gabarit qui n'a pas à connaître le tri-état. */
export function selectedAllergens(declaration: AllergenDeclaration): readonly string[] {
  return declaration.allergens ?? [];
}

/**
 * Coche ou décoche un allergène **présent**.
 *
 * Le code quitte les traces au passage : présent et « peut contenir » sont
 * exclusifs, et le serveur refuse le chevauchement (`OverlappingAllergensError`).
 * Le retirer ici rend le refus impossible plutôt que de le traduire.
 */
export function withAllergen(
  declaration: AllergenDeclaration,
  code: string,
  on: boolean,
): AllergenDeclaration {
  const current = selectedAllergens(declaration);
  return {
    allergens: on ? [...without(current, code), code] : presence(current, without(current, code)),
    mayContain: on ? without(declaration.mayContain, code) : declaration.mayContain,
  };
}

/**
 * Remplace la liste des **traces**.
 *
 * Symétrique de {@link withAllergen} : un code qui devient une trace quitte la
 * présence. Et déclarer une trace ne dit RIEN de la présence — `allergens`
 * reste `null` si personne ne s'est prononcé, sans quoi ajouter une trace
 * affirmerait « aucun allergène ».
 */
export function withTraces(
  declaration: AllergenDeclaration,
  codes: readonly string[],
): AllergenDeclaration {
  const traces = [...new Set(codes)];
  const present = declaration.allergens;
  return {
    allergens:
      present === null
        ? null
        : presence(
            present,
            present.filter((code) => !traces.includes(code)),
          ),
    mayContain: traces,
  };
}

/**
 * Affirme — ou retire — « aucun allergène ».
 *
 * Décocher rend `null`, pas une liste vide : on retire l'affirmation, on n'en
 * pose pas une autre. Les traces survivent aux deux gestes : un produit qui ne
 * contient aucun allergène peut en porter par contamination d'atelier.
 */
export function withNoAllergen(declaration: AllergenDeclaration, on: boolean): AllergenDeclaration {
  return { allergens: on ? [] : null, mayContain: declaration.mayContain };
}

/**
 * Reprend dans la déclaration ce que la composition mentionne.
 *
 * Jamais de retrait : un allergène déclaré à la main (contamination croisée)
 * n'est pas démenti par une composition qui l'ignore. Un « aucun allergène »
 * qui traînait est levé au passage — c'est le geste qui le contredit.
 */
export function withCitedAdopted(
  declaration: AllergenDeclaration,
  codes: readonly string[],
): AllergenDeclaration {
  return codes.reduce((current, code) => withAllergen(current, code, true), declaration);
}
