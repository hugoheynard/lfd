import { Injectable } from "@nestjs/common";

// `b2b` conforme au port publié par `pim`, jamais l'inverse — même sens que
// `InProcessB2bCatalogDriver`, dans l'autre direction du fil.
import {
  B2bDeliveryFactsReader,
  type SkuDeliveryFacts,
} from "../../../pim/channels/b2b-platform/products/delivery-facts.reader.js";
import { deliveredItems, mirrorItems } from "../application/delivery-comparison.js";
import type { CatalogItem } from "../domain/entities/catalog-item.js";
import { diffDelivery } from "../domain/delivery-diff.js";
import { CatalogDeliveryRepository } from "../domain/ports/catalog-delivery.repository.js";
import { CatalogItemRepository } from "../domain/ports/catalog-item.repository.js";

/**
 * **Ce que la plateforme répond au référentiel** — en processus, comme l'aller.
 *
 * Deux lectures, et elles ne disent pas la même chose :
 *
 * - le **miroir** dit ce qui a été accepté, et depuis quelle livraison les faits
 *   en vigueur datent (`receivedAt` porté par l'article) ;
 * - l'**arrivée en attente**, s'il y en a une, dit ce qui bougerait — et son
 *   diff est le seul moyen d'y voir un **retrait**, qui n'est qu'une absence
 *   dans le snapshot livré.
 *
 * ⚠️ Le diff est calculé ici plutôt que d'être lu quelque part, et pour la même
 * raison qu'à l'écran de validation : le miroir bouge entre la réception et la
 * lecture. Un diff figé signalerait « en attente » un SKU dont l'arrivée
 * n'apporte plus rien.
 *
 * Le coût est une comparaison du catalogue entier par appel — deux cents
 * articles, sur une fiche produit qu'on ouvre à la main. C'est le même prix que
 * l'écran de validation paie déjà, et il achète la même chose : un fait juste
 * maintenant, plutôt qu'un fait juste hier.
 */
@Injectable()
export class InProcessDeliveryFactsReader extends B2bDeliveryFactsReader {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly deliveries: CatalogDeliveryRepository,
  ) {
    super();
  }

  async factsFor(skus: readonly string[]): Promise<ReadonlyMap<string, SkuDeliveryFacts>> {
    const wanted = new Set(skus);
    if (wanted.size === 0) {
      return new Map();
    }

    const mirror = await this.items.loadAll();
    const awaiting = await this.awaitingSince(mirror);

    const facts = new Map<string, SkuDeliveryFacts>();
    for (const item of mirror) {
      if (!wanted.has(item.sku)) {
        continue;
      }
      facts.set(item.sku, {
        sku: item.sku,
        accepted: true,
        // Les faits EN VIGUEUR, pas le dernier push : un SKU écarté à la
        // dernière validation garde la date de la livraison précédente, et
        // c'est précisément ce que la fiche doit montrer.
        factsReceivedAt: item.pimFacts.receivedAt,
        awaitingSince: awaiting.get(item.sku) ?? null,
      });
    }

    // Ce qui attend SANS être encore accepté : une entrée, une seule fois. Sans
    // cette passe, un article neuf en attente de validation n'existerait nulle
    // part — et la fiche dirait « poussée », puis plus rien.
    for (const [sku, since] of awaiting) {
      if (!wanted.has(sku) || facts.has(sku)) {
        continue;
      }
      facts.set(sku, { sku, accepted: false, factsReceivedAt: null, awaitingSince: since });
    }
    return facts;
  }

  /**
   * Les SKU que l'arrivée en attente **touche**, et depuis quand.
   *
   * Passe par le diff plutôt que par la liste des SKU livrés : un **retrait** est
   * l'absence d'un SKU dans le snapshot, et il n'apparaîtrait donc pas. Or c'est
   * le cas où le référentiel a le plus besoin de savoir que quelque chose attend
   * — la fiche est dépubliée ici, l'article encore en vente là-bas.
   */
  private async awaitingSince(mirror: readonly CatalogItem[]): Promise<ReadonlyMap<string, Date>> {
    const delivery = await this.deliveries.pending();
    if (delivery === null) {
      return new Map();
    }
    const changes = diffDelivery(deliveredItems(delivery.snapshot), mirrorItems(mirror));
    return new Map(changes.map((change) => [change.sku, delivery.receivedAt]));
  }
}
