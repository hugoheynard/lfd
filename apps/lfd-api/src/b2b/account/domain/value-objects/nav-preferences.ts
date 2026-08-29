/**
 * Préférences de **navigation/affichage** d'une personne — état purement UI,
 * persisté pour suivre le client d'un appareil à l'autre. Un sac extensible :
 * aujourd'hui la vue du catalogue, demain d'autres réglages, sans migration.
 *
 * Ici, pas d'invariant métier : ces valeurs ne protègent rien. On ne fait que
 * garantir la **forme** en relecture (une vue inconnue retombe sur « aucun
 * choix »), pour ne jamais renvoyer au front une valeur qu'il ne saurait lire.
 */

/**
 * La forme vient des CONTRATS — elle était écrite trois fois : ici, dans les
 * contrats, et dans `legacy/catalogue` côté boutique. Trois listes de trois
 * mots à tenir d'accord, dont le commentaire d'origine disait déjà qu'elle
 * était « miroir de l'union front ». Un miroir qu'on entretient à la main
 * finit par renvoyer autre chose.
 *
 * Ce fichier garde ce qui lui appartient VRAIMENT : la garde de type et la
 * relecture défensive de la colonne JSON. Ça, c'est du comportement, et le
 * comportement ne descend pas dans un paquet de types.
 */
import type { CatalogueView, NavPreferences } from "@lfd/contracts";

export type { CatalogueView, NavPreferences };

const CATALOGUE_VIEWS: readonly CatalogueView[] = ["cards", "shelves", "list"];

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
