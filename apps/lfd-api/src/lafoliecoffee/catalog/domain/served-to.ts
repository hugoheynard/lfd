import type { ShopAudience } from "./ports/catalog.reader.js";
import { ResupplyOnlySoldError } from "./errors/resupply-only-sold.error.js";

/**
 * À qui un article se vend, tel que le référentiel le dit (C2 de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`). Une VALEUR
 * de donnée, recopiée du fait de la fiche.
 *
 * `resupply` : l'article ne se vend à personne, il se commande seulement en
 * réassort des boutiques (le cookie des formules ;
 * `documentation/reassort-boutiques/plan-articles-de-reassort.md`). Aucun
 * acheteur ne le demande : `servedTo` le refuse aux pros comme au public.
 *
 * Le commerce connaît une valeur avant que le référentiel puisse l'émettre :
 * `putOnSale` reçoit l'audience typée du fait de fiche, donc un référentiel
 * qui élargirait la sienne sans ce type ne compilerait plus.
 */
export type CatalogAudience = "pro" | "public" | "both" | "resupply";

/** L'audience d'un article servi à un acheteur : jamais `resupply`, que `servedTo` refuse. */
export type SoldAudience = Exclude<CatalogAudience, "resupply">;

const AUDIENCES: readonly CatalogAudience[] = ["pro", "public", "both", "resupply"];

/**
 * Ce que `servedTo` lit d'un article — la colonne d'audience, les deux
 * masquages, et l'attente de validation pour la boutique publique.
 */
export interface ServableItem {
  /** `null` = jamais reçue par un fait, lue `both` : ce que fait tout article avant l'audience. */
  readonly audience: CatalogAudience | null;
  readonly isHidden: boolean;
  readonly isHiddenPublic: boolean;
  /**
   * Personne n'a encore regardé l'article pour la boutique publique (lot 3).
   * Ne retire qu'au public : les pros le voient dès son arrivée.
   */
  readonly publicReviewPending: boolean;
  /** Personne ne l'a encore validé pour les pros (Hugo, 2026-10-15, option 2). */
  readonly proReviewPending: boolean;
  /**
   * Réservé à au moins une société (`plan-articles-sur-mesure.md`, S3) : jamais
   * servi au public. Chez les pros, c'est `servedToViewer` qui décide qui y a droit.
   */
  readonly isReserved: boolean;
  /**
   * Une fiche **sur mesure** (fait du référentiel, § 13 D1) : jamais servie au
   * public (S3). ~~Ouvert à tous les pros (S4)~~ — S4 est remplacée par D3 le
   * 2026-11-02 : sans réservation, aucun pro ne la voit. D3 se juge dans
   * `servedToViewer`, pas ici (13.6, bloquant 1) : les lecteurs internes qui
   * appellent `servedTo(item, "pro")` (fournil, heure limite, bacs, saisie
   * staff…) doivent continuer de la voir.
   */
  readonly isCustomRecipe: boolean;
}

/**
 * **L'article est-il servi à ce lecteur ?** — la règle unique du masquage
 * (2a5, D3 du plan d'audience).
 *
 * Deux conditions, et les deux sont nécessaires : l'audience de l'article
 * contient celle du lecteur (décision de GAMME, prise au référentiel), ET la
 * plateforme ne l'a pas masqué pour lui (décision LOCALE, temporaire) — et,
 * quelqu'un l'a validé pour cette audience (lot 3). Le
 * masquage ne fait donc que retirer : montrer aux pros un article que le
 * référentiel dit `public` est impossible depuis la plateforme (H5).
 *
 * 🔴 Elle remplace cinq lectures directes du masquage — le rayon, la fiche
 * et le lot de SKU (donc la commande), l'éditeur de vitrine, le résumé « en
 * vente », l'export. Une seule écriture, sans quoi un jour l'un des cinq
 * vendrait ce que les autres cachent. Depuis le L1b des articles sur mesure
 * (2026-10-30), elle porte aussi S3 : un article réservé ou sur mesure n'est
 * jamais servi au public, quelle que soit son audience. La réservation chez
 * les pros se juge par-dessus, dans `servedToViewer`.
 */
export function servedTo(item: ServableItem, viewer: ShopAudience): boolean {
  const audience = item.audience ?? "both";
  if (!audienceIncludes(audience, viewer)) {
    return false;
  }
  return viewer === "pro"
    ? !item.isHidden && !item.proReviewPending
    : !item.isHiddenPublic && !item.publicReviewPending && !item.isReserved && !item.isCustomRecipe;
}

/**
 * **L'article se commande-t-il en réassort des boutiques ?** — servi au public
 * (la vitrine se réassortit), ou réservé au réassort, non masqué.
 *
 * Un article `resupply` n'attend aucune validation : il n'est montré à aucun
 * client. Réservé à une société ou sur mesure, il reste refusé, comme au
 * public.
 */
export function servedToResupply(item: ServableItem): boolean {
  if (servedTo(item, "public")) {
    return true;
  }
  return (
    item.audience === "resupply" &&
    !item.isHidden &&
    !item.isHiddenPublic &&
    !item.isReserved &&
    !item.isCustomRecipe
  );
}

/** L'audience (`null` lu `both`) contient-elle ce lecteur ? */
export function audienceIncludes(audience: CatalogAudience | null, viewer: ShopAudience): boolean {
  const effective = audience ?? "both";
  return effective === "both" || effective === viewer;
}

/**
 * L'article est-il servi à **tout le monde d'une audience** — un particulier,
 * ou tous les pros ?
 *
 * 🔴 Ses lecteurs (l'éditeur de vitrine, les ventes d'opération) servent des
 * pages publiques : la branche pro ne dit donc « oui » que pour un article ni
 * réservé ni sur mesure (S3, `plan-articles-sur-mesure.md`). Un article servi
 * à quelques pros seulement n'est pas « servi à quelqu'un » au sens de la
 * vitrine.
 */
export function servedToAnyone(item: ServableItem): boolean {
  return (
    servedTo(item, "public") || (servedTo(item, "pro") && !item.isReserved && !item.isCustomRecipe)
  );
}

/**
 * La colonne relue. Une valeur inconnue se lit `null` — donc `both`, ce que
 * faisait l'article avant l'audience — plutôt que de lever sur une lecture de
 * rayon : le `CHECK` en base la refuse déjà à l'écriture.
 */
export function catalogAudienceOf(raw: string | null): CatalogAudience | null {
  return AUDIENCES.find((candidate) => candidate === raw) ?? null;
}

/**
 * L'audience d'un article **servi à un acheteur** (`null` lu `both`).
 *
 * @throws {ResupplyOnlySoldError} l'article est réservé au réassort : aucune
 *   lecture d'acheteur ne devait le rendre.
 */
export function soldAudienceOf(sku: string, raw: string | null): SoldAudience {
  const audience = catalogAudienceOf(raw) ?? "both";
  if (audience === "resupply") {
    throw new ResupplyOnlySoldError(sku);
  }
  return audience;
}
