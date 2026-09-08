import { Module } from "@nestjs/common";

import { PriceFloorReader } from "./domain/ports/price-floor.reader.js";
import { SkuVolumeReader } from "./domain/ports/sku-volume.reader.js";
import { PriceRuleReader } from "./domain/ports/price-rule.reader.js";
import { CompanyMercurialeReader } from "./domain/ports/company-mercuriale.reader.js";
import { VolumeLadderReader } from "./domain/ports/volume-ladder.reader.js";
import { VolumeCommitmentReader } from "./domain/ports/volume-commitment.reader.js";
import { CustomerVolumeReader } from "./domain/ports/customer-volume.reader.js";
import { PricingMaterialsCache } from "./infrastructure/pricing-materials.cache.js";
import { PrismaPriceFloorReader } from "./infrastructure/prisma-price-floor.reader.js";
import { PrismaSkuVolumeReader } from "./infrastructure/prisma-sku-volume.reader.js";
import { PrismaPriceRuleReader } from "./infrastructure/prisma-price-rule.reader.js";
import { PrismaCompanyMercurialeReader } from "./infrastructure/prisma-company-mercuriale.reader.js";
import { PrismaVolumeLadderReader } from "./infrastructure/prisma-volume-ladder.reader.js";
import { PrismaVolumeCommitmentReader } from "./infrastructure/prisma-volume-commitment.reader.js";
import { PrismaCustomerVolumeReader } from "./infrastructure/prisma-customer-volume.reader.js";

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
  ],
  exports: [
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
  ],
})
export class PricingModule {}
