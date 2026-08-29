import type { CatalogueInspection } from "@lfd/pim-contracts";

/** Les formes vivent dans les contrats — le front les lisait en double. */
export type { CatalogueInspection };

import { Injectable } from "@nestjs/common";

import { ShopifyAdminClient } from "@lfd/shopify-admin";
// ⚠️ PAS `import type` : cette classe est un JETON D’INJECTION. En `type`, Nest
// ne la voit plus au runtime et rend « can’t resolve dependencies at index [0] »,
// un message qui n’accuse jamais l’import.
import { ShopifySettingsService } from "../shared/settings.service.js";

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
    if (mode === "dry-run") {
      return { mode, products: [] };
    }
    return { mode, products: await this.client.listProducts() };
  }
}
