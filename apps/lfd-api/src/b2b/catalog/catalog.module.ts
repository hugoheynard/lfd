import { Module } from "@nestjs/common";

import { PricerModule } from "../pricing/pricer.module.js";

import { RetracePricesFromReferentialHandler } from "./application/commands/retrace-prices-from-referential.handler.js";
import { CatalogPriceRetracer } from "./domain/ports/catalog-price-retracer.js";
import { PrismaCatalogPriceRetracer } from "./infrastructure/prisma-catalog-price-retracer.js";
import { SetMaskingHandler } from "./application/commands/set-masking.handler.js";
import { ApproveReviewHandler } from "./application/commands/approve-review.handler.js";
import { SetCatalogFeaturedHandler } from "./application/commands/set-catalog-featured.handler.js";
import { OnProductMediaChangedHandler } from "./application/handlers/on-product-media-changed.handler.js";
import { OnCatalogProductChangedHandler } from "./application/handlers/on-catalog-product-changed.handler.js";
import { OnCatalogCategoryChangedHandler } from "./application/handlers/on-catalog-category-changed.handler.js";
import { OnCatalogRulesChangedHandler } from "./application/handlers/on-catalog-rules-changed.handler.js";
import { OrderLimitsRefresher } from "./application/order-limits-refresher.service.js";
import { CatalogOrderLimits } from "./domain/ports/catalog-order-limits.js";
import { CatalogRulesProjection } from "./domain/ports/catalog-rules.projection.js";
import { PrismaCatalogOrderLimits } from "./infrastructure/prisma-catalog-order-limits.js";
import { PrismaCatalogRulesProjection } from "./infrastructure/prisma-catalog-rules.projection.js";
import { CatalogProductFactsProjection } from "./domain/ports/catalog-product-facts.projection.js";
import { CatalogFamilyFactsProjection } from "./domain/ports/catalog-family-facts.projection.js";
import { PrismaCatalogProductFactsProjection } from "./infrastructure/prisma-catalog-product-facts.projection.js";
import { PrismaCatalogFamilyFactsProjection } from "./infrastructure/prisma-catalog-family-facts.projection.js";
import { CatalogAdminReader } from "./domain/ports/catalog-admin.reader.js";
import { CatalogCategoryProjection } from "./domain/ports/catalog-category.projection.js";
import { CatalogItemRepository } from "./domain/ports/catalog-item.repository.js";
import { CatalogVisualsProjection } from "./domain/ports/catalog-visuals.projection.js";
import { CanonicalPriceHistoryModule } from "./canonical-price-history.module.js";
import { CatalogReader } from "./domain/ports/catalog.reader.js";
import { ProductCatalogReader } from "./domain/ports/product-catalog.reader.js";
import { CatalogBackedProductCatalog } from "./infrastructure/catalog-backed-product-catalog.js";
import { PrismaCatalogAdminReader } from "./infrastructure/prisma-catalog-admin.reader.js";
import { PrismaCatalogCategoryProjection } from "./infrastructure/prisma-catalog-category.projection.js";
import { PrismaCatalogItemRepository } from "./infrastructure/prisma-catalog-item.repository.js";
import { PrismaCatalogVisualsProjection } from "./infrastructure/prisma-catalog-visuals.projection.js";
import { PrismaCatalogReader } from "./infrastructure/prisma-catalog.reader.js";
import { AdminCatalogController } from "./http/admin-catalog.controller.js";
import { ShopCatalogueController } from "./http/shop-catalogue.controller.js";
import { ShopFeaturedController } from "./http/shop-featured.controller.js";
import { ReadShopCatalogueHandler } from "./application/queries/read-shop-catalogue.js";
import { ReadShopFeaturedHandler } from "./application/queries/read-shop-featured.handler.js";
import { SaleOperations } from "./application/sale-operations.service.js";
import { ArticleSaleUnits } from "./application/article-sale-units.service.js";
import { PrismaSaleReferenceUsage } from "./infrastructure/prisma-sale-reference-usage.js";
import { ShopCataloguePricing } from "./application/shop-catalogue-pricing.service.js";
import { ShopOrderCutoffsReader } from "./domain/ports/shop-order-cutoffs.reader.js";
import { OrderCutoffsInForce } from "../order-cutoffs/domain/order-cutoffs-in-force.js";
import { OrderCutoffsInForceModule } from "../order-cutoffs/order-cutoffs-in-force.module.js";
import { ExportCatalogCsvHandler } from "./application/queries/export-catalog-csv.handler.js";
import { GetCatalogSummaryHandler } from "./application/queries/get-catalog-summary.handler.js";
import { GetPublishedCatalogHandler } from "./application/queries/get-published-catalog.handler.js";
import { PublishedCatalogReader } from "./domain/ports/published-catalog.reader.js";
import { PrismaPublishedCatalogReader } from "./infrastructure/prisma-published-catalog.reader.js";
import { ListCatalogHandler } from "./application/queries/list-catalog.handler.js";
import { CatalogOperationsReader } from "./domain/ports/catalog-operations.reader.js";
import { ReceivedOperationsReader } from "./domain/ports/received-operations.reader.js";
import { CatalogColdReader } from "./domain/ports/catalog-cold.reader.js";
import { WithdrawnShopSkusReader } from "./domain/ports/withdrawn-shop-skus.reader.js";
import { PrismaWithdrawnShopSkusReader } from "./infrastructure/prisma-withdrawn-shop-skus.reader.js";
import { CatalogPricePerKgReader } from "./domain/ports/catalog-price-per-kg.reader.js";
import { PrismaCatalogOperationsReader } from "./infrastructure/prisma-catalog-operations.reader.js";
import { PrismaReceivedOperationsReader } from "./infrastructure/prisma-received-operations.reader.js";
import { PrismaCatalogColdReader } from "./infrastructure/prisma-catalog-cold.reader.js";
import { PrismaCatalogPricePerKgReader } from "./infrastructure/prisma-catalog-price-per-kg.reader.js";
import { OrderLineClassificationReader } from "../orders/domain/ports/order-line-classification.reader.js";
import { PrismaOrderLineClassificationReader } from "./infrastructure/prisma-order-line-classification.reader.js";

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
 * - la boîte de réception, les versions, la parité, la santé et la surcharge
 *   des opérations reçues sont parties en X2 (2026-10-17) : les faits du
 *   référentiel s'appliquent fiche par fiche, et les opérations s'écrivent au
 *   commerce. Leurs tables restent en base.
 */
@Module({
  // `PricerModule` parce que la vitrine TARIFE depuis le 2026-09-09 : elle
  // servait le canonique, donc une promotion publique n'apparaissait qu'au
  // panier (R22). Elle passe par LA porte du prix, et non par le chargeur —
  // c'est ce qui a fait retirer les entrées par SKU de la porte, qui la
  // faisaient dépendre du catalogue et fermaient le cycle.
  // `OrderCutoffsInForceModule` : la vitrine ne montre la limite d'un article
  // que si elle est plus stricte que la règle générale (§4 de
  // `limites-de-commande/limites-produit.md`, 2026-10-21).
  imports: [PricerModule, CanonicalPriceHistoryModule, OrderCutoffsInForceModule],
  controllers: [
    AdminCatalogController,
    // La vitrine, sans jeton : on visite d'abord, on s'identifie pour régler.
    ShopCatalogueController,
    ShopFeaturedController,
  ],
  providers: [
    // L'abonné qui projette les visuels d'une fiche sans attendre un push.
    // Il n'importe pas le référentiel : il reçoit un fait du bus.
    OnProductMediaChangedHandler,
    OnCatalogProductChangedHandler,
    OnCatalogCategoryChangedHandler,
    // Les règles globales du référentiel (lot 2b) : rangées, puis descendues.
    OnCatalogRulesChangedHandler,
    OrderLimitsRefresher,
    ListCatalogHandler,
    GetCatalogSummaryHandler,
    GetPublishedCatalogHandler,
    ExportCatalogCsvHandler,
    ReadShopCatalogueHandler,
    ReadShopFeaturedHandler,
    // 🔴 LA logique de prix de la vitrine, pour les DEUX routes. Exportée plus
    // bas : la route reconnue l'appelle avec un `companyId`, la publique avec
    // `null`, et c'est la seule différence entre elles.
    ShopCataloguePricing,
    { provide: ShopOrderCutoffsReader, useExisting: OrderCutoffsInForce },
    // Le prix ne se décide plus ici (lot D, 2026-10-15) : il se RETRACE
    // depuis le référentiel, une fois au déploiement.
    RetracePricesFromReferentialHandler,
    { provide: CatalogPriceRetracer, useClass: PrismaCatalogPriceRetracer },
    SetMaskingHandler,
    ApproveReviewHandler,
    SetCatalogFeaturedHandler,
    { provide: CatalogItemRepository, useClass: PrismaCatalogItemRepository },
    { provide: CatalogVisualsProjection, useClass: PrismaCatalogVisualsProjection },
    { provide: CatalogProductFactsProjection, useClass: PrismaCatalogProductFactsProjection },
    { provide: CatalogFamilyFactsProjection, useClass: PrismaCatalogFamilyFactsProjection },
    { provide: CatalogRulesProjection, useClass: PrismaCatalogRulesProjection },
    { provide: CatalogOrderLimits, useClass: PrismaCatalogOrderLimits },
    { provide: CatalogCategoryProjection, useClass: PrismaCatalogCategoryProjection },
    { provide: CatalogReader, useClass: PrismaCatalogReader },
    // 🔴 **L'autorité de prix du checkout**, ramenée là d'où vient sa donnée le
    // 2026-09-09. Elle vivait dans `OrdersModule`, alors que son unique
    // adaptateur ne fait que TRADUIRE `CatalogReader` — deux ports empilés, dont
    // l'autoritaire logé dans le contexte qui n'en est pas la source. `pricing`
    // importait `orders` neuf fois pour une donnée qui n'y est pas.
    { provide: ProductCatalogReader, useClass: CatalogBackedProductCatalog },
    { provide: CatalogAdminReader, useClass: PrismaCatalogAdminReader },
    { provide: PublishedCatalogReader, useClass: PrismaPublishedCatalogReader },
    // Les opérations datées, deux lecteurs pour deux questions (ISP) :
    // l'éditeur de vitrine voit tout le miroir, les vendeurs du lot 3 ne
    // voient que ce qui s'applique.
    { provide: ReceivedOperationsReader, useClass: PrismaReceivedOperationsReader },
    { provide: CatalogOperationsReader, useClass: PrismaCatalogOperationsReader },
    // Ce que les vendeurs par SKU produit appliquent (lot 3) : la caisse, le
    // devis, les jours proposés, les abonnements.
    SaleOperations,
    // Les articles au poids, que les abonnements, les engagements et le
    // réassort refusent (`vente-au-poids.md`, P3).
    ArticleSaleUnits,
    // Le froid des produits (fil v12, lot 4 bis) : un lecteur à lui, que seul
    // le relais vers la livraison lit.
    { provide: CatalogColdReader, useClass: PrismaCatalogColdReader },
    // Les articles retirés, que les éditeurs de décisions tarifaires nomment
    // dans leur refus (L5 de `plan-pro-voit-les-declinaisons.md`).
    { provide: WithdrawnShopSkusReader, useClass: PrismaWithdrawnShopSkusReader },
    { provide: CatalogPricePerKgReader, useClass: PrismaCatalogPricePerKgReader },
    // Le port que la commande DÉCLARE (V4 du plan des exclusions), implémenté
    // ici sur les articles : la table appartient au catalogue.
    { provide: OrderLineClassificationReader, useClass: PrismaOrderLineClassificationReader },
    // Ce qui fige l'unité de vente d'une déclinaison : le port est au
    // référentiel, `appBootstrap/` le relie (`plan-changer-l-unite-de-vente.md`, § 8).
    PrismaSaleReferenceUsage,
  ],
  // L'historique sort d'ici parce que l'écran de tarification en a besoin : sa
  // lecture datée doit rendre le tarif de CE jour-là, pas celui d'aujourd'hui.
  exports: [
    CatalogReader,
    // Pour la caisse, le tarificateur et la projection : tous trois résolvent un
    // SKU avant de tarifer, et aucun n'a de raison de passer par `orders` pour ça.
    ProductCatalogReader,
    // Pour le relais des produits vers la livraison (lot 4 bis) : le froid.
    CatalogColdReader,
    // Pour la tarification : une décision ne vise pas un article retiré (L5).
    WithdrawnShopSkusReader,
    // Pour la caisse et le devis : le rangement d'un SKU, que la remise de
    // retrait juge (plan des exclusions, V4).
    OrderLineClassificationReader,
    // Pour `orders/`, qui sert la même vitrine à un client reconnu. Le sens est
    // le seul possible : `OrdersModule` importe déjà `CatalogModule`, et
    // l'inverse serait un cycle — c'est aussi pourquoi la table des rayons est
    // descendue ici.
    ShopCataloguePricing,
    // Les opérations datées, pour la caisse, le devis, les jours et les
    // abonnements (lot 3 du plan des opérations datées).
    SaleOperations,
    ArticleSaleUnits,
    PrismaSaleReferenceUsage,
    CatalogItemRepository,
    // Le MODULE, et non le provider : `CatalogModule` ne le fournit plus depuis
    // que l'historique a son propre module — Nest refuse d'exporter un provider
    // dont il n'est pas le propriétaire, et il le dit au BOOT, pas à la
    // compilation.
    CanonicalPriceHistoryModule,
    // Pour l'éditeur de vitrine : il désigne des rayons et des articles, et
    // les lit par ce port plutôt que par la route du paramétrage, que la
    // communication ne peut pas ouvrir. Son adaptateur n'en garde ni prix ni
    // réglages.
    CatalogAdminReader,
    // Pour les vendeurs du lot 3 (`operationAccess`, D4-D6) : les opérations
    // appliquées et les articles qui ne se vendent que par elles — et pour la
    // vitrine publique, qui éteint une annonce avec son opération (lot 5).
    CatalogOperationsReader,
    // Pour l'éditeur de vitrine (lot 5) : les opérations reçues qu'une annonce
    // peut désigner, et les rayons `op:<key>` qu'il compose.
    ReceivedOperationsReader,
  ],
})
export class CatalogModule {}
