import { ttcCentsFromHtMillicents } from "@lfd/money";

/**
 * **Le prix professionnel** — toujours saisi.
 *
 * Depuis le lot R3 de `documentation/pricing/plan-retirer-le-rapport-pro.md`
 * (2026-10-27), le prix pro HT se saisit par déclinaison et c'est sa seule
 * source. Le rapport prix pro / prix public (`ratio_ttc`), ses deux méthodes,
 * son réglage et sa suggestion sont retirés : ils induisaient en erreur à côté
 * de la saisie (Hugo, 2026-10-27).
 *
 * Les faits passés du journal qui parlent du rapport restent lisibles : leur
 * liste de valeurs vit dans `@lfd/contracts`
 * (`journal-facts/referential-settings.ts`), pas ici.
 */

/**
 * Un prix professionnel, dans les **deux** unités que la chaîne demande.
 *
 * Le HT saisi fait foi ; le TTC en est la conséquence, et sert à l'affichage.
 */
export interface ProPrice {
  /**
   * Ce qu'un professionnel paie, taxe comprise — un **affichage** : personne
   * ne redérive un HT de ce TTC (il perdrait les décimales saisies).
   */
  readonly ttcCents: number;
  /** Ce qui part sur le fil et que multiplie une quantité (10⁻⁵ €). */
  readonly htMillicents: number;
}

/**
 * **Le prix professionnel — l'unique porte.**
 *
 * Gardée comme porte alors qu'elle ne fait plus qu'une chose : ses appelants
 * — `catalog-facts.ts` (le fil), `variant-completeness.ts` (la complétude),
 * la fiche du back-office (`product-form-store.ts`) — doivent rendre le MÊME
 * prix, au centime d'arrondi du TTC près (vérifié le 2026-10-27).
 *
 * `null` **sans taux d'article** : le taux sert à FACTURER, et un article sans
 * taux est écarté du canal (`variant_sans_taux`) — inventer un taux facturerait
 * un montant que personne n'a décidé. `null` aussi **sans saisie** : un prix
 * pro absent n'est ni le prix public, ni zéro.
 */
export function proPriceOf(
  articleVatPercent: number | null,
  enteredHtMillicents: number | null,
): ProPrice | null {
  if (articleVatPercent === null || enteredHtMillicents === null) {
    return null;
  }
  return {
    ttcCents: ttcCentsFromHtMillicents(enteredHtMillicents, articleVatPercent),
    htMillicents: enteredHtMillicents,
  };
}
