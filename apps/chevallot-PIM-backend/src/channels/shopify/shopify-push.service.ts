import { Injectable } from '@nestjs/common';

import { CatalogueReader } from '../../catalogue/domain/ports/catalogue-reader.js';
import type { ProductRecord } from '../../catalogue/domain/ports/product.repository.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { ShopifyDriver } from './shopify-driver.js';
import { fingerprint, projectProduct } from './shopify-projection.js';
import { ShopifySettingsService } from './shopify-settings.service.js';

export type PushOutcome = 'pushed' | 'unchanged' | 'failed';

export interface PushReport {
  readonly productId: string;
  readonly sku: string;
  readonly outcome: PushOutcome;
  readonly message: string;
}

export interface PushSummary {
  readonly mode: 'live' | 'dry-run';
  readonly results: readonly PushReport[];
}

@Injectable()
export class ShopifyPushService {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly settings: ShopifySettingsService,
    private readonly driver: ShopifyDriver,
    private readonly prisma: PrismaService,
  ) {}

  async push(productIds?: readonly string[]): Promise<PushSummary> {
    const { mode } = await this.settings.read();
    const products =
      productIds === undefined || productIds.length === 0
        ? await this.catalogue.publishable()
        : await this.catalogue.byIds(productIds);

    const results: PushReport[] = [];
    for (const product of products) {
      results.push(await this.pushOne(product));
    }

    return { mode, results };
  }

  /**
   * Un produit à la fois, en séquence : les canaux imposent des quotas d'appels, et une
   * rafale parallèle se ferait étrangler. À volume de boulangerie, la lenteur est
   * invisible ; l'étranglement, non.
   */
  private async pushOne(product: ProductRecord): Promise<PushReport> {
    const payload = projectProduct(product);
    const hash = fingerprint(payload);

    const existing = await this.prisma.shopifyProductBinding.findUnique({
      where: { productId: product.id },
      select: { lastPushedHash: true },
    });

    // Ne pas repousser l'identique : c'est ce que l'empreinte achète.
    if (existing?.lastPushedHash === hash) {
      return {
        productId: product.id,
        sku: product.sku,
        outcome: 'unchanged',
        message: 'Déjà à jour.',
      };
    }

    try {
      const result = await this.driver.push(payload);
      await this.recordSuccess(product, hash, result.productGid);

      return {
        productId: product.id,
        sku: product.sku,
        outcome: 'pushed',
        message:
          this.driver.mode === 'dry-run'
            ? 'Simulé (aucun appel réseau).'
            : 'Poussé vers Shopify.',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Échec inattendu.';
      await this.recordFailure(product.id, message);

      return {
        productId: product.id,
        sku: product.sku,
        outcome: 'failed',
        message,
      };
    }
  }

  private async recordSuccess(
    product: ProductRecord,
    hash: string,
    productGid: string | null,
  ): Promise<void> {
    const data = {
      lastPushedHash: hash,
      lastPushedAt: new Date(),
      syncStatus: 'up_to_date' as const,
      lastError: null,
      ...(productGid === null ? {} : { shopifyProductGid: productGid }),
    };

    await this.prisma.shopifyProductBinding.upsert({
      where: { productId: product.id },
      create: { productId: product.id, ...data },
      update: data,
    });

    // Les déclinaisons obtiennent leur ligne de binding même sans référence propre :
    // c'est elle qui portera le PLU ou l'identifiant distant le jour venu.
    for (const variant of product.variants) {
      await this.prisma.shopifyVariantBinding.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id },
        update: {},
      });
    }
  }

  private async recordFailure(
    productId: string,
    message: string,
  ): Promise<void> {
    const data = { syncStatus: 'failed' as const, lastError: message };
    await this.prisma.shopifyProductBinding.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
  }
}
