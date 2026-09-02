import { Module } from "@nestjs/common";

import { B2bPlatformModule } from "../../pim/channels/b2b-platform/b2b-platform.module.js";

import {
  AlignOnPimPriceHandler,
  SetB2bPriceHandler,
  SetCatalogFeaturedHandler,
  SetCatalogVisibilityHandler,
} from "./application/commands/catalog-decision.handlers.js";
import { IngestCatalogService } from "./application/ingest-catalog.service.js";
import { CatalogAdminReader } from "./domain/ports/catalog-admin.reader.js";
import { CatalogCategoryProjection } from "./domain/ports/catalog-category.projection.js";
import { AcceptDeliveryHandler } from "./application/commands/accept-delivery.handler.js";
import { GetPendingDeliveryHandler } from "./application/queries/get-pending-delivery.handler.js";
import { CatalogDeliveryRepository } from "./domain/ports/catalog-delivery.repository.js";
import { CatalogItemRepository } from "./domain/ports/catalog-item.repository.js";
import { CatalogVersionReader } from "./domain/ports/catalog-version.reader.js";
import { CatalogVersionRepository } from "./domain/ports/catalog-version.repository.js";
import { CanonicalPriceHistoryReader } from "./domain/ports/canonical-price-history.reader.js";
import { CatalogReader } from "./domain/ports/catalog.reader.js";
import { PrismaCatalogAdminReader } from "./infrastructure/prisma-catalog-admin.reader.js";
import { PrismaCatalogCategoryProjection } from "./infrastructure/prisma-catalog-category.projection.js";
import { PrismaCatalogDeliveryRepository } from "./infrastructure/prisma-catalog-delivery.repository.js";
import { PrismaCatalogItemRepository } from "./infrastructure/prisma-catalog-item.repository.js";
import {
  PrismaCatalogVersionReader,
  PrismaCatalogVersionRepository,
} from "./infrastructure/prisma-catalog-version.repository.js";
import { PrismaCanonicalPriceHistoryReader } from "./infrastructure/prisma-canonical-price-history.reader.js";
import { PrismaCatalogReader } from "./infrastructure/prisma-catalog.reader.js";
import { AdminCatalogController } from "./http/admin-catalog.controller.js";
import { AdminCatalogDeliveryController } from "./http/admin-catalog-delivery.controller.js";
import { AdminCatalogParityController } from "./http/admin-catalog-parity.controller.js";
import { OpsCatalogHealthController } from "./http/ops-catalog-health.controller.js";
import { CheckCatalogParityService } from "./application/check-catalog-parity.service.js";
import { CheckCatalogHealthService } from "./application/check-catalog-health.service.js";
import { CheckCatalogHealthHandler } from "./application/queries/check-catalog-health.handler.js";
import { CheckCatalogParityHandler } from "./application/queries/check-catalog-parity.handler.js";

/**
 * **Le catalogue de la plateforme** : ce que le PIM pousse, plus ce qu'on décide
 * ici (prix B2B, visibilité).
 *
 * Contexte à part entière, avec son agrégat. Toute écriture passe par une
 * méthode nommée de `CatalogItem` — jamais une colonne, jamais une primitive :
 * l'invariant « une décision commerciale survit à un push » vit dans le domaine,
 * pas dans un commentaire d'adaptateur.
 *
 * **Un port par question**, et jamais un port fourre-tout (ISP) — le compte n'est
 * pas la donnée intéressante, la question l'est :
 *
 * - `CatalogReader` sert la boutique (le vendable, prix résolu) ;
 * - `CatalogAdminReader` sert le paramétrage (tout, provenance comprise) ;
 * - `CatalogItemRepository` charge et enregistre des agrégats ;
 * - `CatalogCategoryProjection` tient le miroir des familles — nommé projection
 *   parce qu'aucune règle ne peut refuser d'y écrire ;
 * - `CanonicalPriceHistoryReader` relit le tarif à une date. Il n'a **pas** de
 *   jumeau en écriture : la trace est posée dans la transaction qui sauve
 *   l'article, au seul endroit par lequel les deux chemins de changement passent ;
 * - `CatalogDeliveryRepository` tient la boîte de réception ;
 * - `CatalogVersionRepository` / `CatalogVersionReader` posent et relisent les
 *   archives. Séparés parce que poser est un geste du catalogue et citer un
 *   geste des commandes — et parce qu'une version, une fois posée, n'a plus
 *   d'écriture du tout.
 */
@Module({
  // `B2bPlatformModule` pour le SEUL port de lecture du fil : le contrôle de
  // parité a besoin de savoir ce que le référentiel publierait. C'est le
  // franchissement `b2b → pim` que la matrice autorise — un port, jamais une
  // table.
  imports: [B2bPlatformModule],
  controllers: [
    AdminCatalogController,
    AdminCatalogParityController,
    AdminCatalogDeliveryController,
    // La porte MACHINE du contrôle de santé : même requête, serrure partagée.
    // Le workflow d'ops ne pouvait pas passer par la surface staff.
    OpsCatalogHealthController,
  ],
  providers: [
    IngestCatalogService,
    CheckCatalogParityService,
    // Le contrôle de SANTÉ : même comparateur, autre référent — la dernière
    // version validée, et non la projection du moment.
    CheckCatalogHealthService,
    CheckCatalogParityHandler,
    CheckCatalogHealthHandler,
    SetB2bPriceHandler,
    AlignOnPimPriceHandler,
    SetCatalogVisibilityHandler,
    SetCatalogFeaturedHandler,
    { provide: CatalogItemRepository, useClass: PrismaCatalogItemRepository },
    { provide: CatalogCategoryProjection, useClass: PrismaCatalogCategoryProjection },
    { provide: CatalogReader, useClass: PrismaCatalogReader },
    { provide: CatalogAdminReader, useClass: PrismaCatalogAdminReader },
    { provide: CanonicalPriceHistoryReader, useClass: PrismaCanonicalPriceHistoryReader },
    // La boîte de réception. Déclarée AVANT d'avoir un lecteur : l'ingestion
    // continue d'écrire les faits en direct, et la bascule est un déploiement
    // séparé, derrière un drapeau (§9 du document de conception).
    { provide: CatalogDeliveryRepository, useClass: PrismaCatalogDeliveryRepository },
    // Les versions : deux ports pour deux questions (ISP). Écrire n'a qu'un
    // geste — `append` —, parce qu'une archive ne se modifie pas ; lire sert la
    // passation d'une commande, qui n'écrit jamais de version.
    { provide: CatalogVersionRepository, useClass: PrismaCatalogVersionRepository },
    { provide: CatalogVersionReader, useClass: PrismaCatalogVersionReader },
    AcceptDeliveryHandler,
    GetPendingDeliveryHandler,
  ],
  // L'historique sort d'ici parce que l'écran de tarification en a besoin : sa
  // lecture datée doit rendre le tarif de CE jour-là, pas celui d'aujourd'hui.
  //
  // `IngestCatalogService` sort pour une raison différente : c'est l'entrée du
  // fil catalogue. Elle était une route ; elle est devenue un service que
  // l'adaptateur du port branche à la racine de composition. Exporter, ici,
  // c'est le geste explicite qui remplace le `@Public()` d'un contrôleur.
  exports: [
    CatalogReader,
    CatalogItemRepository,
    CanonicalPriceHistoryReader,
    IngestCatalogService,
    CheckCatalogParityService,
    // Exporté pour la racine de composition : c'est elle qui relie le driver du
    // canal, et celui-ci dépose désormais une arrivée quand la réception est
    // ouverte. Sans cet export, le module de composition ne peut pas construire
    // le driver — et l'échec est un refus de démarrage, pas une panne discrète.
    CatalogDeliveryRepository,
    // Exporté pour les commandes : une commande estampille la version sous
    // laquelle elle a été passée. En lecture seule — le contexte marchand ne
    // pose pas de version, il en cite une.
    CatalogVersionReader,
  ],
})
export class CatalogModule {}
