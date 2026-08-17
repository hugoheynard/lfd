import type { CatalogItem } from "../entities/catalog-item.js";

/**
 * Port d'**écriture** du catalogue. Séparé de la lecture (ISP) : le checkout lit
 * et n'écrit jamais ; l'ingestion et le back-office écrivent.
 *
 * Il ne prend **jamais** de primitives. Pas de `setPrice(sku, cents)`, pas de
 * `markHidden(sku)` : on charge l'agrégat, on le mute par une méthode métier, on
 * le rend. Sans cette règle, l'invariant « une décision survit au push »
 * retournerait dans l'adaptateur, où le prochain appelant ne le verrait pas.
 */
export abstract class CatalogItemRepository {
  /** Charge un article, décision comprise, ou `null` s'il n'est pas au catalogue. */
  abstract load(sku: string): Promise<CatalogItem | null>;

  /**
   * Charge **tout** le catalogue, agrégats compris.
   *
   * Une lecture en bloc, pas un raccourci d'écriture : l'ingestion a besoin des
   * décisions déjà prises pour les reporter sur les faits neufs, et les charger
   * un par un ferait 92 allers-retours pour la même réponse.
   */
  abstract loadAll(): Promise<CatalogItem[]>;

  /** Persiste l'état courant d'agrégats déjà chargés. */
  abstract saveMany(items: readonly CatalogItem[]): Promise<void>;

  /**
   * Retire des articles du catalogue.
   *
   * Prend des SKU et non des agrégats : retirer n'est pas muter un état, et
   * charger un agrégat pour le jeter n'apprendrait rien à personne. Leur
   * décision part avec eux — un prix négocié ne veut plus rien dire sans
   * l'article qu'il tarifait.
   */
  abstract removeMany(skus: readonly string[]): Promise<void>;
}
