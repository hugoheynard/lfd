import type { VerifyResult } from "@lfd/pim-contracts";

/** Les formes vivent dans les contrats — le front les lisait en double. */
export type { VerifyResult };

import { Injectable } from "@nestjs/common";

import { AppError } from "../../../../platform/shared/errors/app-error.js";
import { ShopifyAdminClient } from "@lfd/shopify-admin";
// ⚠️ PAS `import type` : cette classe est un JETON D’INJECTION. En `type`, Nest
// ne la voit plus au runtime et rend « can’t resolve dependencies at index [0] »,
// un message qui n’accuse jamais l’import.
import { ShopifySettingsService } from "../shared/settings.service.js";

/**
 * Vérification de connexion — le bouton « Vérifier » de l'écran d'intégration. Elle
 * ne jette pas : un échec est un **résultat** que l'UI affiche en rouge, pas une
 * exception. En simulation, elle explique pourquoi ça ne pousse pas encore pour de vrai.
 */
@Injectable()
export class ShopifyConnectionService {
  constructor(
    private readonly settings: ShopifySettingsService,
    private readonly client: ShopifyAdminClient,
  ) {}

  async verify(): Promise<VerifyResult> {
    const { mode, isEnabled, hasToken } = await this.settings.read();
    if (mode === "dry-run") {
      return {
        mode,
        connected: false,
        shopName: null,
        detail: dryRunReason(isEnabled, hasToken),
      };
    }

    try {
      const shop = await this.client.verify();
      return {
        mode,
        connected: true,
        shopName: shop.name,
        detail: `Connecté à ${shop.name} (${shop.domain}).`,
      };
    } catch (caught) {
      return {
        mode,
        connected: false,
        shopName: null,
        detail: caught instanceof AppError ? caught.message : "Échec de la vérification.",
      };
    }
  }
}

/** Pourquoi on est encore en simulation — formulé à partir des deux mêmes signaux
 *  que la vue des réglages (identifiants présents, intégration activée). */
function dryRunReason(isEnabled: boolean, hasToken: boolean): string {
  if (!hasToken) {
    return (
      "Mode simulation : aucun identifiant Shopify fourni " +
      "(SHOPIFY_ADMIN_TOKEN, ou SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET)."
    );
  }
  if (!isEnabled) {
    return "Mode simulation : l'intégration n'est pas activée dans les réglages.";
  }
  return "Mode simulation.";
}
