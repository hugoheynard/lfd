import { Injectable } from '@nestjs/common';
import type { PushReport, PushSummary } from '@lfd/pim-contracts';

import { CatalogueReader } from '../../../catalogue/domain/ports/catalogue-reader.js';
import type { ProductRecord } from '../../../catalogue/domain/ports/product.repository.js';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import {
  DryRunShopifyDriver,
  LiveShopifyDriver,
  type ShopifyDriver,
} from './driver.js';
import { fingerprint, projectProduct } from './projection.js';
import { ShopifySnapshotService } from './snapshot.service.js';
import {
  type ChannelMode,
  ShopifySettingsService,
} from '../shared/settings.service.js';

/** Le mode d'un pilote, dans le vocabulaire des snapshots (`dry-run` → `dry_run`). */
function snapshotMode(driver: ShopifyDriver): 'live' | 'dry_run' {
  return driver.mode === 'live' ? 'live' : 'dry_run';
}

@Injectable()
export class ShopifyPushService {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly settings: ShopifySettingsService,
    private readonly dryRun: DryRunShopifyDriver,
    private readonly live: LiveShopifyDriver,
    private readonly prisma: PrismaService,
    private readonly snapshots: ShopifySnapshotService,
  ) {}

  async push(productIds?: readonly string[]): Promise<PushSummary> {
    const { mode } = await this.settings.read();
    const driver = this.driverFor(mode);
    const products =
      productIds === undefined || productIds.length === 0
        ? await this.catalogue.publishable()
        : await this.catalogue.byIds(productIds);

    const results: PushReport[] = [];
    for (const product of products) {
      results.push(await this.pushOne(product, driver));
    }

    return { mode, results };
  }

  /**
   * Rejeu d'un snapshot antérieur — le retour arrière. Re-pousse *exactement* le payload
   * figé de la version ciblée (ce qui crée une nouvelle version : l'historique ne se
   * réécrit jamais). N'efface rien ; le PIM reste l'autorité, donc rétablir écrase l'état
   * distant courant — l'écran le signale quand une dérive boutique est présente.
   */
  async rollback(handle: string, version: number): Promise<PushReport> {
    const snapshot = await this.snapshots.load(handle, version);
    const { mode } = await this.settings.read();
    const driver = this.driverFor(mode);
    const hash = fingerprint(snapshot.payload);
    const sku = await this.skuOf(snapshot.productId, handle);

    try {
      const result = await driver.push(snapshot.payload);
      const fresh = await this.snapshots.record({
        handle,
        productId: snapshot.productId,
        hash,
        payload: snapshot.payload,
        mode: snapshotMode(driver),
        outcome: 'pushed',
      });
      await this.updateProductBinding(snapshot.productId, {
        hash,
        productGid: result.productGid,
        headSnapshotId: driver.mode === 'live' ? fresh.id : null,
      });
      return {
        productId: snapshot.productId,
        sku,
        outcome: 'pushed',
        message:
          driver.mode === 'dry-run'
            ? `Rollback simulé vers v${version} (aucun appel réseau).`
            : `Rétabli sur la version v${version}.`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Échec inattendu.';
      await this.recordFailure(snapshot.productId, message);
      return { productId: snapshot.productId, sku, outcome: 'failed', message };
    }
  }

  /** Le pilote réel seulement en mode `live` ; sinon la simulation (aucun appel). */
  private driverFor(mode: ChannelMode): ShopifyDriver {
    return mode === 'live' ? this.live : this.dryRun;
  }

  /**
   * Un produit à la fois, en séquence : les canaux imposent des quotas d'appels, et une
   * rafale parallèle se ferait étrangler. À volume de boulangerie, la lenteur est
   * invisible ; l'étranglement, non.
   */
  private async pushOne(
    product: ProductRecord,
    driver: ShopifyDriver,
  ): Promise<PushReport> {
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
      const result = await driver.push(payload);
      // Un snapshot par poussée réussie (audit + historique), mais le head/BASE
      // n'avance qu'en `live` : une simulation n'est pas la vérité boutique.
      const snapshot = await this.snapshots.record({
        handle: payload.handle,
        productId: product.id,
        hash,
        payload,
        mode: snapshotMode(driver),
        outcome: 'pushed',
      });
      await this.recordSuccess(
        product,
        hash,
        result.productGid,
        driver.mode === 'live' ? snapshot.id : null,
      );

      return {
        productId: product.id,
        sku: product.sku,
        outcome: 'pushed',
        message:
          driver.mode === 'dry-run'
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
    headSnapshotId: string | null,
  ): Promise<void> {
    await this.updateProductBinding(product.id, {
      hash,
      productGid,
      headSnapshotId,
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

  private async updateProductBinding(
    productId: string,
    fields: {
      hash: string;
      productGid: string | null;
      headSnapshotId: string | null;
    },
  ): Promise<void> {
    const data = {
      lastPushedHash: fields.hash,
      lastPushedAt: new Date(),
      syncStatus: 'up_to_date' as const,
      lastError: null,
      ...(fields.productGid === null
        ? {}
        : { shopifyProductGid: fields.productGid }),
      ...(fields.headSnapshotId === null
        ? {}
        : { headSnapshotId: fields.headSnapshotId }),
    };

    await this.prisma.shopifyProductBinding.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
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

  /** SKU courant du produit pour l'affichage du rapport ; à défaut, le handle. */
  private async skuOf(productId: string, fallback: string): Promise<string> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sku: true },
    });
    return product?.sku ?? fallback;
  }
}
