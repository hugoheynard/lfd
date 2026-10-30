import { Module } from "@nestjs/common";

import { PriceFloorReader } from "./domain/ports/price-floor.reader.js";
import { SkuVolumeReader } from "./domain/ports/sku-volume.reader.js";
import { PriceRuleReader } from "./domain/ports/price-rule.reader.js";
import { CompanyMercurialeReader } from "./domain/ports/company-mercuriale.reader.js";
import { VolumeLadderReader } from "./domain/ports/volume-ladder.reader.js";
import { VolumeCommitmentReader } from "./domain/ports/volume-commitment.reader.js";
import { CustomerVolumeReader } from "./domain/ports/customer-volume.reader.js";
import { PricingMaterialsLoader } from "./application/pricing-materials.loader.js";
import { PricingMaterialsCache } from "./infrastructure/pricing-materials.cache.js";
import { PrismaPriceFloorReader } from "./infrastructure/prisma-price-floor.reader.js";
import { PrismaSkuVolumeReader } from "./infrastructure/prisma-sku-volume.reader.js";
import { PrismaPriceRuleReader } from "./infrastructure/prisma-price-rule.reader.js";
import { PrismaCompanyMercurialeReader } from "./infrastructure/prisma-company-mercuriale.reader.js";
import { PrismaVolumeLadderReader } from "./infrastructure/prisma-volume-ladder.reader.js";
import { PrismaVolumeCommitmentReader } from "./infrastructure/prisma-volume-commitment.reader.js";
import { PrismaCustomerVolumeReader } from "./infrastructure/prisma-customer-volume.reader.js";
import { PricingAccountReader } from "./domain/ports/pricing-account.reader.js";
import { FollowedPricingAccountReader } from "./infrastructure/followed-pricing-account.reader.js";
import { PricingPartiesResolver } from "./application/pricing-parties.resolver.js";
import { CompanyFollowsReader } from "../account/domain/ports/company-follows.reader.js";
import { PrismaCompanyFollowsReader } from "../account/infrastructure/prisma-company-follows.reader.js";
import { LinePromotionSupply } from "../promotions/application/line-promotion-supply.js";
import { PromotionAudienceFactsResolver } from "../promotions/application/promotion-audience-facts.resolver.js";
import { BasketPromotionReader } from "../promotions/domain/ports/basket-promotion.reader.js";
import { LinePromotionReader } from "../promotions/domain/ports/line-promotion.reader.js";
import { PromotionCompanyStatusReader } from "../promotions/domain/ports/promotion-company-status.reader.js";
import { PromotionShadowJournal } from "../promotions/domain/ports/promotion-shadow.journal.js";
import { PromotionsSourceReader } from "../promotions/domain/ports/promotions-source.reader.js";
import { LoggedPromotionShadowJournal } from "../promotions/infrastructure/logged-promotion-shadow.journal.js";
import {
  PrismaBasketPromotionReader,
  PrismaLinePromotionReader,
} from "../promotions/infrastructure/prisma-live-promotion.readers.js";
import { PrismaPromotionCompanyStatusReader } from "../promotions/infrastructure/prisma-promotion-company-status.reader.js";
import { PrismaPromotionsSourceReader } from "../promotions/infrastructure/prisma-promotions-source.reader.js";

/**
 * Contexte **prix** : les règles tarifaires, leurs planchers, et leur résolution.
 *
 * Il n'exporte que des ports de **lecture**. Les fonctions `resolvePrice` et
 * `resolveFloor` ne sont pas des providers et ne le seront jamais : ce sont des
 * fonctions pures, elles s'importent. En faire des services injectables
 * donnerait l'illusion qu'elles ont des dépendances, et rendrait leur mise sous
 * test plus lourde que leur écriture.
 */
@Module({
  providers: [
    // 🔴 **La seule séquence de chargement du dépôt.** Elle vivait dans
    // `OrderLinePricing`, et quatre autres appelants en avaient écrit chacun
    // une variante — c'est ainsi que deux d'entre eux ont oublié un étage.
    PricingMaterialsLoader,
    // Un SINGLETON, et c'est tout le lot : les trois lectures des matériaux le
    // partagent, et `PricingActWriter` le vide. Deux instances rendraient le
    // cache invisible à l'invalidation de l'autre.
    PricingMaterialsCache,
    { provide: PriceRuleReader, useClass: PrismaPriceRuleReader },
    { provide: CompanyMercurialeReader, useClass: PrismaCompanyMercurialeReader },
    { provide: PriceFloorReader, useClass: PrismaPriceFloorReader },
    { provide: SkuVolumeReader, useClass: PrismaSkuVolumeReader },
    { provide: VolumeLadderReader, useClass: PrismaVolumeLadderReader },
    { provide: VolumeCommitmentReader, useClass: PrismaVolumeCommitmentReader },
    { provide: CustomerVolumeReader, useClass: PrismaCustomerVolumeReader },
    // 🔴 La seule fabrique des parties d'un prix (`sous-comptes.md`,
    // §2.2). Le lecteur des suivis est celui de `account/`, sans état : le
    // lier ici évite d'importer tout `AccountModule` dans la tarification.
    PricingPartiesResolver,
    { provide: PricingAccountReader, useClass: FollowedPricingAccountReader },
    { provide: CompanyFollowsReader, useClass: PrismaCompanyFollowsReader },
    // ▸ Les lecteurs des PROMOTIONS au calcul (plan des promotions, L5). Liés
    //   ICI et non dans `PromotionsModule` : ils lisent sous le cache des
    //   matériaux, singleton de ce module — l'inverse ferait un cycle de
    //   modules, et un second cache que l'estampille ne viderait pas.
    LinePromotionSupply,
    PromotionAudienceFactsResolver,
    { provide: PromotionsSourceReader, useClass: PrismaPromotionsSourceReader },
    { provide: LinePromotionReader, useClass: PrismaLinePromotionReader },
    { provide: BasketPromotionReader, useClass: PrismaBasketPromotionReader },
    { provide: PromotionCompanyStatusReader, useClass: PrismaPromotionCompanyStatusReader },
    { provide: PromotionShadowJournal, useClass: LoggedPromotionShadowJournal },
  ],
  exports: [
    PricingMaterialsLoader,
    // 🔴 EXPORTÉ, et c'est ce qui rend le lot correct. `PricingActWriter` vit
    // dans `PricingAdminModule` — s'il construisait sa propre instance, il
    // viderait un cache que personne ne lit, et la boutique servirait le prix
    // d'avant jusqu'au redémarrage. Un test le tient (`pricing-cache.e2e-spec`).
    PricingMaterialsCache,
    PriceRuleReader,
    CompanyMercurialeReader,
    PriceFloorReader,
    SkuVolumeReader,
    VolumeLadderReader,
    VolumeCommitmentReader,
    CustomerVolumeReader,
    PricingPartiesResolver,
    // Le point PANIER (les ajustements de la commande) lit la même source, les
    // mêmes faits et le même journal que le point ligne.
    PromotionsSourceReader,
    BasketPromotionReader,
    PromotionAudienceFactsResolver,
    PromotionShadowJournal,
  ],
})
export class PricingModule {}
