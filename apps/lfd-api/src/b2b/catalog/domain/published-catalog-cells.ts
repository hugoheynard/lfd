import type { ShopAudience } from "./ports/catalog.reader.js";
import { audienceIncludes, type CatalogAudience } from "./served-to.js";

/**
 * L'état d'une déclinaison pour une audience, dans la vue « Catalogue
 * publié » (lot 3 de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`,
 * §7 de `catalogue-synchronise.md`). Des VALEURS de donnée.
 */
export type PublishedCellState =
  "inactif" | "en_vente" | "masque" | "pas_vendu" | "en_attente_validation" | "incomplet";

/** L'article tel que la plateforme le range, quand elle en a une ligne en vente. */
export interface PublishedArticle {
  readonly isHidden: boolean;
  readonly isHiddenPublic: boolean;
  /** En attente de validation, par audience (lot 3). */
  readonly reviewPending: Readonly<Record<ShopAudience, boolean>>;
  /** A-t-il de quoi être facturé à cette audience (taux pro ; étiquette publique) ? */
  readonly billableTo: Readonly<Record<ShopAudience, boolean>>;
}

/** Ce que la cellule lit : la fiche, ses manques pour ce SKU, et l'article s'il est en vente. */
export interface PublishedCellInput {
  readonly entryActive: boolean;
  readonly audience: CatalogAudience;
  readonly hasGaps: boolean;
  readonly article: PublishedArticle | null;
}

/**
 * **L'état d'une cellule**, une règle et un ordre :
 *
 * 1. l'audience d'abord — un article que le référentiel ne vend pas à ce
 *    lecteur n'est ni masqué ni incomplet pour lui, il n'est pas vendu ;
 * 2. une fiche inactive ou archivée : inactif, manques compris — l'activer
 *    est le geste qui vient d'abord ;
 * 3. les manques — ce qui n'est pas complet ne se vend pas (C1) ; puis, fiche
 *    active sans ligne en vente (fait pas encore appliqué) : pas vendu ;
 * 4. sans taux pro ou sans étiquette publique : incomplet pour cette audience ;
 * 5. en attente de validation pour cette audience ;
 * 6. le masquage ;
 * 7. sinon, en vente.
 *
 * L'attente passe AVANT le masquage : un article masqué ET jamais validé doit
 * paraître dans la liste à valider, sans quoi le démasquer ne le montrerait
 * pas, et personne ne saurait pourquoi.
 */
export function publishedCellOf(
  viewer: ShopAudience,
  input: PublishedCellInput,
): PublishedCellState {
  if (!audienceIncludes(input.audience, viewer)) {
    return "pas_vendu";
  }
  if (!input.entryActive) {
    return "inactif";
  }
  if (input.hasGaps) {
    return "incomplet";
  }
  const { article } = input;
  if (article === null) {
    return "pas_vendu";
  }
  if (!article.billableTo[viewer]) {
    return "incomplet";
  }
  if (article.reviewPending[viewer]) {
    return "en_attente_validation";
  }
  const masked = viewer === "pro" ? article.isHidden : article.isHiddenPublic;
  return masked ? "masque" : "en_vente";
}
