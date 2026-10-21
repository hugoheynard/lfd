import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { DeliveryAvailabilityModule } from "../delivery-availability/delivery-availability.module.js";
import { OrderOpeningModule } from "../order-opening/order-opening.module.js";
import { DeliveryZonesModule } from "../delivery-zones/delivery-zones.module.js";
import { OrderCutoffsInForce } from "../order-cutoffs/domain/order-cutoffs-in-force.js";
import { OrderCutoffsModule } from "../order-cutoffs/order-cutoffs.module.js";
import { OrderWaiversModule } from "../order-waivers/order-waivers.module.js";
import { PlatformContentModule } from "../content/content.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PricerModule } from "../pricing/pricer.module.js";
import { PickupAddressesModule } from "../pickup-addresses/pickup-addresses.module.js";
import { MarkOrderFulfilledHandler } from "./application/commands/mark-order-fulfilled.handler.js";
import { MarkOrderReadyHandler } from "./application/commands/mark-order-ready.handler.js";
import { SendGuestOrderNotice } from "./application/handlers/send-guest-order-notice.handler.js";
import { SendGuestOrderNoticeOnPaid } from "./application/handlers/send-guest-order-notice-on-paid.handler.js";
import { SendOrderPlacedMail } from "./application/handlers/send-order-placed-mail.handler.js";
import { SendOrderReadyMail } from "./application/handlers/send-order-ready-mail.handler.js";
import { DeliveryEnRouteMail } from "./application/services/delivery-en-route-mail.service.js";
import { SendOrderSettledMail } from "./application/handlers/send-order-settled-mail.handler.js";
import { RingFailedProSettlement } from "./application/handlers/ring-failed-pro-settlement.handler.js";
import { SendPaymentExpiredMail } from "./application/handlers/send-payment-expired-mail.handler.js";
import { FailedSettlementReader } from "./domain/ports/failed-settlement.reader.js";
import { PrismaFailedSettlementReader } from "./infrastructure/prisma-failed-settlement.reader.js";
import { OrderNoticeSummaryReader } from "./domain/ports/order-notice-summary.reader.js";
import { PrismaOrderNoticeSummaryReader } from "./infrastructure/prisma-order-notice-summary.reader.js";
import { UnsettledSettlementReader } from "./domain/ports/unsettled-settlement.reader.js";
import { PrismaUnsettledSettlementReader } from "./infrastructure/prisma-unsettled-settlement.reader.js";
import { UnpaidLinkOrderReader } from "./domain/ports/unpaid-link-order.reader.js";
import { PrismaUnpaidLinkOrderReader } from "./infrastructure/prisma-unpaid-link-order.reader.js";
import { SendSettlementRemindersHandler } from "./application/commands/send-settlement-reminders.handler.js";
import { SettlementRemindersController } from "./http/admin-settlement-reminders.controller.js";
import { UnsettledShopOrdersController } from "./http/admin-unsettled-shop-orders.controller.js";
import { ShopOrdersController } from "./http/shop-orders.controller.js";
import { ExpireUnsettledShopOrdersHandler } from "./application/commands/expire-unsettled-shop-orders.handler.js";
import { ReplaceUnsettledShopOrders } from "./application/handlers/replace-unsettled-shop-orders.handler.js";
import { UnsettledShopOrderExpiry } from "./application/services/unsettled-shop-order-expiry.service.js";
import { UnsettledShopOrderReader } from "./domain/ports/unsettled-shop-order.reader.js";
import { UnsettledShopOrderCanceller } from "./domain/ports/unsettled-shop-order.canceller.js";
import { PrismaUnsettledShopOrderReader } from "./infrastructure/prisma-unsettled-shop-order.reader.js";
import { PrismaUnsettledShopOrderCanceller } from "./infrastructure/prisma-unsettled-shop-order.canceller.js";
import { CancelledOrderPaymentReader } from "./domain/ports/cancelled-order-payment.reader.js";
import { PrismaCancelledOrderPaymentReader } from "./infrastructure/prisma-cancelled-order-payment.reader.js";
import { ORDER_REFUND_CONTROLLERS, ORDER_REFUND_PROVIDERS } from "./order-refund.providers.js";
import {
  CUSTOMER_CANCELLATION_CONTROLLERS,
  CUSTOMER_CANCELLATION_PROVIDERS,
} from "./customer-cancellation.providers.js";
import { OrderCancellation } from "./application/services/order-cancellation.service.js";
import { RecordOrderRefundHandler } from "./application/commands/record-order-refund.handler.js";
import { RingRefundRejected } from "./application/handlers/ring-refund-rejected.handler.js";
import { OrderRefundRepository } from "./domain/ports/order-refund.repository.js";
import { PrismaOrderRefundRepository } from "./infrastructure/prisma-order-refund.repository.js";
import { PendingSettlementSweep } from "./application/services/pending-settlement-sweep.service.js";
import { SendPaymentFailedMail } from "./application/handlers/send-payment-failed-mail.handler.js";
import { OrderPlacedMail } from "./application/services/order-placed-mail.service.js";
import { OrderReadyMail } from "./application/services/order-ready-mail.service.js";
import { SendHandoverReminderHandler } from "./application/commands/send-handover-reminder.handler.js";
import { BrandLogoSource } from "../../platform/brand/brand-logo.source.js";
import { BrandModule } from "../../platform/brand/brand.module.js";
import { AppConfig } from "../../platform/config/app-config.js";
import { OrderMailOrigins } from "./domain/ports/order-mail-origins.js";
import { OrderPaymentLinkReader } from "./domain/ports/order-payment-link.reader.js";
import { PrismaOrderPaymentLinkReader } from "./infrastructure/prisma-order-payment-link.reader.js";
import { AdminOrderPaymentLinksController } from "./http/admin-order-payment-links.controller.js";
import { ListOrdersAwaitingPaymentHandler } from "./application/queries/list-orders-awaiting-payment.handler.js";
import { ResendOrderPaymentLinkHandler } from "./application/commands/resend-order-payment-link.handler.js";
import { OrderRecipientReader } from "./domain/ports/order-recipient.reader.js";
import { CompletedOrderReader } from "./domain/ports/completed-order.reader.js";
import { PrismaCompletedOrderReader } from "./infrastructure/prisma-completed-order.reader.js";
import { VoucherOrderReader } from "./domain/ports/voucher-order.reader.js";
import { PrismaVoucherOrderReader } from "./infrastructure/prisma-voucher-order.reader.js";
import { PrismaOrderRecipientReader } from "./infrastructure/prisma-order-recipient.reader.js";
import { AbandonOrderHandler } from "./application/commands/abandon-order.handler.js";
import { CancelOrderHandler } from "./application/commands/cancel-order.handler.js";
import { VoucherRestitutionRefusal } from "./application/services/voucher-restitution-refusal.js";
import { CancellationRule } from "./application/services/cancellation-rule.js";
import { SendOrderCancelledMail } from "./application/handlers/send-order-cancelled-mail.handler.js";
import { CancellationSubjectReader } from "./domain/ports/cancellation-subject.reader.js";
import { OrderCancellationRepository } from "./domain/ports/order-cancellation.repository.js";
import { PrismaCancellationSubjectReader } from "./infrastructure/prisma-cancellation-subject.reader.js";
import { PrismaOrderCancellationRepository } from "./infrastructure/prisma-order-cancellation.repository.js";
import { ConfirmOrderPaymentHandler } from "./application/commands/confirm-order-payment.handler.js";
import { DiscardOrderDraftHandler } from "./application/commands/discard-order-draft.handler.js";
import { PlaceOrderForCustomerHandler } from "./application/commands/place-order-for-customer.handler.js";
import { SaveOrderDraftHandler } from "./application/commands/save-order-draft.handler.js";
import { SaveShopCartHandler } from "./application/commands/save-shop-cart.handler.js";
import { PlaceOrderHandler } from "./application/commands/place-order.handler.js";
import { QuoteOrderHandler } from "./application/queries/quote-order.handler.js";
import { QuoteShopCartHandler } from "./application/queries/quote-shop-cart.handler.js";
import { QuoteMyShopCartHandler } from "./application/queries/quote-my-shop-cart.handler.js";
import { ShopCartQuoting } from "./application/services/shop-cart-quoting.service.js";
import { OrderNumberReader } from "./domain/ports/order-number.reader.js";
import { PrismaOrderNumberReader } from "./infrastructure/prisma-order-number.reader.js";
import { CartAdjustments } from "./application/services/cart-adjustments.service.js";
import { CustomerAudiences } from "./application/services/customer-audiences.service.js";
import { OrderIntake } from "./application/services/order-intake.service.js";
import { CompanyStatusReader } from "./domain/ports/company-status.reader.js";
import { PreferredPickupReader } from "./domain/ports/preferred-pickup.reader.js";
import { ShopCartController } from "./http/shop-cart.controller.js";
import { ShopQuoteController } from "./http/shop-quote.controller.js";
import { OrderOperations } from "./application/services/order-operations.service.js";
import { OrderDrafting } from "./application/services/order-drafting.service.js";
import { OrderPlanGate } from "./application/services/order-plan-gate.service.js";
import { SameDayOrderReader } from "./domain/ports/same-day-order.reader.js";
import { SettingsSameDayOrderReader } from "./infrastructure/settings-same-day-order.reader.js";
import { OrderLinePricing } from "./application/services/order-line-pricing.service.js";
import { GetAdminOrderHandler } from "./application/queries/get-admin-order.handler.js";
import { GetOrderHandoverProofImageHandler } from "./application/queries/get-order-handover-proof-image.handler.js";
import { GetOrderHandoverProofHandler } from "./application/queries/get-order-handover-proof.handler.js";
import { GetOrderDraftHandler } from "./application/queries/get-order-draft.handler.js";
import { GetShopCartHandler } from "./application/queries/get-shop-cart.handler.js";
import { ListCatalogHandler } from "./application/queries/list-catalog.handler.js";
import { ListCustomerSkusHandler } from "./application/queries/list-customer-skus.handler.js";
import { GetPackingHandler } from "./application/queries/get-packing.handler.js";
import { GetOrderPaymentHandler } from "./application/queries/get-order-payment.handler.js";
import { GetOrderHandler } from "./application/queries/get-order.handler.js";
import { GetOrderSheetHandler } from "./application/queries/get-order-sheet.handler.js";
import { GetAdminOrderSheetPdfHandler } from "./application/queries/get-admin-order-sheet-pdf.handler.js";
import { GetOrderSheetSpecimenHandler } from "./application/queries/get-order-sheet-specimen.handler.js";
import { AdminOrderSheetSpecimensController } from "./http/admin-order-sheet-specimens.controller.js";
import { GetOrderSheetPdfHandler } from "./application/queries/get-order-sheet-pdf.handler.js";
import { OrderSheetArchive } from "./application/services/order-sheet-archive.service.js";
import { OrderSheetAttachment } from "./application/services/order-sheet-attachment.service.js";
import { OrderSheetLogoSource } from "./domain/ports/order-sheet-logo.source.js";
import { OrderSheetColorSource } from "./domain/ports/order-sheet-color.source.js";
import { PrismaOrderSheetColorSource } from "./infrastructure/prisma-order-sheet-color.source.js";
import { MailDeliveryEnRoute } from "./application/handlers/mail-delivery-en-route.handler.js";
import { OnProductionDayClosed } from "./application/handlers/on-production-day-closed.handler.js";
import { OnProductionDayReopened } from "./application/handlers/on-production-day-reopened.handler.js";
import { OrderPlanRelease } from "./domain/ports/order-plan-release.js";
import { PrismaOrderPlanRelease } from "./infrastructure/prisma-order-plan-release.js";
import { OnOrderHandedOver } from "./application/handlers/on-order-handed-over.handler.js";
import { OnPackingOrderPacked } from "./application/handlers/on-packing-order-packed.handler.js";
import { PrismaDayOrdersSource } from "./infrastructure/prisma-day-orders.source.js";
import { PrismaSiteDaySettingsReader } from "./infrastructure/prisma-site-day-settings.reader.js";
import { DayOrdersSource } from "./domain/ports/day-orders.source.js";
import { SiteDaySettingsReader } from "./domain/ports/site-day-settings.reader.js";
import { SiteDeadlines } from "./application/services/site-deadlines.service.js";
import { SitedDayOrders } from "./application/services/sited-day-orders.service.js";
import { CommerceTransferSites } from "./application/services/commerce-transfer-sites.service.js";
import { DueThresholds } from "./application/services/due-thresholds.service.js";
import { DeadlineOrdersReader } from "./domain/ports/deadline-orders.reader.js";
import { PrismaDeadlineOrdersReader } from "./infrastructure/prisma-deadline-orders.reader.js";
import { PrismaHandoverSubjectReader } from "./infrastructure/prisma-handover-subject.reader.js";
import { PrismaPendingOrdersReader } from "./infrastructure/prisma-pending-orders.reader.js";
import { GetProductionBatchHandler } from "./application/queries/get-production-batch.handler.js";
import { ListAdminOrdersHandler } from "./application/queries/list-admin-orders.handler.js";
import { ListCompanyOrdersHandler } from "./application/queries/list-company-orders.handler.js";
import { SummarizeCompanyOrdersHandler } from "./application/queries/summarize-company-orders.handler.js";
import { ListPersonalOrdersHandler } from "./application/queries/list-personal-orders.handler.js";
import { CustomerSkuReader } from "./domain/ports/customer-sku.reader.js";
import { OrderCutoffReader } from "./domain/ports/order-cutoff.reader.js";
import { CompanyOrderListReader } from "./domain/ports/company-order-list.reader.js";
import { CompanyOrderSummaryReader } from "./domain/ports/company-order-summary.reader.js";
import { OrderAccessReader } from "./domain/ports/order-access.reader.js";
import { OrderGuardReader } from "./domain/ports/order-guard.reader.js";
import { OrderPayerReader } from "./domain/ports/order-payer.reader.js";
import { OrderReader } from "./domain/ports/order.reader.js";
import { AdminOrderListReader } from "./domain/ports/admin-order-list.reader.js";
import { AdminOrderAuthorReader } from "./domain/ports/admin-order-author.reader.js";
import { OrderHistoryReader } from "./domain/ports/order-history.reader.js";
import { PrismaOrderHistoryReader } from "./infrastructure/prisma-order-history.reader.js";
import { GetAdminOrderHistoryHandler } from "./application/queries/get-admin-order-history.handler.js";
import { PrismaAdminOrderListReader } from "./infrastructure/prisma-admin-order-list.reader.js";
import { PrismaAdminOrderAuthorReader } from "./infrastructure/prisma-admin-order-author.reader.js";
import { OrderDraftRepository } from "./domain/ports/order-draft.repository.js";
import { ShopCartRepository } from "./domain/ports/shop-cart.repository.js";
import { OrderIdempotencyStore } from "./domain/ports/order-idempotency.store.js";
import { OrderRepository } from "./domain/ports/order.repository.js";
import { PrismaCustomerSkuReader } from "./infrastructure/prisma-customer-sku.reader.js";
import { PrismaSuggestedSkuSalesReader } from "./infrastructure/prisma-suggested-sku-sales.reader.js";
import { SuggestedSkuSalesReader } from "../recommendations/domain/ports/suggested-sku-sales.reader.js";
import { CoPurchaseReader } from "../recommendations/domain/ports/co-purchase.reader.js";
import { PrismaCoPurchaseReader } from "./infrastructure/prisma-co-purchase.reader.js";
import { PurchaseHistoryReader } from "../recommendations/domain/ports/purchase-history.reader.js";
import { PrismaPurchaseHistoryReader } from "./infrastructure/prisma-purchase-history.reader.js";
import { AudienceOrderReader } from "../audiences/domain/ports/audience-order.reader.js";
import { PrismaAudienceOrderReader } from "./infrastructure/prisma-audience-order.reader.js";
import { PrismaCompanyOrderListReader } from "./infrastructure/prisma-company-order-list.reader.js";
import { PrismaCompanyOrderSummaryReader } from "./infrastructure/prisma-company-order-summary.reader.js";
import { PrismaOrderAccessReader } from "./infrastructure/prisma-order-access.reader.js";
import { PrismaOrderGuardReader } from "./infrastructure/prisma-order-guard.reader.js";
import { PrismaPreferredPickupReader } from "./infrastructure/prisma-preferred-pickup.reader.js";
import { PrismaOrderPayerReader } from "./infrastructure/prisma-order-payer.reader.js";
import { PrismaOrderDraftRepository } from "./infrastructure/prisma-order-draft.repository.js";
import { PrismaShopCartRepository } from "./infrastructure/prisma-shop-cart.repository.js";
import { PrismaOrderReader } from "./infrastructure/prisma-order.reader.js";
import { PrismaOrderIdempotencyStore } from "./infrastructure/prisma-order-idempotency.store.js";
import { PrismaShopOrderIdempotencyStore } from "./infrastructure/prisma-shop-order-idempotency.store.js";
import { PrismaGuestBuyerRegistrar } from "./infrastructure/prisma-guest-buyer.registrar.js";
import { GuestBuyerRegistrar } from "./domain/ports/guest-buyer.registrar.js";
import { PrismaGuestOrderNoticeReader } from "./infrastructure/prisma-guest-order-notice.reader.js";
import { GuestOrderNoticeReader } from "./domain/ports/guest-order-notice.reader.js";
import { ShopOrderIdempotencyStore } from "./domain/ports/shop-order-idempotency.store.js";
import { PlaceShopOrderHandler } from "./application/commands/place-shop-order.handler.js";
import { PrismaOrderRepository } from "./infrastructure/prisma-order.repository.js";
import { CompanyOrdersController } from "./http/company-orders.controller.js";
import { AdminCatalogController } from "./http/admin-catalog.controller.js";
import { AdminOrderDraftsController } from "./http/admin-order-drafts.controller.js";
import { AdminOfferedPickupsController } from "./http/admin-offered-pickups.controller.js";
import { MyPickupAddressesController } from "./http/my-pickup-addresses.controller.js";
import { ListCustomerPickupsHandler } from "./application/queries/list-customer-pickups.handler.js";
import { DeliveryDefaultsReader } from "./domain/ports/delivery-defaults.reader.js";
import { PrismaDeliveryDefaultsReader } from "./infrastructure/prisma-delivery-defaults.reader.js";
import { AdminOrdersController } from "./http/admin-orders.controller.js";
import { AdminProductionController } from "./http/admin-production.controller.js";
import { OrdersController } from "./http/orders.controller.js";
import { MyShopCatalogueController } from "./http/my-shop-catalogue.controller.js";
import { MyShopQuoteController } from "./http/my-shop-quote.controller.js";
import { ReadMyShopCatalogueHandler } from "./application/queries/read-my-shop-catalogue.js";
import { GetDaySupervisionHandler } from "./application/queries/get-day-supervision.handler.js";
import { DaySupervisionReader } from "./domain/ports/day-supervision.reader.js";
import { PrismaDaySupervisionReader } from "./infrastructure/prisma-day-supervision.reader.js";
import { GetOrderDayVersionHandler } from "./application/queries/get-order-day-version.handler.js";
import { PruneOrderDayChangesHandler } from "./application/commands/prune-order-day-changes.handler.js";
import { OrderDayVersionReader } from "./domain/ports/order-day-version.reader.js";
import { AdminOrderSalesTermsController } from "./http/admin-order-sales-terms.controller.js";
import { OrderSalesTermsRecordReader } from "./domain/ports/order-sales-terms-record.reader.js";
import { PrismaOrderSalesTermsRecordReader } from "./infrastructure/prisma-order-sales-terms-record.reader.js";
import { GetOrderSalesTermsHandler } from "./application/queries/get-order-sales-terms.handler.js";
import { OrderDayChangePruner } from "./domain/ports/order-day-change.pruner.js";
import { PrismaOrderDayVersionReader } from "./infrastructure/prisma-order-day-version.reader.js";
import { PrismaOrderDayChangePruner } from "./infrastructure/prisma-order-day-change.pruner.js";
import { AdminSupervisionController } from "./http/admin-supervision.controller.js";

/**
 * Contexte **commandes** : le checkout (panier → `Order` en Postgres) et la
 * liste des commandes d'une entreprise.
 *
 * Autonome : il lit ses garde-fous (rôle + statut d'entreprise) via son propre
 * port plutôt que de dépendre des internes du contexte `account`. Les prix sont
 * résolus par un catalogue semé (jetable jusqu'au sync PIM).
 *
 * Importe `CatalogModule` pour une seule raison, et **temporaire** : le
 * contrôleur de parité compare l'autorité de prix en place au catalogue reçu.
 * Les deux disparaissent ensemble à la bascule.
 */
@Module({
  imports: [
    BrandModule,
    PickupAddressesModule,
    DeliveryZonesModule,
    // À qui la livraison est proposée : `CartAdjustments` le refuse au serveur.
    DeliveryAvailabilityModule,
    OrderOpeningModule,
    OrderCutoffsModule,
    OrderWaiversModule,
    // Les CGV en vigueur, figées à la passation (plan des CGV, C4′).
    PlatformContentModule,
    PaymentsModule,
    CatalogModule,
    // La caisse passe par LA porte du prix depuis le 2026-09-09, plus par le
    // chargeur : elle avait sa propre chorégraphie, comme les trois autres
    // appelants, et c'est ainsi que deux d'entre eux ont oublié un étage.
    PricerModule,
  ],
  controllers: [
    ...ORDER_REFUND_CONTROLLERS,
    ...CUSTOMER_CANCELLATION_CONTROLLERS,
    OrdersController,
    MyShopCatalogueController,
    MyShopQuoteController,
    CompanyOrdersController,
    AdminOrdersController,
    AdminOrderSalesTermsController,
    AdminProductionController,
    AdminOrderDraftsController,
    // Les points de retrait par clientèle (2026-10-15) : la caisse les filtre,
    // la liste aussi — client reconnu, et équipe pour un client choisi.
    AdminOfferedPickupsController,
    MyPickupAddressesController,
    AdminCatalogController,
    // Les commandes à régler par carte, vues de la comptabilité (plan liens de
    // paiement §2a) : la commande vit ici, la ressource est `b2b_accounting`.
    AdminOrderPaymentLinksController,
    // Les bons d'EXEMPLE de la planche des documents (Comptabilité, 2026-10-20).
    AdminOrderSheetSpecimensController,
    // La Supervision du jour, sous sa propre ressource `b2b_supervision` :
    // elle lit les commandes d'ici, mais ne les ouvre pas.
    AdminSupervisionController,
    // La seule surface PUBLIQUE de ce contexte. Rangée avec les autres parce
    // qu'elle tarife un panier — c'est un sujet de commande, pas de catalogue —
    // et son absence de jeton est écrite dans son en-tête, pas dans sa place.
    ShopQuoteController,
    // Murée, elle : un panier a un propriétaire. Rangée près de la vitrine
    // parce qu'elle sert le même écran, pas parce qu'elle a le même public.
    ShopCartController,
    // Porte machine-à-machine (jeton du Cron Trigger), pas une surface staff :
    // le rappel horaire des liens de paiement non réglés (plan d'abandon, Q6).
    SettlementRemindersController,
    // Porte machine, elle aussi : l'expiration des commandes boutique non
    // réglées, au cron de rafraîchissement (plan commandes non réglées, §4.5).
    UnsettledShopOrdersController,
    // La commande SANS compte (architecture-commande-sans-compte.md, §6) : ouverte le
    // 2026-10-11, Hugo ayant tranché que le visiteur paie le prix et la TVA
    // d'un particulier connecté — ce que `OrderDrafting` sans société calcule.
    ShopOrdersController,
  ],
  providers: [
    OrderDrafting,
    // L'arrêt du plan opposé à la passation (lot O3) ; ses deux ports viennent
    // du fournil par `ProductionDeskFeedModule`.
    OrderPlanGate,
    // Le réglage « jour même » (§8.3), lu sur le réglage de l'heure limite.
    { provide: SameDayOrderReader, useClass: SettingsSameDayOrderReader },
    // Le garde des opérations datées, partagé par la caisse et les deux devis.
    OrderOperations,
    OrderLinePricing,
    CartAdjustments,
    CustomerAudiences,
    ListCustomerPickupsHandler,
    OrderIntake,
    PlaceOrderHandler,
    PlaceOrderForCustomerHandler,
    ConfirmOrderPaymentHandler,
    AbandonOrderHandler,
    // L'annulation par l'équipe (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
    // C3) : le geste, son courriel, et ses deux ports — lire et écrire (ISP).
    // Le guichet du fournil vient de `ProductionDeskFeedModule`.
    CancelOrderHandler,
    // Lot C6 : le noyau, extrait du geste staff, partagé avec le client.
    OrderCancellation,
    ...CUSTOMER_CANCELLATION_PROVIDERS,
    VoucherRestitutionRefusal,
    // Lot C5 : la règle d'annulation et l'engagement comptable — le port est
    // relié par `appBootstrap/account-order-engagement.module.ts`.
    CancellationRule,
    SendOrderCancelledMail,
    { provide: CancellationSubjectReader, useClass: PrismaCancellationSubjectReader },
    { provide: OrderCancellationRepository, useClass: PrismaOrderCancellationRepository },
    ListCompanyOrdersHandler,
    SummarizeCompanyOrdersHandler,
    ListPersonalOrdersHandler,
    GetOrderHandler,
    GetOrderSheetHandler,
    GetOrderSheetPdfHandler,
    GetAdminOrderSheetPdfHandler,
    GetOrderSheetSpecimenHandler,
    OrderSheetArchive,
    OrderSheetAttachment,
    // Le logo du bon (plan-bon-public §2.1), lu dans `assets/` comme les polices de la facture.
    // Le logo de la marque, lu par `platform/brand` (plan matrice des
    // allergènes §2) : un seul lecteur pour tous les papiers.
    { provide: OrderSheetLogoSource, useExisting: BrandLogoSource },
    { provide: OrderSheetColorSource, useClass: PrismaOrderSheetColorSource },
    GetOrderPaymentHandler,
    GetAdminOrderHandler,
    GetOrderHandoverProofHandler,
    GetOrderHandoverProofImageHandler,
    { provide: DeliveryDefaultsReader, useClass: PrismaDeliveryDefaultsReader },
    // Les commandes du fournil (lot T0, 2026-10-13) : la base rend, l'application
    // pose l'échéance depuis le site — `SitedDayOrders` implémente le port.
    { provide: DayOrdersSource, useClass: PrismaDayOrdersSource },
    { provide: SiteDaySettingsReader, useClass: PrismaSiteDaySettingsReader },
    SiteDeadlines,
    SitedDayOrders,
    // Le transfert interne (lot T1) : l'heure d'arrivée par la même règle.
    CommerceTransferSites,
    PrismaHandoverSubjectReader,
    PrismaPendingOrdersReader,
    // Le compte à rebours du fournil (vagues, V0) : implémente un port de la
    // production, relié dans `appBootstrap`.
    DueThresholds,
    { provide: DeadlineOrdersReader, useClass: PrismaDeadlineOrdersReader },
    OnProductionDayClosed,
    // La réouverture d'une journée (2026-10-14) : son abonné, et le seul port
    // qu'il écrit.
    OnProductionDayReopened,
    { provide: OrderPlanRelease, useClass: PrismaOrderPlanRelease },
    // Le bac fermé au colisage — le seul fait « bac fait » depuis K3c.
    OnPackingOrderPacked,
    OnOrderHandedOver,
    GetProductionBatchHandler,
    GetPackingHandler,
    // L'accusé de réception à la passation. 🔴 Il se TAIT quand le règlement est
    // encore en vol (2026-09-17) : une commande carte n'est pas payée quand elle
    // est écrite, et lui annoncer la fournée de demain serait un message faux.
    SendOrderPlacedMail,
    // Le même accusé, quand la carte a répondu OUI. Deux gestes, un seul
    // composeur — et la même clé d'idempotence, donc jamais deux accusés.
    SendOrderSettledMail,
    // Et quand elle a répondu NON. Ce courriel n'existait pas : un refus était
    // écrit dans une colonne que personne ne relisait.
    SendPaymentFailedMail,
    // Le règlement mort à la clôture a son propre courriel ; l'abandon, aucun.
    SendPaymentExpiredMail,
    // Tout règlement pro qui meurt sonne, quelle qu'en soit la cause (D4).
    RingFailedProSettlement,
    { provide: FailedSettlementReader, useClass: PrismaFailedSettlementReader },
    // Les avis au principal (plan-notifications-sous-comptes.md, N2) lisent la
    // commande par ce port, jamais dans ses tables.
    { provide: OrderNoticeSummaryReader, useClass: PrismaOrderNoticeSummaryReader },
    // La clôture tue les règlements en vol de sa journée AVANT de compter
    // (plan d'abandon, Q1, B1) : le port est celui du fournil, relié dans
    // `ProductionFeedModule`.
    PendingSettlementSweep,
    { provide: UnsettledSettlementReader, useClass: PrismaUnsettledSettlementReader },
    SendSettlementRemindersHandler,
    { provide: UnpaidLinkOrderReader, useClass: PrismaUnpaidLinkOrderReader },
    // Une commande boutique non réglée expire à 30 minutes, ou quand le même
    // particulier en passe une autre (plan commandes non réglées, §4.2, §4.4).
    UnsettledShopOrderExpiry,
    ExpireUnsettledShopOrdersHandler,
    ReplaceUnsettledShopOrders,
    { provide: UnsettledShopOrderReader, useClass: PrismaUnsettledShopOrderReader },
    { provide: UnsettledShopOrderCanceller, useClass: PrismaUnsettledShopOrderCanceller },
    // Son prix : une intention restée vivante peut être payée sur une commande
    // annulée. La base ne la rouvre pas ; depuis le lot C4, elle se rembourse
    // toute seule (`ORDER_REFUND_PROVIDERS`).
    { provide: CancelledOrderPaymentReader, useClass: PrismaCancelledOrderPaymentReader },
    // Les remboursements Stripe, CONSTATÉS (plan facture carte, lot R1).
    RecordOrderRefundHandler,
    RingRefundRejected,
    { provide: OrderRefundRepository, useClass: PrismaOrderRefundRepository },
    // Lot C4 : rembourser une commande payée qu'on annule.
    ...ORDER_REFUND_PROVIDERS,
    // Le composeur de l'accusé, partagé par les deux chemins ci-dessus.
    OrderPlacedMail,
    // Prévient le propriétaire d'une adresse qu'une commande sans compte l'a
    // utilisée (D7). Abonné au MÊME événement que l'accusé de réception, et
    // c'est voulu : l'un écrit à qui commande, l'autre à qui ne commande pas.
    SendGuestOrderNotice,
    SendGuestOrderNoticeOnPaid,
    SendOrderReadyMail,
    // Le composeur du courriel de retrait, partagé par le colisage (qui
    // l'annonce) et par le rappel du comptoir (qui le renvoie).
    OrderReadyMail,
    // « Votre livraison est en route » (en-route.md) : l'abonné durable du
    // départ d'une tournée (`delivery.round_departed`, DD1).
    DeliveryEnRouteMail,
    MailDeliveryEnRoute,
    SendHandoverReminderHandler,
    { provide: OrderPaymentLinkReader, useClass: PrismaOrderPaymentLinkReader },
    ListOrdersAwaitingPaymentHandler,
    { provide: DaySupervisionReader, useClass: PrismaDaySupervisionReader },
    GetDaySupervisionHandler,
    // La version par journée (`plan-version-par-journee.md`, V1-V2) : lire et
    // balayer le journal du commerce sont deux ports (ISP).
    GetOrderDayVersionHandler,
    PruneOrderDayChangesHandler,
    { provide: OrderDayVersionReader, useClass: PrismaOrderDayVersionReader },
    // Les CGV figées sur une commande, pour son détail (plan des CGV, C4).
    { provide: OrderSalesTermsRecordReader, useClass: PrismaOrderSalesTermsRecordReader },
    GetOrderSalesTermsHandler,
    { provide: OrderDayChangePruner, useClass: PrismaOrderDayChangePruner },
    ResendOrderPaymentLinkHandler,
    { provide: OrderRecipientReader, useClass: PrismaOrderRecipientReader },
    {
      // Les deux origines, extraites de la configuration à la racine de
      // composition. L'abonné dépend du port étroit, pas des trente lectures
      // d'`AppConfig` dont il n'appelle que deux.
      provide: OrderMailOrigins,
      inject: [AppConfig],
      useFactory: (config: AppConfig): OrderMailOrigins => ({
        clientBaseUrl: () => config.clientBaseUrl(),
        adminBaseUrl: () => config.adminBaseUrl(),
      }),
    },
    MarkOrderReadyHandler,
    MarkOrderFulfilledHandler,
    ListAdminOrdersHandler,
    GetAdminOrderHistoryHandler,
    ListCatalogHandler,
    ListCustomerSkusHandler,
    QuoteOrderHandler,
    ReadMyShopCatalogueHandler,
    ShopCartQuoting,
    QuoteShopCartHandler,
    QuoteMyShopCartHandler,
    GetOrderDraftHandler,
    SaveOrderDraftHandler,
    DiscardOrderDraftHandler,
    GetShopCartHandler,
    SaveShopCartHandler,
    // `useExisting` et non `useClass` : une SEULE instance lit la table des
    // règles. Le contexte `orders` n'en voit que `list()` — le port étroit —
    // pendant que les réglages gardent le repository complet. Depuis le lot O3
    // (2026-10-14), ce sont les règles EN VIGUEUR : l'heure limite générale
    // désactivée, la passation et la relance n'en voient plus aucune. Deux instances
    // n'auraient rien cassé aujourd'hui, mais auraient rendu légitime, demain,
    // d'ajouter un cache à l'une et pas à l'autre.
    { provide: OrderCutoffReader, useExisting: OrderCutoffsInForce },
    { provide: OrderGuardReader, useClass: PrismaOrderGuardReader },
    // Le mur des gestes sur une commande EXISTANTE, héritage du principal
    // compris (lot C1 de `plan-commandes-des-sites.md`) ; distinct de
    // `roleOf`, qui garde la passation et le devis.
    { provide: OrderAccessReader, useClass: PrismaOrderAccessReader },
    { provide: CompanyOrderListReader, useClass: PrismaCompanyOrderListReader },
    { provide: CompanyOrderSummaryReader, useClass: PrismaCompanyOrderSummaryReader },
    { provide: OrderPayerReader, useClass: PrismaOrderPayerReader },
    // Le port étroit du statut, sur la MÊME instance que le garde : la clientèle
    // n'a besoin que de lui, et deux lecteurs du statut n'auraient aucune raison
    // de diverger — donc aucune raison d'exister deux fois.
    { provide: CompanyStatusReader, useExisting: OrderGuardReader },
    { provide: PreferredPickupReader, useClass: PrismaPreferredPickupReader },
    { provide: CustomerSkuReader, useClass: PrismaCustomerSkuReader },
    // Les ventes par jour × article, que la recommandation déclare pour estimer
    // ce que ses suggestions ont fait commander (RS6) : des totaux, aucun client.
    { provide: SuggestedSkuSalesReader, useClass: PrismaSuggestedSkuSalesReader },
    { provide: CoPurchaseReader, useClass: PrismaCoPurchaseReader },
    { provide: PurchaseHistoryReader, useClass: PrismaPurchaseHistoryReader },
    // Les commandes en agrégats par segment, que les audiences déclarent (A1) :
    // une ligne par case, aucun client.
    { provide: AudienceOrderReader, useClass: PrismaAudienceOrderReader },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    // Le registre des clés de passation : un double clic ne fait qu'une commande.
    { provide: OrderIdempotencyStore, useClass: PrismaOrderIdempotencyStore },
    // La commande **sans compte** — plan `architecture-commande-sans-compte.md`, lot C.
    //
    // Sa route, `ShopOrdersController`, est ouverte depuis le 2026-10-11 (§6).
    PlaceShopOrderHandler,
    { provide: ShopOrderIdempotencyStore, useClass: PrismaShopOrderIdempotencyStore },
    { provide: GuestBuyerRegistrar, useClass: PrismaGuestBuyerRegistrar },
    { provide: GuestOrderNoticeReader, useClass: PrismaGuestOrderNoticeReader },
    { provide: OrderDraftRepository, useClass: PrismaOrderDraftRepository },
    { provide: ShopCartRepository, useClass: PrismaShopCartRepository },
    { provide: OrderReader, useClass: PrismaOrderReader },
    { provide: AdminOrderListReader, useClass: PrismaAdminOrderListReader },
    { provide: AdminOrderAuthorReader, useClass: PrismaAdminOrderAuthorReader },
    { provide: OrderHistoryReader, useClass: PrismaOrderHistoryReader },
    { provide: CompletedOrderReader, useClass: PrismaCompletedOrderReader },
    { provide: VoucherOrderReader, useClass: PrismaVoucherOrderReader },
    { provide: OrderNumberReader, useClass: PrismaOrderNumberReader },
  ],
  // Le catalogue sort d'ici parce que l'écran de tarification en a besoin : il
  // doit résoudre les prix contre l'autorité que la caisse utilise, pas contre
  // une seconde copie. Cf. `PricingAdminModule`.
  exports: [
    // Les trois adaptateurs que la production consomme par ses ports. Ils
    // sortent d'ici pour être RELIÉS dans la racine de composition, jamais
    // pour être importés par le fournil : le token qu'il connaît est le sien.
    SitedDayOrders,
    CommerceTransferSites,
    PrismaHandoverSubjectReader,
    PrismaPendingOrdersReader,
    PendingSettlementSweep,
    DueThresholds,
    // Et le port de lecture des commandes, dont le troisième dépend : il
    // DÉLÈGUE la lecture du sujet de remise plutôt que de recopier son `select`,
    // et Nest doit pouvoir le lui donner là où il est instancié.
    OrderReader,
    // Le mur d'une commande existante, que le signalement d'un problème
    // (`b2b/contact`) applique avec `isOrderVisible` : la règle d'accès d'une
    // commande, pas une seconde (`demandes-clients.md`, §6.4 ; héritage du
    // principal depuis le lot C1 de `plan-commandes-des-sites.md`).
    OrderAccessReader,
    // Les commandes définitives, que la fidélité crédite (plan des points,
    // D3) : elle les lit par ce port, jamais dans les tables de la commande.
    CompletedOrderReader,
    // Les commandes qui portent des bons, que le rattrapage de nuit de la
    // fidélité et son écran lisent (plan des points, C5, §11 bis S4, S6).
    VoucherOrderReader,
    // Les numéros des commandes qui ont rapporté des points, que l'historique
    // du client montre (plan des points, E1.1).
    OrderNumberReader,
    // Les ventes par jour × article, lues par la recommandation (RS6).
    SuggestedSkuSalesReader,
    CoPurchaseReader,
    PurchaseHistoryReader,
    // Les agrégats par segment, lus par les audiences (A1).
    AudienceOrderReader,
    // Le résumé d'une commande, que les avis au principal lisent (N2).
    OrderNoticeSummaryReader,
  ],
})
export class OrdersModule {}
