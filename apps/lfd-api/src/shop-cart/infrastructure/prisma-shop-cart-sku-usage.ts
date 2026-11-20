import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ShopCartSkuUsage } from "../channels/commerce/shop-cart-sku-usage.js";

/**
 * `ShopCartSkuUsage` sur `cart.shop_carts` : une recherche par SKU dans les
 * lignes du `payload`, la même que le catalogue faisait en direct.
 *
 * Sans mur tenant, et c'est le sujet : la question est « quelqu'un, n'importe
 * où », posée par le référentiel, jamais par un client.
 */
@Injectable()
export class PrismaShopCartSkuUsage extends ShopCartSkuUsage {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async skusInCarts(skus: readonly string[]): Promise<ReadonlySet<string>> {
    const hits = await Promise.all(
      skus.map(async (sku) => {
        const row = await this.prisma.shopCart.findFirst({
          where: { payload: { path: ["lines"], array_contains: [{ sku }] } },
          select: { id: true },
        });
        return row === null ? null : sku;
      }),
    );
    return new Set(hits.filter((sku): sku is string => sku !== null));
  }
}
