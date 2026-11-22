import { DuplicateLinkableSubjectError } from "../../link/domain/errors/pay-link-errors.js";
import type { LinkableSubject } from "./linkable-subject.js";

/**
 * **Les implémenteurs de `LinkableSubject`, un par type de sujet** — le jeton
 * que `appBootstrap/` remplit ; `payment` le lit sans savoir qui l'a rempli.
 */
export abstract class LinkableSubjects {
  /** L'implémenteur de ce type, ou `null` : aucun bloc ne le rend payable par lien. */
  abstract forType(subjectType: string): LinkableSubject | null;
}

/** La forme que la racine de composition instancie : une liste, refusée sur un doublon. */
export class RegisteredLinkableSubjects extends LinkableSubjects {
  private readonly byType: ReadonlyMap<string, LinkableSubject>;

  /** @throws {DuplicateLinkableSubjectError} deux implémenteurs pour un type. */
  constructor(subjects: readonly LinkableSubject[]) {
    super();
    const byType = new Map<string, LinkableSubject>();
    for (const subject of subjects) {
      if (byType.has(subject.subjectType)) {
        throw new DuplicateLinkableSubjectError(subject.subjectType);
      }
      byType.set(subject.subjectType, subject);
    }
    this.byType = byType;
  }

  forType(subjectType: string): LinkableSubject | null {
    return this.byType.get(subjectType) ?? null;
  }
}
