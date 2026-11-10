import type { ShelfChangeScope } from "./shelf-change-scope.js";

/**
 * **Ce qu'une fenêtre de purge efface, une fois regroupée.**
 *
 * `all` absorbe tout : effacer tous les rayons efface aussi ceux de chaque
 * société. Sinon, l'ensemble des sociétés touchées, chacune une fois.
 */
export type ShelfPurgeOrder =
  { readonly kind: "all" } | { readonly kind: "companies"; readonly companyIds: readonly string[] };

/**
 * Le regroupement d'une fenêtre, pur : une rafale de changements donne UNE
 * purge (`le-rayon-en-cache.md` § 5 — une ingestion de 200 fiches en
 * déclencherait 200, et l'offre gratuite plafonne les purges).
 */
export class ShelfPurgeBatch {
  private everything = false;
  private readonly companies = new Set<string>();

  /** Ajoute un changement à la fenêtre. */
  add(scope: ShelfChangeScope): void {
    if (scope.kind === "all") {
      this.everything = true;
      this.companies.clear();
      return;
    }
    if (!this.everything) {
      this.companies.add(scope.companyId);
    }
  }

  /** Vrai tant qu'aucun changement n'a été ajouté. */
  isEmpty(): boolean {
    return !this.everything && this.companies.size === 0;
  }

  /** La purge que la fenêtre demande, ou `null` si elle est vide. */
  order(): ShelfPurgeOrder | null {
    if (this.everything) {
      return { kind: "all" };
    }
    if (this.companies.size === 0) {
      return null;
    }
    return { kind: "companies", companyIds: [...this.companies].sort() };
  }
}
