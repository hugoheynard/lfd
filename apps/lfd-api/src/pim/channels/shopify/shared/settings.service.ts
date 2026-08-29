import type { ChannelMode, ShopifySettingsView, ShopifySettingsInput } from "@lfd/pim-contracts";

/** Les formes vivent dans les contrats — le front les lisait en double. */
export type { ChannelMode, ShopifySettingsView, ShopifySettingsInput };

import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";

const SINGLETON_ID = "shopify";
const DEFAULT_API_VERSION = "2026-07";

@Injectable()
export class ShopifySettingsService {
  constructor(
    private readonly prisma: PimPrismaService,
    private readonly config: AppConfig,
  ) {}

  async read(): Promise<ShopifySettingsView> {
    const row = await this.prisma.shopifySettings.findUnique({
      where: { id: SINGLETON_ID },
    });

    const isEnabled = row?.isEnabled ?? false;
    const hasToken = this.config.hasShopifyCredentials();

    return {
      shopDomain: row?.shopDomain ?? "",
      apiVersion: row?.apiVersion ?? DEFAULT_API_VERSION,
      isEnabled,
      hasToken,
      // Deux conditions, pas une : activer sans identifiants ne doit pas faire
      // croire que ça pousse pour de vrai.
      mode: isEnabled && hasToken ? "live" : "dry-run",
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
