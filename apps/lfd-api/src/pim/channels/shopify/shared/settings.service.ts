import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../../infra/config/app-config.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";

const SINGLETON_ID = "shopify";
const DEFAULT_API_VERSION = "2026-07";

/** Mode du canal — `live` seulement si activé **et** approvisionné en jeton.
 *  Vocabulaire partagé : lu par les collections, la connexion, le push produit. */
export type ChannelMode = "live" | "dry-run";

export interface ShopifySettingsView {
  readonly shopDomain: string;
  readonly apiVersion: string;
  readonly isEnabled: boolean;
  /** Présence d'un moyen d'authentification (jeton legacy **ou** client credentials) —
   *  **jamais** le secret lui-même. Nom historique conservé (contrat lu par le front). */
  readonly hasToken: boolean;
  /** `dry-run` tant que l'intégration n'est pas activée **et** approvisionnée. */
  readonly mode: ChannelMode;
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
