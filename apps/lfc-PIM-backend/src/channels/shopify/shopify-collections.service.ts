import { Injectable } from '@nestjs/common';

import {
  DryRunShopifyCollectionsGateway,
  LiveShopifyCollectionsGateway,
  ShopifyCollectionsGateway,
} from './shopify-collections-gateway.js';
import {
  type DesiredCollection,
  missingCollections,
  type Reconciliation,
  reconcileCollections,
  type ShopifyCollection,
} from './shopify-reconcile.js';
import { ShopifySettingsService } from './shopify-settings.service.js';

export type ChannelMode = 'live' | 'dry-run';

export interface InspectResult {
  readonly mode: ChannelMode;
  readonly reconciliation: Reconciliation;
}

export interface PushResult {
  readonly mode: ChannelMode;
  /** Collections effectivement créées pendant ce push. */
  readonly created: readonly ShopifyCollection[];
  /** État après push — la boucle se referme en un aller-retour. */
  readonly reconciliation: Reconciliation;
}

/**
 * Réconciliation des **collections de TVA** avec la boutique. Le service reste
 * agnostique de la TVA : le front lui passe les collections désirées (handle + titre),
 * il inspecte l'écart puis pousse les manquantes. Il dispatche entre simulation et
 * réel selon le `mode` des réglages — activer sans jeton reste une simulation.
 */
@Injectable()
export class ShopifyCollectionsService {
  constructor(
    private readonly settings: ShopifySettingsService,
    private readonly dryRun: DryRunShopifyCollectionsGateway,
    private readonly live: LiveShopifyCollectionsGateway,
  ) {}

  /** Rapproche le voulu et le présent, sans rien écrire. */
  async inspect(desired: readonly DesiredCollection[]): Promise<InspectResult> {
    const { mode, gateway } = await this.resolve();
    const live = await gateway.list();
    return { mode, reconciliation: reconcileCollections(desired, live) };
  }

  /** Crée les collections manquantes (vides), puis renvoie l'état réconcilié. */
  async push(desired: readonly DesiredCollection[]): Promise<PushResult> {
    const { mode, gateway } = await this.resolve();
    const before = reconcileCollections(desired, await gateway.list());

    const created: ShopifyCollection[] = [];
    for (const target of missingCollections(before)) {
      created.push(await gateway.create(target));
    }

    const reconciliation = reconcileCollections(desired, await gateway.list());
    return { mode, created, reconciliation };
  }

  private async resolve(): Promise<{
    mode: ChannelMode;
    gateway: ShopifyCollectionsGateway;
  }> {
    const { mode } = await this.settings.read();
    return { mode, gateway: mode === 'live' ? this.live : this.dryRun };
  }
}
