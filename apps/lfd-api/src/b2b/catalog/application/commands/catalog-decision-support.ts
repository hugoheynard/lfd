import type { CatalogItem } from "../../domain/entities/catalog-item.js";
import { CatalogItemNotFoundError } from "../../domain/errors/catalog-not-found.error.js";
import type { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";

/**
 * Ce que partagent les quatre gestes du back-office sur un article
 * (`set-b2b-price`, `align-on-pim-price`, `set-catalog-visibility`,
 * `set-catalog-featured`).
 *
 * Les **intentions** portent le vocabulaire du commercial, pas celui de la
 * table : « poser un prix B2B », « revenir au tarif du PIM », « masquer ». Une
 * commande unique `UpdateCatalogItem(sku, patch)` aurait rendu le journal
 * illisible et forcé le handler à deviner l'intention depuis les champs
 * présents.
 *
 * Chaque handler fait **une** chose, et toujours le même cycle : charger
 * l'agrégat, appeler une méthode métier, le rendre au port. Aucun handler ne
 * connaît de colonne ; aucun ne décide d'un refus — les refus vivent dans
 * l'agrégat, où le prochain appelant les trouvera aussi.
 *
 * **Journalisés depuis le 2026-09-19** (plan `journalisation/
 * plan-journal-d-activite.md`, lot 1, tranche (b)) : un fait par geste, écrit
 * dans la même unité de travail que l'article — un journal en panne annule le
 * geste. L'auteur vient du contexte de requête, pas de `decidedBy`.
 *
 * Un geste **sans effet** — masquer un article déjà masqué, revenir au PIM
 * quand on le suit déjà — n'écrit pas de fait : il dirait qu'une décision a
 * changé alors qu'elle n'a pas bougé. L'état d'avant se lit sur l'agrégat, et
 * c'est lui qui a appliqué ou non la règle ; le handler ne fait que comparer.
 */

/**
 * La garde commune (« l'article existe-t-il encore ? »), extraite plutôt que
 * recopiée quatre fois : un push peut avoir retiré l'article entre l'affichage
 * de la liste et le clic, et c'est un cas qui arrive pour de bon.
 *
 * @throws {CatalogItemNotFoundError} le SKU n'est plus au catalogue.
 */
export async function loadOrFail(items: CatalogItemRepository, sku: string): Promise<CatalogItem> {
  const item = await items.load(sku);
  if (item === null) {
    throw new CatalogItemNotFoundError(sku);
  }
  return item;
}
