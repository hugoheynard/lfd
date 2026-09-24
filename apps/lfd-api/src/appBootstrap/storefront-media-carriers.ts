import { Injectable } from "@nestjs/common";

import { StorefrontMediaUsage } from "../b2b/storefront/channels/media/storefront-media-usage.js";
import { MediaCarriers, type Carrier } from "../media/channels/carriers/media-carriers.js";

/**
 * **Ce que la VITRINE répond à la médiathèque** : quels objets de vitrine
 * affichent une image.
 *
 * 🔴 Ici, dans `appBootstrap/`, et pas dans `b2b/` : la ligne `b2b` de la
 * matrice des frontières n'a pas `media`, et ce plan ne la change pas (D9).
 * La vitrine publie un port de lecture dans SON vocabulaire
 * (`StorefrontMediaUsage`), la médiathèque déclare le sien (`MediaCarriers`) ;
 * seule la racine de composition connaît les deux, et traduit.
 */
@Injectable()
export class StorefrontMediaCarriers extends MediaCarriers {
  constructor(private readonly usage: StorefrontMediaUsage) {
    super();
  }

  usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    return this.usage.usesOf(urls);
  }

  async carriersOf(url: string): Promise<readonly Carrier[]> {
    const usages = await this.usage.usagesOf(url);
    return usages.map(({ objectId, label }) => ({
      kind: "storefront",
      id: objectId,
      // Jamais vide : `StorefrontMediaUsageEntry.label` le garantit déjà.
      label,
    }));
  }
}
