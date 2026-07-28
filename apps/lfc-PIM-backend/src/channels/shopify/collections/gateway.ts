import { Injectable, Logger } from '@nestjs/common';

import { ShopifyAdminClient } from '../shared/admin-client.js';
import type {
  DesiredCollection,
  ShopifyCollection,
} from '../shared/collection-types.js';

/**
 * Port de lecture/écriture des collections Shopify. Deux implémentations : une
 * **simulation** (par défaut, sans jeton) et une **réelle** (Admin GraphQL). Le
 * choix entre les deux se fait au niveau du service, sur le `mode` des réglages —
 * exactement comme pour {@link ShopifyDriver}.
 */
export abstract class ShopifyCollectionsGateway {
  abstract list(): Promise<ShopifyCollection[]>;
  abstract create(target: DesiredCollection): Promise<ShopifyCollection>;
}

/**
 * Simulation : **ne contacte rien**. Elle tient un miroir en mémoire (durée de vie du
 * process) pré-amorcé comme la démo — deux collections présentes et une orpheline —
 * pour que la boucle inspecter → pousser → ré-inspecter soit observable sans boutique.
 */
@Injectable()
export class DryRunShopifyCollectionsGateway extends ShopifyCollectionsGateway {
  private readonly logger = new Logger(DryRunShopifyCollectionsGateway.name);
  private readonly mirror = new Map<string, ShopifyCollection>(
    SEED.map((collection) => [collection.handle, collection]),
  );

  list(): Promise<ShopifyCollection[]> {
    return Promise.resolve([...this.mirror.values()]);
  }

  create(target: DesiredCollection): Promise<ShopifyCollection> {
    const existing = this.mirror.get(target.handle);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    const created: ShopifyCollection = {
      id: `gid://shopify/Collection/dry-${target.handle}`,
      handle: target.handle,
      title: target.title,
      productCount: 0,
    };
    this.mirror.set(created.handle, created);
    this.logger.log(`[simulation] collection créée — ${created.handle}`);
    return Promise.resolve(created);
  }
}

/** Réel : délègue au client Admin GraphQL. Le vrai transport vit dans le client. */
@Injectable()
export class LiveShopifyCollectionsGateway extends ShopifyCollectionsGateway {
  constructor(private readonly client: ShopifyAdminClient) {
    super();
  }

  list(): Promise<ShopifyCollection[]> {
    return this.client.listTvaCollections();
  }

  create(target: DesiredCollection): Promise<ShopifyCollection> {
    return this.client.createCollection(target);
  }
}

/** Amorce de la simulation : deux présentes, une orpheline (`tva-8-5`), une manquante
 *  (`tva-20`) tant que le front ne l'a pas poussée — comme le POC front. */
const SEED: readonly ShopifyCollection[] = [
  {
    id: 'gid://shopify/Collection/dry-tva-5-5',
    handle: 'tva-5-5',
    title: 'TVA 5,5 %',
    productCount: 42,
  },
  {
    id: 'gid://shopify/Collection/dry-tva-10',
    handle: 'tva-10',
    title: 'TVA 10 %',
    productCount: 18,
  },
  {
    id: 'gid://shopify/Collection/dry-tva-8-5',
    handle: 'tva-8-5',
    title: 'TVA 8,5 %',
    productCount: 3,
  },
];
