/**
 * Préférences de **navigation/affichage** d'une personne — état purement UI,
 * persisté pour suivre le client d'un appareil à l'autre. Un sac extensible :
 * aujourd'hui la vue du catalogue, demain d'autres réglages, sans migration.
 *
 * Ici, pas d'invariant métier : ces valeurs ne protègent rien. On ne fait que
 * garantir la **forme** en relecture (une vue inconnue retombe sur « aucun
 * choix »), pour ne jamais renvoyer au front une valeur qu'il ne saurait lire.
 */

/** Comment le client affiche le catalogue (miroir de l'union front). */
export type CatalogueView = "cards" | "shelves" | "list";

const CATALOGUE_VIEWS: readonly CatalogueView[] = ["cards", "shelves", "list"];

/** Le sac de préférences, tel que `GET /me` le renvoie. */
export interface NavPreferences {
  /** Vue choisie ; `null` = aucun choix explicite (le front applique son défaut). */
  readonly catalogueView: CatalogueView | null;
}

/** Aucune préférence encore posée. */
export const EMPTY_NAV_PREFERENCES: NavPreferences = { catalogueView: null };

/** Garde de type sur l'union des vues. */
export function isCatalogueView(value: unknown): value is CatalogueView {
  return typeof value === "string" && (CATALOGUE_VIEWS as readonly string[]).includes(value);
}

/**
 * Reconstruit des préférences **sûres** depuis la colonne JSON (type `unknown`
 * côté Prisma) : tout ce qui n'est pas une vue connue devient « aucun choix ».
 * Aucune exception — une donnée d'affichage corrompue ne doit pas casser `/me`.
 */
export function parseNavPreferences(value: unknown): NavPreferences {
  if (value === null || typeof value !== "object") {
    return EMPTY_NAV_PREFERENCES;
  }
  const view: unknown = (value as Record<string, unknown>)["catalogueView"];
  return { catalogueView: isCatalogueView(view) ? view : null };
}
