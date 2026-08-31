import type { LocalizedText } from "@lfd/pim-contracts";

import { cleanKey, cleanRequiredText } from "../value-objects/reference-text.js";

/** Ce qu'une révision remplace — tout ce qui est réglable, d'un bloc. */
export interface AppellationRevision {
  readonly label: LocalizedText;
  readonly scheme: string;
  readonly active: boolean;
}

/**
 * Ce qu'un geste de réglage porte : chaque champ **absent ou indéfini** vaut
 * « ne touche pas à ça ».
 *
 * Écrit à la main plutôt que `Partial<AppellationRevision>` : sous
 * `exactOptionalPropertyTypes`, un `Partial` refuse la valeur `undefined`
 * explicite — or c'est exactement ce qu'un contrôleur transmet quand le champ
 * n'a pas été envoyé.
 */
export interface AppellationPatch {
  readonly label?: LocalizedText | undefined;
  readonly scheme?: string | undefined;
  readonly active?: boolean | undefined;
}

export interface NewAppellationInput extends AppellationRevision {
  readonly id: string;
  readonly code: string;
}

/** L'état d'une appellation, tel qu'il part en base. */
export interface AppellationSnapshot extends AppellationRevision {
  readonly id: string;
  readonly code: string;
}

/**
 * **Une appellation — l'agrégat.**
 *
 * Ce qu'il garantit, et qu'un formulaire ne peut pas :
 *
 * - **le code est une identité**, pas un libellé. Les ingrédients le citent par
 *   clé étrangère ; il a une forme, et il ne change jamais ;
 * - **le libellé existe au moins dans la langue source**. Une appellation sans
 *   nom lisible produirait un badge vide — c'est-à-dire une affirmation
 *   réglementée que personne ne peut lire.
 *
 * Ce qu'il ne peut pas voir, et qui reste au handler : qu'aucune AUTRE
 * appellation ne porte ce code, et que rien ne la cite au moment de l'effacer.
 */
export class AppellationAggregate {
  private constructor(
    private readonly identity: string,
    private readonly codeValue: string,
    private labelValue: LocalizedText,
    private schemeValue: string,
    private activeValue: boolean,
  ) {}

  /** Ouvre une appellation — le code est nettoyé puis validé, une fois pour toutes. */
  static open(input: NewAppellationInput): AppellationAggregate {
    return new AppellationAggregate(
      input.id,
      cleanKey("l'appellation", input.code),
      cleanRequiredText("l'appellation", input.label),
      input.scheme.trim(),
      input.active,
    );
  }

  /** Reprend une appellation existante — sans re-valider ce que la base tient déjà. */
  static rehydrate(snapshot: AppellationSnapshot): AppellationAggregate {
    return new AppellationAggregate(
      snapshot.id,
      snapshot.code,
      snapshot.label,
      snapshot.scheme,
      snapshot.active,
    );
  }

  /** Règle ce qui est réglable. Le code n'y figure pas — c'est une identité. */
  revise(patch: AppellationPatch): void {
    if (patch.label !== undefined) {
      this.labelValue = cleanRequiredText("l'appellation", patch.label);
    }
    if (patch.scheme !== undefined) {
      this.schemeValue = patch.scheme.trim();
    }
    if (patch.active !== undefined) {
      this.activeValue = patch.active;
    }
  }

  snapshot(): AppellationSnapshot {
    return {
      id: this.identity,
      code: this.codeValue,
      label: this.labelValue,
      scheme: this.schemeValue,
      active: this.activeValue,
    };
  }
}
