import { Injectable } from '@nestjs/common';

import { AppError } from '../../../shared/errors/app-error.js';
import { ShopifyAdminClient } from '@lfd/shopify-admin';
import {
  type ChannelMode,
  ShopifySettingsService,
} from '../shared/settings.service.js';

export interface VerifyResult {
  readonly mode: ChannelMode;
  /** La boutique a-t-elle répondu ? En simulation, toujours `false`. */
  readonly connected: boolean;
  /** Nom de la boutique confirmé par Shopify, si connectée. */
  readonly shopName: string | null;
  /** Message lisible pour l'écran (raison du dry-run, ou de l'échec). */
  readonly detail: string;
}

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
    if (mode === 'dry-run') {
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
        detail:
          caught instanceof AppError
            ? caught.message
            : 'Échec de la vérification.',
      };
    }
  }
}

/** Pourquoi on est encore en simulation — formulé à partir des deux mêmes signaux
 *  que la vue des réglages (identifiants présents, intégration activée). */
function dryRunReason(isEnabled: boolean, hasToken: boolean): string {
  if (!hasToken) {
    return (
      'Mode simulation : aucun identifiant Shopify fourni ' +
      '(SHOPIFY_ADMIN_TOKEN, ou SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET).'
    );
  }
  if (!isEnabled) {
    return "Mode simulation : l'intégration n'est pas activée dans les réglages.";
  }
  return 'Mode simulation.';
}
