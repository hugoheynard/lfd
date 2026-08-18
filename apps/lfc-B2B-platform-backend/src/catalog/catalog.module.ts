import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import {
  AlignOnPimPriceHandler,
  SetB2bPriceHandler,
  SetCatalogFeaturedHandler,
  SetCatalogVisibilityHandler,
} from "./application/commands/catalog-decision.handlers.js";
import { IngestCatalogService } from "./application/ingest-catalog.service.js";
import { CatalogAdminReader } from "./domain/ports/catalog-admin.reader.js";
import { CatalogCategoryProjection } from "./domain/ports/catalog-category.projection.js";
import { CatalogItemRepository } from "./domain/ports/catalog-item.repository.js";
import { CanonicalPriceHistoryReader } from "./domain/ports/canonical-price-history.reader.js";
import { CatalogReader } from "./domain/ports/catalog.reader.js";
import { PrismaCatalogAdminReader } from "./infrastructure/prisma-catalog-admin.reader.js";
import { PrismaCatalogCategoryProjection } from "./infrastructure/prisma-catalog-category.projection.js";
import { PrismaCatalogItemRepository } from "./infrastructure/prisma-catalog-item.repository.js";
import { PrismaCanonicalPriceHistoryReader } from "./infrastructure/prisma-canonical-price-history.reader.js";
import { PrismaCatalogReader } from "./infrastructure/prisma-catalog.reader.js";
import { AdminCatalogController } from "./http/admin-catalog.controller.js";
import { CatalogIngestController } from "./http/catalog-ingest.controller.js";

/**
 * **Le catalogue de la plateforme** : ce que le PIM pousse, plus ce qu'on décide
 * ici (prix B2B, visibilité).
 *
 * Contexte à part entière, avec son agrégat. Toute écriture passe par une
 * méthode nommée de `CatalogItem` — jamais une colonne, jamais une primitive :
 * l'invariant « une décision commerciale survit à un push » vit dans le domaine,
 * pas dans un commentaire d'adaptateur.
 *
 * Quatre ports, parce qu'ils répondent à quatre questions différentes (ISP) :
 * `CatalogReader` sert la boutique (le vendable, prix résolu) ;
 * `CatalogAdminReader` sert le paramétrage (tout, provenance comprise) ;
 * `CatalogItemRepository` charge et enregistre des agrégats ;
 * `CatalogCategoryProjection` tient le miroir des familles — nommé projection
 * parce qu'aucune règle ne peut refuser d'y écrire ;
 * `CanonicalPriceHistoryReader` relit le tarif à une date. Il n'a **pas** de
 * jumeau en écriture : la trace est posée dans la transaction qui sauve
 * l'article, au seul endroit par lequel les deux chemins de changement passent.
 */
@Module({
  imports: [CqrsModule],
  controllers: [CatalogIngestController, AdminCatalogController],
  providers: [
    IngestCatalogService,
    SetB2bPriceHandler,
    AlignOnPimPriceHandler,
    SetCatalogVisibilityHandler,
    SetCatalogFeaturedHandler,
    { provide: CatalogItemRepository, useClass: PrismaCatalogItemRepository },
    { provide: CatalogCategoryProjection, useClass: PrismaCatalogCategoryProjection },
    { provide: CatalogReader, useClass: PrismaCatalogReader },
    { provide: CatalogAdminReader, useClass: PrismaCatalogAdminReader },
    { provide: CanonicalPriceHistoryReader, useClass: PrismaCanonicalPriceHistoryReader },
  ],
  // L'historique sort d'ici parce que l'écran de tarification en a besoin : sa
  // lecture datée doit rendre le tarif de CE jour-là, pas celui d'aujourd'hui.
  exports: [CatalogReader, CatalogItemRepository, CanonicalPriceHistoryReader],
})
export class CatalogModule {}
