/**
 * Le **genre** d'un point de vente.
 *
 * Deux valeurs, et l'union est fermée — c'est une propriété de STRUCTURE, pas
 * une donnée : le modèle sait ce qu'est une boutique (une adresse, une URL de
 * click & collect, éventuellement des tables) et ce qu'est une plateforme (ni
 * l'un ni l'autre). Ce qui est piloté par la donnée, c'est COMBIEN il y en a de
 * chaque, jamais quels genres existent.
 */
export type PointOfSaleKind = "shop" | "platform";

/**
 * **D'où l'on vend** — l'entité dont l'emplacement n'était qu'un cas.
 *
 * Elle manquait, et deux symptômes le disaient : `category_channel.location_id`
 * pouvait être `NULL` pour signifier « le B2B », et `sales_context.perLocation`
 * n'existait que pour distinguer ce cas. Un `NULL` porteur de sens est toujours
 * une ligne absente quelque part ; ici, la plateforme professionnelle.
 *
 * ⚠️ Tranche **p-0** : cette forme se LIT, elle ne s'écrit pas encore. Les
 * boutiques restent pilotées par l'écran des emplacements, qui tient ce miroir
 * dans la même transaction que sa source.
 */
export interface PointOfSale {
  readonly id: string;
  readonly kind: PointOfSaleKind;
  readonly label: string;
  /** Boutique seulement — `null` pour une plateforme, et la base le tient. */
  readonly baseUrl: string | null;
  /** Ce qu'il OFFRE, par clé de contexte. Distinct de ce qu'on y vend. */
  readonly contexts: readonly string[];
}
