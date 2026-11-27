/**
 * Port d'**écriture** de la liste d'envies. Aucune règle ne peut refuser un
 * article, sauf le mur de la société, tenu avant : un CRUD honnête
 * (CLAUDE.md § 3.1), et les deux gestes sont idempotents par construction.
 */
export abstract class WishlistWriter {
  /** Ajoute l'article ; déjà là, rien ne change (ni sa date). */
  abstract add(userId: string, companyId: string, sku: string, at: Date): Promise<void>;

  /** Retire l'article ; absent, rien ne change. */
  abstract remove(userId: string, companyId: string, sku: string): Promise<void>;
}
