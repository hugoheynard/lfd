import type { LocalizedText } from "@lfd/pim-contracts";

import { cleanKey, cleanOptionalText, cleanRequiredText } from "../value-objects/reference-text.js";

/** Ce qu'une révision remplace — tout ce qui est réglable, d'un bloc. */
export interface IngredientRevision {
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly origin: string;
  /** L'identifiant technique de l'appellation citée, ou `null`. */
  readonly appellationId: string | null;
}

/**
 * Ce qu'un geste de réglage porte. Même raison qu'ailleurs de ne pas employer
 * `Partial` : sous `exactOptionalPropertyTypes`, il refuserait le `undefined`
 * explicite qu'un contrôleur transmet pour « champ non envoyé ».
 *
 * `appellationId` distingue trois états, et c'est le point : `undefined` = ne
 * touche pas, `null` = retire le signe, une chaîne = pose celui-là.
 */
export interface IngredientPatch {
  readonly name?: LocalizedText | undefined;
  readonly description?: LocalizedText | null | undefined;
  readonly origin?: string | undefined;
  readonly appellationId?: string | null | undefined;
}

export interface NewIngredientInput extends IngredientRevision {
  readonly id: string;
  readonly key: string;
}

export interface IngredientSnapshot extends IngredientRevision {
  readonly id: string;
  readonly key: string;
  /**
   * Les codes d'allergènes que la matière contient — un ENSEMBLE, dédupliqué et
   * rangé par l'agrégat.
   */
  readonly allergens: readonly string[];
}

/**
 * **Un ingrédient — l'agrégat.**
 *
 * Il porte une PROVENANCE, pas une recette : ce que la fiche revendique sur
 * l'origine de ce qu'il y a dedans. La liste réglementaire au sens du règlement
 * 1169/2011 — ordonnée par masse, avec quantités — appartient à la déclinaison
 * (`NutritionDeclaration`), et rien ici ne doit servir à la reconstituer.
 *
 * Ce qu'il garantit : la clé est une identité de forme stable, le nom existe au
 * moins en langue source, et une description vidée devient une absence plutôt
 * qu'un objet de chaînes vides.
 *
 * Ce qu'il ne peut pas voir, et qui reste au handler : qu'aucun AUTRE
 * ingrédient ne porte cette clé, que l'appellation citée existe, que les codes
 * d'allergènes qu'il porte sont au référentiel, et qu'aucune fiche ne le cite au
 * moment de l'effacer.
 */
export class IngredientAggregate {
  private constructor(
    private readonly identity: string,
    private readonly keyValue: string,
    private nameValue: LocalizedText,
    private descriptionValue: LocalizedText | null,
    private originValue: string,
    private appellationValue: string | null,
    private allergenValues: readonly string[],
  ) {}

  static declare(input: NewIngredientInput): IngredientAggregate {
    return new IngredientAggregate(
      input.id,
      cleanKey("l'ingrédient", input.key),
      cleanRequiredText("l'ingrédient", input.name),
      cleanOptionalText(input.description),
      input.origin.trim(),
      input.appellationId,
      // Une matière déclarée ne prétend rien contenir tant que personne ne l'a
      // dit : les allergènes se posent par leur propre verbe, à l'écran comme
      // ici. Et cette liste vide n'affirme RIEN — cf. `declareAllergens`.
      [],
    );
  }

  static rehydrate(snapshot: IngredientSnapshot): IngredientAggregate {
    return new IngredientAggregate(
      snapshot.id,
      snapshot.key,
      snapshot.name,
      snapshot.description,
      snapshot.origin,
      snapshot.appellationId,
      distinctCodes(snapshot.allergens),
    );
  }

  /**
   * Règle ce qui est réglable. La clé n'y figure pas — c'est une identité.
   *
   * `appellationId` accepte `null` comme VALEUR (« retirer le signe ») et
   * `undefined` comme absence (« ne touche pas à ça »). Les confondre rendrait
   * impossible de retirer une appellation posée par erreur.
   */
  revise(patch: IngredientPatch): void {
    if (patch.name !== undefined) {
      this.nameValue = cleanRequiredText("l'ingrédient", patch.name);
    }
    if (patch.description !== undefined) {
      this.descriptionValue = cleanOptionalText(patch.description);
    }
    if (patch.origin !== undefined) {
      this.originValue = patch.origin.trim();
    }
    if (patch.appellationId !== undefined) {
      this.appellationValue = patch.appellationId;
    }
  }

  /**
   * Pose ce que la matière **contient**, la liste entière.
   *
   * Un verbe à elle plutôt qu'un champ de `revise` : c'est une autre section de
   * l'écran, un autre fait au journal, et surtout une autre nature de donnée —
   * un ensemble, là où le reste de la révision est un formulaire de champs.
   *
   * Ce que l'agrégat garantit ici, et lui seul : **un ensemble**, sans doublon
   * et dans un ordre canonique. Un allergène cité deux fois est une redite, pas
   * deux faits, et l'ordre de saisie n'est porteur de rien — le rendre stable
   * évite qu'un simple réordonnancement à l'écran se lise comme un changement
   * dans le journal.
   *
   * Ce qu'il ne peut PAS voir, et qui reste au handler : que ces codes existent
   * au référentiel, et qu'aucun code archivé n'y entre à neuf (D2 bis). Le
   * référentiel vit en base ; le domaine ne le cherche pas, il le reçoit — comme
   * `nutritionDeclaration` reçoit `knownCodes()` (D3).
   *
   * ⚠️ `[]` n'affirme pas « sans allergène ». La déclaration d'une déclinaison
   * distingue `null` de `[]` parce qu'elle fait foi ; ici rien ne fait foi — la
   * liste d'ingrédients est éditoriale, et son silence ne renseigne sur rien
   * (D5).
   */
  declareAllergens(codes: readonly string[]): void {
    this.allergenValues = distinctCodes(codes);
  }

  snapshot(): IngredientSnapshot {
    return {
      id: this.identity,
      key: this.keyValue,
      name: this.nameValue,
      description: this.descriptionValue,
      origin: this.originValue,
      appellationId: this.appellationValue,
      allergens: this.allergenValues,
    };
  }
}

/**
 * L'ensemble canonique : sans doublon, rangé par code.
 *
 * Rangé et non « dans l'ordre reçu », à l'inverse de ce qu'une fiche cite comme
 * ingrédients : là-bas l'ordre est une décision éditoriale (« l'argument en
 * premier »), ici il n'en est pas une.
 */
function distinctCodes(codes: readonly string[]): readonly string[] {
  // Comparaison brute et non `localeCompare` : un code est une identité de
  // stockage, pas un texte à ranger pour un lecteur — l'ordre doit être le même
  // partout, quelle que soit la locale du processus.
  const distinct = [...new Set(codes)];
  distinct.sort((left, right) => {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  });
  return distinct;
}
