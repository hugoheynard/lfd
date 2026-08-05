import { Injectable } from '@nestjs/common';

import { ShopifyAdminClient } from '../shared/admin-client.js';
import type { ShopifyProductSnapshot } from '../shared/product-snapshot.js';
import {
  type ChannelMode,
  ShopifySettingsService,
} from '../shared/settings.service.js';

/** Ce que l'écran d'inspection affiche : l'état distant + le mode qui l'a produit. */
export interface CatalogueInspection {
  readonly mode: ChannelMode;
  readonly products: readonly ShopifyProductSnapshot[];
}

/**
 * **Lecture** de l'état actuel du catalogue Shopify — l'inverse du push. Sert à *voir*
 * ce qui est déjà sur la boutique (avant de pousser, pour ne pas dupliquer). Le PIM
 * reste la source de vérité ; ceci n'écrit rien.
 *
 * En `dry-run` on ne lit rien : il n'y a pas d'état distant à simuler honnêtement. On
 * renvoie une liste vide en signalant le mode — l'écran explique alors qu'il faut une
 * connexion réelle pour inspecter la boutique.
 */
@Injectable()
export class ShopifyInspectionService {
  constructor(
    private readonly settings: ShopifySettingsService,
    private readonly client: ShopifyAdminClient,
  ) {}

  async inspect(): Promise<CatalogueInspection> {
    const { mode } = await this.settings.read();
    if (mode === 'dry-run') {
      return { mode, products: [] };
    }
    return { mode, products: await this.client.listProducts() };
  }
}
