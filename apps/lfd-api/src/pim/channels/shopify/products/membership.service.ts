import { Injectable } from "@nestjs/common";

import { ShopifyAdminClient, TVA_HANDLE_PREFIX } from "@lfd/shopify-admin";

import { LiveShopifyCollectionsGateway } from "../collections/gateway.js";

/** Ce qu'a donné le rangement : rejointes, quittées, et celles introuvables. */
export interface MembershipOutcome {
  readonly joined: readonly string[];
  /**
   * Les collections `tva-*` **quittées** — l'article y était rangé sous un taux
   * qui n'est plus le sien.
   */
  readonly left: readonly string[];
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
      return { joined: [], left: [], missing: [] };
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
    return { joined, left: await this.leaveStale(productGid, tags, byHandle), missing };
  }

  /**
   * Quitte les collections `tva-*` qui ne sont plus les siennes — l'invariant
   * **S2** : un produit n'est membre que d'UNE collection de taxe.
   *
   * Rejoindre ne suffit pas. Un article dont le taux change — parce que sa
   * famille bouge, ou parce qu'il déroge — restait membre de son ancienne
   * collection : la boutique continuait de le taxer selon elle, sans que rien
   * ne le signale. C'est la panne la plus chère du lot, parce qu'elle est
   * silencieuse et qu'elle porte sur de l'argent.
   *
   * On ne touche QUE les collections `tva-*` : les autres appartiennent au
   * marchand, et ce service n'a rien à y dire.
   */
  private async leaveStale(
    productGid: string,
    keep: readonly string[],
    byHandle: ReadonlyMap<string, string>,
  ): Promise<string[]> {
    const held = await this.client.collectionHandlesOfProduct(productGid);
    const stale = held.filter(
      (handle) => handle.startsWith(TVA_HANDLE_PREFIX) && !keep.includes(handle),
    );

    const left: string[] = [];
    for (const handle of stale) {
      const collectionId = byHandle.get(handle);
      if (collectionId === undefined) {
        continue;
      }
      await this.client.removeProductsFromCollection(collectionId, [productGid]);
      left.push(handle);
    }
    return left;
  }
}
