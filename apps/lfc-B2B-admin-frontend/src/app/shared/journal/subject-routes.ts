/**
 * **Où mène le sujet d'une ligne** — la fiche que l'écran a pour lui.
 *
 * Seuls les sujets qui ont une page de détail à eux y figurent ; les autres se
 * lisent en gras, sans lien. Un lien qui mènerait à une liste, ou à une page
 * qu'on ne sait pas ouvrir sur cet objet, promettrait ce qu'il ne tient pas.
 *
 * Les routes sont celles des fichiers `*.routes.ts` de l'app (vérifié le
 * 2026-09-19) ; une route renommée là doit l'être ici.
 */
const ROUTES: Readonly<Record<string, (id: string) => string | null>> = {
  product: (id) => `/pim/produits/${encodeURIComponent(id)}`,
  // `root` : le niveau racine d'un réordonnancement de familles n'est pas une
  // famille, il n'a pas de fiche (`reorder-categories.ts`, vérifié le 2026-09-19).
  product_category: (id) => (id === 'root' ? null : `/pim/categories/${encodeURIComponent(id)}`),
  company: (id) => `/comptes-clients/${encodeURIComponent(id)}`,
  pickup_address: (id) => `/b2b/reglages/points-de-retrait/${encodeURIComponent(id)}`,
  staff_role: (id) => `/admin/roles/${encodeURIComponent(id)}`,
  legal_entity: (id) => `/comptabilite/entites-juridiques/${encodeURIComponent(id)}`,
};

/** L'adresse de la fiche du sujet, ou `null` s'il n'en a pas. */
export function subjectRoute(subjectType: string, subjectId: string): string | null {
  const route = Object.hasOwn(ROUTES, subjectType) ? ROUTES[subjectType] : undefined;
  return route === undefined || subjectId === '' ? null : route(subjectId);
}
