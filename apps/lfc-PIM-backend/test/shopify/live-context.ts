import { Test } from '@nestjs/testing';

import { LiveShopifyDriver } from '../../src/channels/shopify/products/driver.js';
import { ShopifyAdminClient } from '../../src/channels/shopify/shared/admin-client.js';
import { ShopifySettingsService } from '../../src/channels/shopify/shared/settings.service.js';
import {
  type ShopifyCredentialsSource,
  ShopifyTokenProvider,
} from '../../src/channels/shopify/shared/token-provider.js';

/**
 * Harnais des e2e Shopify **live**. Seul fichier autorisé à lire l'environnement
 * (allowlist ESLint) : il n'expose que le drapeau d'activation et un contexte prêt
 * (driver + client réels) pointé sur la **dev store** d'e2e. On n'y met aucun secret
 * en dur — tout vient de l'env, chargé via `--env-file=.env`.
 */
const API_VERSION = '2026-07';

/** Vrai seulement si le flag ET les identifiants ET la boutique d'e2e sont fournis. */
export function liveE2eEnabled(): boolean {
  return (
    process.env['SHOPIFY_LIVE_E2E'] === '1' &&
    typeof process.env['SHOPIFY_CLIENT_ID'] === 'string' &&
    typeof process.env['SHOPIFY_CLIENT_SECRET'] === 'string' &&
    typeof process.env['SHOPIFY_E2E_SHOP'] === 'string'
  );
}

export interface LiveContext {
  readonly driver: LiveShopifyDriver;
  readonly client: ShopifyAdminClient;
}

/**
 * Bâtit le **vrai** `LiveShopifyDriver` + `ShopifyAdminClient` (donc le vrai
 * `ShopifyTokenProvider`) via la DI, avec des réglages figés sur la dev store d'e2e.
 * Le domaine vient de `SHOPIFY_E2E_SHOP`, les identifiants de l'env — pas de DB.
 */
export async function buildLiveContext(): Promise<LiveContext> {
  const shopDomain = process.env['SHOPIFY_E2E_SHOP'] ?? '';
  const credentials: ShopifyCredentialsSource = {
    shopifyAdminToken: () => null,
    shopifyOAuthCredentials: () => ({
      clientId: process.env['SHOPIFY_CLIENT_ID'] ?? '',
      clientSecret: process.env['SHOPIFY_CLIENT_SECRET'] ?? '',
    }),
  };
  const settingsView = {
    shopDomain,
    apiVersion: API_VERSION,
    isEnabled: true,
    hasToken: true,
    mode: 'live' as const,
    updatedAt: null,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ShopifyAdminClient,
      LiveShopifyDriver,
      {
        provide: ShopifyTokenProvider,
        useValue: new ShopifyTokenProvider(credentials),
      },
      {
        provide: ShopifySettingsService,
        useValue: { read: () => Promise.resolve(settingsView) },
      },
    ],
  }).compile();

  return {
    driver: moduleRef.get(LiveShopifyDriver),
    client: moduleRef.get(ShopifyAdminClient),
  };
}
