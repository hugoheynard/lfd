import { Global, Module } from "@nestjs/common";

import { SaveShopCartHandler } from "./application/commands/save-shop-cart.handler.js";
import { GetShopCartHandler } from "./application/queries/get-shop-cart.handler.js";
import { ShopCartSkuUsage } from "./channels/commerce/shop-cart-sku-usage.js";
import { ShopCartRepository } from "./domain/ports/shop-cart.repository.js";
import { ShopCartController } from "./http/shop-cart.controller.js";
import { PrismaShopCartSkuUsage } from "./infrastructure/prisma-shop-cart-sku-usage.js";
import { PrismaShopCartRepository } from "./infrastructure/prisma-shop-cart.repository.js";

/**
 * **Le bloc du panier** : enregistrer et relire le panier en cours d'une
 * personne dans un espace, dans son schéma `cart`.
 *
 * **Global**, comme `MailModule` : le commerce n'importe que le canal
 * (`shop-cart/channels/commerce/`), jamais ce module. Le chiffrage du panier
 * n'est pas ici : c'est le calcul de la passation, et il reste au commerce.
 */
@Global()
@Module({
  controllers: [ShopCartController],
  providers: [
    SaveShopCartHandler,
    GetShopCartHandler,
    { provide: ShopCartRepository, useClass: PrismaShopCartRepository },
    { provide: ShopCartSkuUsage, useClass: PrismaShopCartSkuUsage },
  ],
  exports: [ShopCartSkuUsage],
})
export class ShopCartModule {}
