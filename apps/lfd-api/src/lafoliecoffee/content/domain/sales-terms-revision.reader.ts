import type { SalesTermsDocument } from "@lfd/contracts";

/**
 * **La révision d'un texte de CGV** — ce que le dépôt d'un PDF annonce comme
 * version publiée (plan `plan-bloc-recurrent.md`, § 7, Q-B7). Port de
 * lecture étroit : le dépôt n'a besoin que de ce nombre.
 */
export abstract class SalesTermsRevisionReader {
  /** La révision en ligne du texte, `null` si personne ne l'a jamais écrit. */
  abstract revisionOf(document: SalesTermsDocument): Promise<number | null>;
}
