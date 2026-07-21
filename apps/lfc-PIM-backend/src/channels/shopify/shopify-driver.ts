import { Injectable, Logger } from '@nestjs/common';

import type { ShopifyProductPayload } from './shopify-projection.js';

export interface ShopifyPushResult {
  readonly productGid: string | null;
  /** `sku` → identifiant Shopify de la variante. */
  readonly variantGids: Readonly<Record<string, string>>;
}

/**
 * Transport vers Shopify.
 *
 * Isolé derrière un port pour une raison précise : **on ne peut pas encore l'écrire
 * honnêtement**. L'API Admin de Shopify est versionnée trimestriellement, et écrire
 * aujourd'hui des mutations qu'on ne peut pas exécuter produirait du code plausible et
 * faux. Le spike (une journée, boutique de développement) tranchera — et ne touchera
 * que ce fichier.
 */
export abstract class ShopifyDriver {
  abstract readonly mode: 'live' | 'dry-run';
  abstract push(payload: ShopifyProductPayload): Promise<ShopifyPushResult>;
}

/**
 * Pilote par défaut : **ne contacte rien**. Il valide toute la chaîne — lecture,
 * projection, empreinte, écriture du binding — sans dépendre d'un compte Shopify.
 *
 * Ce n'est pas un bouchon vide : c'est le mode dans lequel l'intégration tourne tant
 * qu'aucun jeton n'est fourni, et il rend le comportement observable dès maintenant.
 */
@Injectable()
export class DryRunShopifyDriver extends ShopifyDriver {
  readonly mode = 'dry-run' as const;
  private readonly logger = new Logger(DryRunShopifyDriver.name);

  push(payload: ShopifyProductPayload): Promise<ShopifyPushResult> {
    this.logger.log(
      `[simulation] ${payload.handle} — ${payload.variants.length} déclinaison(s), statut ${payload.status}`,
    );
    return Promise.resolve({ productGid: null, variantGids: {} });
  }
}
