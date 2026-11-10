import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { PricingAdminModule } from "../pricing/pricing-admin.module.js";
import { ReconstructLineRulesHandler } from "./application/queries/reconstruct-line-rules.handler.js";
import { AdminOrderPricingController } from "./http/admin-order-pricing.controller.js";
import { OrdersModule } from "./orders.module.js";

/**
 * **La jointure**, et rien d'autre : expliquer le prix d'une ligne demande la
 * commande ET les décisions tarifaires d'un jour donné.
 *
 * 🔴 Un module à part, parce que les deux importations naturelles sont toutes
 * les deux interdites, et pour des raisons écrites :
 *
 * - `OrdersModule` n'importe pas `PricingAdminModule` — celui-ci porte les
 *   dépôts d'**écriture** de la tarification, et le module qui encaisse n'a
 *   aucune raison de les traîner. C'est le motif même de `PricerModule`, dit
 *   dans son JSDoc ;
 * - `pricing` n'importe pas `orders` — la dépendance a été **retirée** le
 *   2026-09-09, et la rétablir pour un écran de lecture serait la reprendre par
 *   l'autre bout.
 *
 * Ce module ne fournit donc aucun adaptateur : il branche un handler sur deux
 * modules qui s'ignorent, et c'est la seule chose qu'il fait. `PricingAdminModule`
 * n'en exporte que deux **lectures**.
 */
@Module({
  imports: [CqrsModule, OrdersModule, PricingAdminModule],
  controllers: [AdminOrderPricingController],
  providers: [ReconstructLineRulesHandler],
})
export class OrderPricingModule {}
