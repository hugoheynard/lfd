import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrderCutoffsModule } from "../order-cutoffs/order-cutoffs.module.js";
import { OrderCutoffsInForce } from "../order-cutoffs/domain/order-cutoffs-in-force.js";
import { SitesModule } from "../sites/sites.module.js";
import {
  SuggestionSiteChoicesReader,
  SuggestionSiteReader,
} from "./domain/ports/suggestion-site.reader.js";
import {
  SiteSuggestionSiteChoicesReader,
  SiteSuggestionSiteReader,
} from "./infrastructure/site-suggestion-site.reader.js";
import { ArchiveStaffSuggestionHandler } from "./application/commands/archive-staff-suggestion.handler.js";
import { CreateStaffSuggestionHandler } from "./application/commands/create-staff-suggestion.handler.js";
import { ReviseStaffSuggestionHandler } from "./application/commands/revise-staff-suggestion.handler.js";
import { SetStaffSuggestionActiveHandler } from "./application/commands/set-staff-suggestion-active.handler.js";
import { SetStaffSuggestionOrderHandler } from "./application/commands/set-staff-suggestion-order.handler.js";
import { GetStaffSuggestionOrderHandler } from "./application/queries/get-staff-suggestion-order.handler.js";
import { ListApplicableStaffSuggestionsHandler } from "./application/queries/list-applicable-staff-suggestions.handler.js";
import { ListStaffSuggestionChoicesHandler } from "./application/queries/list-staff-suggestion-choices.handler.js";
import { ListStaffSuggestionCountersHandler } from "./application/queries/list-staff-suggestion-counters.handler.js";
import { ListStaffSuggestionResultsHandler } from "./application/queries/list-staff-suggestion-results.handler.js";
import { ListStaffSuggestionAlertsHandler } from "./application/queries/list-staff-suggestion-alerts.handler.js";
import { NotServedCauseReader } from "./domain/ports/not-served-cause.reader.js";
import { CatalogNotServedCauseReader } from "./infrastructure/catalog-not-served-cause.reader.js";
import { ListStaffSuggestionsHandler } from "./application/queries/list-staff-suggestions.handler.js";
import { StaffSuggestionCounterReader } from "./domain/ports/staff-suggestion-counter.reader.js";
import { StaffSuggestionRuleReader } from "./domain/ports/staff-suggestion-rule.reader.js";
import { StaffSuggestionRuleRepository } from "./domain/ports/staff-suggestion-rule.repository.js";
import { SuggestionChoicesReader } from "./domain/ports/suggestion-choices.reader.js";
import { SuggestionFamilyReader } from "./domain/ports/suggestion-family.reader.js";
import { SuggestionOrderReader } from "./domain/ports/suggestion-order.reader.js";
import { SuggestionOrderWriter } from "./domain/ports/suggestion-order.writer.js";
import { AdminStaffSuggestionsController } from "./http/admin-staff-suggestions.controller.js";
import {
  CatalogSuggestionChoicesReader,
  CatalogSuggestionFamilyReader,
} from "./infrastructure/catalog-suggestion-catalogue.js";
import {
  PrismaStaffSuggestionRuleReader,
  PrismaStaffSuggestionRuleRepository,
} from "./infrastructure/prisma-staff-suggestion-rules.js";
import {
  PrismaSuggestionOrderReader,
  PrismaSuggestionOrderWriter,
} from "./infrastructure/prisma-suggestion-order.js";
import { RecordProductAudienceHandler } from "./application/commands/record-product-audience.handler.js";
import { ListProductAudienceCountersHandler } from "./application/queries/list-product-audience-counters.handler.js";
import { RecommendationFilter } from "./application/services/recommendation-filter.js";
import { AudienceCounterReader } from "./domain/ports/audience-counter.reader.js";
import { AudienceCounterWriter } from "./domain/ports/audience-counter.writer.js";
import { AudienceSkuReader } from "./domain/ports/audience-sku.reader.js";
import { RecommendationCutoffReader } from "./domain/ports/recommendation-cutoff.reader.js";
import { AdminProductAudienceController } from "./http/admin-product-audience.controller.js";
import { ShopProductAudienceController } from "./http/shop-product-audience.controller.js";
import { MyShopCartSuggestionsController } from "./http/my-shop-cart-suggestions.controller.js";
import { ShopCartSuggestionsController } from "./http/shop-cart-suggestions.controller.js";
import { MyShopProductSuggestionsController } from "./http/my-shop-product-suggestions.controller.js";
import { ShopProductSuggestionsController } from "./http/shop-product-suggestions.controller.js";
import { MyShopHomeSuggestionsController } from "./http/my-shop-home-suggestions.controller.js";
import { ShopHomeSuggestionsController } from "./http/shop-home-suggestions.controller.js";
import { ReadHomeSuggestionsHandler } from "./application/queries/read-home-suggestions.handler.js";
import { PreviewStaffSuggestionsHandler } from "./application/queries/preview-staff-suggestions.handler.js";
import { ReadProductSuggestionsHandler } from "./application/queries/read-product-suggestions.handler.js";
import { BoughtWithShowcase } from "./application/services/bought-with-showcase.js";
import { StaffSuggestionShowcase } from "./application/services/staff-suggestion-showcase.js";
import { ReadCartSuggestionsHandler } from "./application/queries/read-cart-suggestions.handler.js";
import { CartFamilyReader } from "./domain/ports/cart-family.reader.js";
import { SuggestedArticleReader } from "./domain/ports/suggested-article.reader.js";
import {
  CatalogCartFamilyReader,
  ShopSuggestedArticleReader,
} from "./infrastructure/catalog-cart-suggestions.js";
import { CatalogAudienceSkuReader } from "./infrastructure/catalog-audience-sku.reader.js";
import {
  PrismaAudienceCounterReader,
  PrismaAudienceCounterWriter,
  PrismaStaffSuggestionCounterReader,
} from "./infrastructure/prisma-audience-counters.js";

/**
 * **La recommandation de produits** — R0 : le filtre commun des suggestions et
 * les compteurs d'audience anonymes
 * (`documentation/recommandation-produit/plan-recommandation-de-produits.md`).
 *
 * Lit le catalogue servi (`CatalogModule`) et l'heure limite du commerce
 * (`OrderCutoffsModule`) par leurs ports. Écrit seul la table
 * `growth.product_audience_counters`. N'exporte rien : le calculé (R1, R2),
 * quand il existera, vivra ici et emploiera `RecommendationFilter` (vérifié
 * le 2026-10-18 : `exports` absent du module).
 *
 * Les suggestions DÉCIDÉES par le staff
 * (`documentation/recommandation-produit/suggestions-du-staff.md`) — l'agrégat `StaffSuggestionRule`, le réglage de
 * l'ordre, les règles applicables et leurs chiffres, sous `lfc_suggestions`.
 * Elles écrivent `staff_suggestion_rules` et `staff_suggestion_order_settings`.
 *
 * RS2, panier : `/shop/suggestions/cart` (et `/mine`) rend la suggestion
 * décidée d'un panier, au prix de la vitrine (`ShopCataloguePricing`) ; RS2,
 * fiche : `/shop/suggestions/product` (et `/mine`) celle de la fiche ouverte ;
 * RS7, accueil : `/shop/suggestions/home` (et `/mine`), « partout » seulement,
 * deux places. Les trois passent par `StaffSuggestionShowcase`.
 *
 * RS5 : `POST /admin/suggestions/preview` déroule la même vitrine pas à pas,
 * à l'un des trois emplacements, pour une clientèle et un jour choisis, et dit pourquoi chaque règle
 * s'affiche ou non.
 *
 * RS6 : `GET /admin/suggestions/results` rend, par règle, les chiffres
 * comptés et les commandées / chiffre d'affaires ESTIMÉS. Les ventes se
 * lisent par `SuggestedSkuSalesReader`, déclaré ici et implémenté par la
 * commande (`OrdersModule` l'exporte) : des totaux par jour et article,
 * jamais une commande ni un client.
 *
 * RS10 : `GET /admin/suggestions/alerts` signale les règles vivantes dont un
 * article ne se vend plus ; la cause d'un refus se lit au paramétrage du
 * catalogue (`CatalogAdminReader`, exporté par `CatalogModule`).
 *
 * RS8 : les conditions facultatives d'une règle (jours, heures, seuil et
 * familles du panier, points de retrait). Les points se lisent aux sites
 * (`SitesModule` exporte `SiteReader`).
 *
 * R2 : « souvent pris avec » au panier, après la place du staff
 * (`BoughtWithShowcase`). Les paires se lisent par `CoPurchaseReader`,
 * déclaré ici et implémenté par la commande (`OrdersModule` l'exporte) : des
 * comptes de paires sous un seuil d'anonymat, jamais un client.
 */
@Module({
  imports: [CatalogModule, OrderCutoffsModule, OrdersModule, SitesModule],
  controllers: [
    ShopProductAudienceController,
    AdminProductAudienceController,
    AdminStaffSuggestionsController,
    ShopCartSuggestionsController,
    MyShopCartSuggestionsController,
    ShopProductSuggestionsController,
    MyShopProductSuggestionsController,
    ShopHomeSuggestionsController,
    MyShopHomeSuggestionsController,
  ],
  providers: [
    RecordProductAudienceHandler,
    ListProductAudienceCountersHandler,
    RecommendationFilter,
    { provide: RecommendationCutoffReader, useExisting: OrderCutoffsInForce },
    { provide: AudienceSkuReader, useClass: CatalogAudienceSkuReader },
    { provide: AudienceCounterWriter, useClass: PrismaAudienceCounterWriter },
    { provide: AudienceCounterReader, useClass: PrismaAudienceCounterReader },
    { provide: StaffSuggestionRuleRepository, useClass: PrismaStaffSuggestionRuleRepository },
    { provide: StaffSuggestionRuleReader, useClass: PrismaStaffSuggestionRuleReader },
    { provide: SuggestionOrderReader, useClass: PrismaSuggestionOrderReader },
    { provide: SuggestionOrderWriter, useClass: PrismaSuggestionOrderWriter },
    { provide: SuggestionFamilyReader, useClass: CatalogSuggestionFamilyReader },
    { provide: SuggestionChoicesReader, useClass: CatalogSuggestionChoicesReader },
    { provide: SuggestionSiteReader, useClass: SiteSuggestionSiteReader },
    { provide: SuggestionSiteChoicesReader, useClass: SiteSuggestionSiteChoicesReader },
    CreateStaffSuggestionHandler,
    ReviseStaffSuggestionHandler,
    SetStaffSuggestionActiveHandler,
    ArchiveStaffSuggestionHandler,
    SetStaffSuggestionOrderHandler,
    ListStaffSuggestionsHandler,
    GetStaffSuggestionOrderHandler,
    ListApplicableStaffSuggestionsHandler,
    ListStaffSuggestionChoicesHandler,
    ListStaffSuggestionCountersHandler,
    ListStaffSuggestionResultsHandler,
    ListStaffSuggestionAlertsHandler,
    { provide: NotServedCauseReader, useClass: CatalogNotServedCauseReader },
    { provide: StaffSuggestionCounterReader, useClass: PrismaStaffSuggestionCounterReader },
    { provide: CartFamilyReader, useClass: CatalogCartFamilyReader },
    { provide: SuggestedArticleReader, useClass: ShopSuggestedArticleReader },
    StaffSuggestionShowcase,
    BoughtWithShowcase,
    ReadCartSuggestionsHandler,
    ReadProductSuggestionsHandler,
    ReadHomeSuggestionsHandler,
    PreviewStaffSuggestionsHandler,
  ],
})
export class RecommendationsModule {}
