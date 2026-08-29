import type { InspectResult, PushResult } from "@lfd/pim-contracts";

/** Les formes vivent dans les contrats — le front les lisait en double. */
export type { InspectResult, PushResult };

import { Injectable } from "@nestjs/common";

import type { DesiredCollection, ShopifyCollection } from "@lfd/shopify-admin";
import { type ChannelMode, ShopifySettingsService } from "../shared/settings.service.js";
import {
  DryRunShopifyCollectionsGateway,
  LiveShopifyCollectionsGateway,
  ShopifyCollectionsGateway,
} from "./gateway.js";
import { missingCollections, reconcileCollections } from "./reconcile.js";

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
    return { mode, gateway: mode === "live" ? this.live : this.dryRun };
  }
}
