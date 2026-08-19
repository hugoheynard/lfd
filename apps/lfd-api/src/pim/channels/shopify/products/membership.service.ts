import { Injectable } from "@nestjs/common";

import { ShopifyAdminClient } from "@lfd/shopify-admin";

import { LiveShopifyCollectionsGateway } from "../collections/gateway.js";

/** Ce qu'a donné le rangement : les collections rejointes, celles introuvables. */
export interface MembershipOutcome {
  readonly joined: readonly string[];
  /** Tags `tva-*` demandés mais absents de la boutique (à créer via le push collections). */
  readonly missing: readonly string[];
}

/**
 * Range un produit dans **la** collection `tva-*` de chacun de ses contextes de vente —
 * c'est l'appartenance qui porte l'override de TVA (invariant S1/S2). **Live seulement** :
 * en simulation il n'y a pas d'état boutique à ranger.
 *
 * Choix (revue adverse §8.2 du design) : on **ne crée pas** la collection ici — une
 * collection sans titre soigné serait un déchet ; on **rapporte** l'absence pour que
 * l'appelant la remonte, plutôt que d'avaler l'anomalie. Les collections se créent, avec
 * leur titre, via le push collections (`collections/tva/push`).
 */
@Injectable()
export class ShopifyMembershipService {
  constructor(
    private readonly gateway: LiveShopifyCollectionsGateway,
    private readonly client: ShopifyAdminClient,
  ) {}

  async assign(productGid: string, tags: readonly string[]): Promise<MembershipOutcome> {
    if (tags.length === 0) {
      return { joined: [], missing: [] };
    }
    const byHandle = new Map(
      (await this.gateway.list()).map((collection) => [collection.handle, collection.id]),
    );

    const joined: string[] = [];
    const missing: string[] = [];
    for (const tag of tags) {
      const collectionId = byHandle.get(tag);
      if (collectionId === undefined) {
        missing.push(tag);
        continue;
      }
      await this.client.addProductsToCollection(collectionId, [productGid]);
      joined.push(tag);
    }
    return { joined, missing };
  }
}
