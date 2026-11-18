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
  /** `null` = pas archivée. */
  readonly archivedAt: Date | null;
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
 * Elle ne se supprime pas (décision de Hugo du 2026-11-18) : elle s'archive,
 * et l'archive est **toujours permise** — les ingrédients qui la portent la
 * gardent, elle ne se pose plus sur un autre. Ce qu'il ne peut pas voir, et
 * qui reste au handler : qu'aucune AUTRE appellation ne porte ce code.
 */
export class AppellationAggregate {
  private constructor(
    private readonly identity: string,
    private readonly codeValue: string,
    private labelValue: LocalizedText,
    private schemeValue: string,
    private activeValue: boolean,
    private archivedAtValue: Date | null,
  ) {}

  /** Ouvre une appellation — le code est nettoyé puis validé, une fois pour toutes. */
  static open(input: NewAppellationInput): AppellationAggregate {
    return new AppellationAggregate(
      input.id,
      cleanKey("l'appellation", input.code),
      cleanRequiredText("l'appellation", input.label),
      input.scheme.trim(),
      input.active,
      null,
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
      snapshot.archivedAt,
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

  get isArchived(): boolean {
    return this.archivedAtValue !== null;
  }

  /** Archive l'appellation. `false` si elle l'était déjà — rien ne change. */
  archive(at: Date): boolean {
    if (this.archivedAtValue !== null) {
      return false;
    }
    this.archivedAtValue = at;
    return true;
  }

  /** La remet au référentiel. `false` si elle n'était pas archivée. */
  restore(): boolean {
    if (this.archivedAtValue === null) {
      return false;
    }
    this.archivedAtValue = null;
    return true;
  }

  snapshot(): AppellationSnapshot {
    return {
      id: this.identity,
      code: this.codeValue,
      label: this.labelValue,
      scheme: this.schemeValue,
      active: this.activeValue,
      archivedAt: this.archivedAtValue,
    };
  }
}
