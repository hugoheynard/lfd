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
 * ingrédient ne porte cette clé, que l'appellation citée existe, et qu'aucune
 * fiche ne le cite au moment de l'effacer.
 */
export class IngredientAggregate {
  private constructor(
    private readonly identity: string,
    private readonly keyValue: string,
    private nameValue: LocalizedText,
    private descriptionValue: LocalizedText | null,
    private originValue: string,
    private appellationValue: string | null,
  ) {}

  static declare(input: NewIngredientInput): IngredientAggregate {
    return new IngredientAggregate(
      input.id,
      cleanKey("l'ingrédient", input.key),
      cleanRequiredText("l'ingrédient", input.name),
      cleanOptionalText(input.description),
      input.origin.trim(),
      input.appellationId,
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

  snapshot(): IngredientSnapshot {
    return {
      id: this.identity,
      key: this.keyValue,
      name: this.nameValue,
      description: this.descriptionValue,
      origin: this.originValue,
      appellationId: this.appellationValue,
    };
  }
}
