/** Ce qui compte pour un site : sa carte propre, la carte commune, ou aucune. */
export type SiteMenuStanding = "none" | "common" | "own";

/**
 * **Ce qui compte pour un site** (`carte-des-sites.md`, § 6.1) : sa carte
 * propre si elle est active, sinon la carte commune, sinon aucune. Écrit sur
 * ce qui est posé, comme l'écran le règle ; que le principal soit actif, le
 * rayon le dit (`menuReadingOf`).
 */
export function siteMenuStandingOf(
  own: { readonly state: string } | null,
  hasCommon: boolean,
): SiteMenuStanding {
  if (own !== null && own.state === "own") {
    return "own";
  }
  return hasCommon ? "common" : "none";
}
