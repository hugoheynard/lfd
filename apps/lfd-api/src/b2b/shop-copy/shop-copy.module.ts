import { Module } from "@nestjs/common";

import { GrowthModule } from "../growth/growth.module.js";
import { ApplyShopCopyRenames } from "./application/apply-shop-copy-renames.js";
import { PublishShopCopyHandler } from "./application/commands/publish-shop-copy.handler.js";
import { ResetShopCopyDraftHandler } from "./application/commands/reset-shop-copy-draft.handler.js";
import { SaveShopCopyDraftHandler } from "./application/commands/save-shop-copy-draft.handler.js";
import { GetPublishedShopCopyHandler } from "./application/queries/get-published-shop-copy.handler.js";
import { GetShopCopyAdminHandler } from "./application/queries/get-shop-copy-admin.handler.js";
import { GetShopCopyHistoryHandler } from "./application/queries/get-shop-copy-history.handler.js";
import {
  PublishedShopCopyCache,
  PublishedShopCopyReader,
} from "./domain/ports/published-shop-copy.reader.js";
import { ShopCopyAdminReader } from "./domain/ports/shop-copy-admin.reader.js";
import { ShopCopyReleaseRepository } from "./domain/ports/shop-copy-release.repository.js";
import { ShopCopyRenamer } from "./domain/ports/shop-copy-renamer.js";
import { ShopCopyRepository } from "./domain/ports/shop-copy.repository.js";
import { ShopCopyManifest } from "./domain/shop-copy-manifest.js";
import { AdminShopCopyController } from "./http/admin-shop-copy.controller.js";
import { ShopCopyController } from "./http/shop-copy.controller.js";
import { CachedPublishedShopCopyReader } from "./infrastructure/cached-published-shop-copy.reader.js";
import { embeddedShopCopyManifest } from "./infrastructure/embedded-shop-copy.js";
import { PrismaPublishedShopCopyStore } from "./infrastructure/prisma-published-shop-copy.store.js";
import { PublishedShopCopyStore } from "./infrastructure/published-shop-copy.store.js";
import { PrismaShopCopyAdminReader } from "./infrastructure/prisma-shop-copy-admin.reader.js";
import { PrismaShopCopyReleaseRepository } from "./infrastructure/prisma-shop-copy-release.repository.js";
import { PrismaShopCopyRepository } from "./infrastructure/prisma-shop-copy.repository.js";
import { PrismaShopCopyRenamer } from "./infrastructure/prisma-shop-copy.renamer.js";
import { ShopCopyRenamesOnBoot } from "./infrastructure/shop-copy-renames.on-boot.js";

/**
 * **Les textes de la boutique** — des remplacements du texte du code, en
 * brouillon puis publiés (plan
 * `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`).
 *
 * À côté de la vitrine et du contenu de plateforme, et sous le même droit que
 * la vitrine. Importe `GrowthModule` pour le seul port de LECTURE du journal
 * (l'historique des publications). N'exporte rien.
 *
 * Le manifeste est construit UNE fois, au démarrage, depuis la copie que le
 * build embarque — le même objet sert la validation, la publication et la
 * lecture publique.
 */
@Module({
  imports: [GrowthModule],
  controllers: [ShopCopyController, AdminShopCopyController],
  providers: [
    { provide: ShopCopyManifest, useFactory: embeddedShopCopyManifest },
    { provide: ShopCopyRepository, useClass: PrismaShopCopyRepository },
    { provide: ShopCopyReleaseRepository, useClass: PrismaShopCopyReleaseRepository },
    { provide: ShopCopyAdminReader, useClass: PrismaShopCopyAdminReader },
    { provide: ShopCopyRenamer, useClass: PrismaShopCopyRenamer },
    { provide: PublishedShopCopyStore, useClass: PrismaPublishedShopCopyStore },
    CachedPublishedShopCopyReader,
    { provide: PublishedShopCopyReader, useExisting: CachedPublishedShopCopyReader },
    { provide: PublishedShopCopyCache, useExisting: CachedPublishedShopCopyReader },
    ApplyShopCopyRenames,
    ShopCopyRenamesOnBoot,
    SaveShopCopyDraftHandler,
    ResetShopCopyDraftHandler,
    PublishShopCopyHandler,
    GetPublishedShopCopyHandler,
    GetShopCopyAdminHandler,
    GetShopCopyHistoryHandler,
  ],
})
export class ShopCopyModule {}
