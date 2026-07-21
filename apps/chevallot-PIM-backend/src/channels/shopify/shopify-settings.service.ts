import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../infra/config/app-config.js';
import { PrismaService } from '../../infra/database/prisma.service.js';

const SINGLETON_ID = 'shopify';
const DEFAULT_API_VERSION = '2026-07';

export interface ShopifySettingsView {
  readonly shopDomain: string;
  readonly apiVersion: string;
  readonly isEnabled: boolean;
  /** **Jamais** le jeton lui-même — seulement sa présence. */
  readonly hasToken: boolean;
  /** `dry-run` tant que l'intégration n'est pas activée **et** approvisionnée. */
  readonly mode: 'live' | 'dry-run';
  readonly updatedAt: string | null;
}

export interface ShopifySettingsInput {
  readonly shopDomain: string;
  readonly apiVersion: string;
  readonly isEnabled: boolean;
}

@Injectable()
export class ShopifySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async read(): Promise<ShopifySettingsView> {
    const row = await this.prisma.shopifySettings.findUnique({
      where: { id: SINGLETON_ID },
    });

    const isEnabled = row?.isEnabled ?? false;
    const hasToken = this.config.hasShopifyToken();

    return {
      shopDomain: row?.shopDomain ?? '',
      apiVersion: row?.apiVersion ?? DEFAULT_API_VERSION,
      isEnabled,
      hasToken,
      // Deux conditions, pas une : activer sans jeton ne doit pas faire croire
      // que ça pousse pour de vrai.
      mode: isEnabled && hasToken ? 'live' : 'dry-run',
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async save(input: ShopifySettingsInput): Promise<ShopifySettingsView> {
    const data = {
      shopDomain: input.shopDomain.trim(),
      apiVersion: input.apiVersion.trim(),
      isEnabled: input.isEnabled,
    };

    await this.prisma.shopifySettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    return this.read();
  }
}
