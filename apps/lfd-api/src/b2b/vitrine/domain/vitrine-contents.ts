import { vitrineContents, type VitrineContent } from "@lfd/contracts";

import { VitrineContentUnknownError } from "./errors/vitrine-errors.js";

/**
 * **Ce qu'un abonné reçoit** — un sous-ensemble des quatre cases, rangé dans
 * l'ordre canonique et sans doublon. Une case ne fait que RETIRER de la vue
 * publique : aucune ne peut l'élargir (W1).
 */
export class VitrineContents {
  private constructor(private readonly set: ReadonlySet<VitrineContent>) {}

  /** @throws {VitrineContentUnknownError} une case inconnue (relue de la base, ou mal saisie). */
  static of(contents: readonly string[]): VitrineContents {
    const chosen = new Set<VitrineContent>();
    for (const content of contents) {
      const known = vitrineContents.find((candidate) => candidate === content);
      if (known === undefined) {
        throw new VitrineContentUnknownError(content);
      }
      chosen.add(known);
    }
    return new VitrineContents(chosen);
  }

  has(content: VitrineContent): boolean {
    return this.set.has(content);
  }

  /** Dans l'ordre canonique de `vitrineContents`. */
  list(): readonly VitrineContent[] {
    return vitrineContents.filter((content) => this.set.has(content));
  }
}
