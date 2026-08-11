import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { AcknowledgeAlertHandler } from "./application/commands/acknowledge-alert.handler.js";
import { ClearAccountAlertOverrideHandler } from "./application/commands/clear-account-alert-override.handler.js";
import { RecomputeProductNormsHandler } from "./application/commands/recompute-product-norms.handler.js";
import { SaveAccountAlertOverrideHandler } from "./application/commands/save-account-alert-override.handler.js";
import { SaveAlertRuleHandler } from "./application/commands/save-alert-rule.handler.js";
import { EvaluateOrderAlerts } from "./application/handlers/evaluate-order-alerts.service.js";
import { OnOrderPlacedEvaluateAlerts } from "./application/handlers/on-order-placed.handler.js";
import { GetAccountAlertRulesHandler } from "./application/queries/get-account-alert-rules.handler.js";
import { ListAccountAlertsHandler } from "./application/queries/list-account-alerts.handler.js";
import { ListAlertRulesHandler } from "./application/queries/list-alert-rules.handler.js";
import { AccountAlertOverridesStore } from "./domain/ports/account-alert-overrides.store.js";
import { AccountAlertRepository } from "./domain/ports/account-alert.repository.js";
import { AlertRulesStore } from "./domain/ports/alert-rules.store.js";
import { AlertCompanyReader } from "./domain/ports/company.reader.js";
import { EvaluatedOrderReader } from "./domain/ports/evaluated-order.reader.js";
import {
  AccountOrderHistoryReader,
  ProductNormReader,
} from "./domain/ports/order-history.reader.js";
import { ProductNormStore } from "./domain/ports/product-norm.store.js";
import { AdminAccountAlertRulesController } from "./http/admin-account-alert-rules.controller.js";
import { AdminAccountAlertsController } from "./http/admin-account-alerts.controller.js";
import { AdminAlertRulesController } from "./http/admin-alert-rules.controller.js";
import { AdminRecomputeNormsController } from "./http/admin-recompute-norms.controller.js";
import { PrismaAccountAlertOverridesStore } from "./infrastructure/prisma-account-alert-overrides.store.js";
import { PrismaAccountAlertRepository } from "./infrastructure/prisma-account-alert.repository.js";
import { PrismaAlertCompanyReader } from "./infrastructure/prisma-alert-company.reader.js";
import { PrismaAlertRulesStore } from "./infrastructure/prisma-alert-rules.store.js";
import { PrismaEvaluatedOrderReader } from "./infrastructure/prisma-evaluated-order.reader.js";
import {
  PrismaAccountOrderHistoryReader,
  PrismaProductNormReader,
} from "./infrastructure/prisma-order-history.reader.js";
import { PrismaProductNormStore } from "./infrastructure/prisma-product-norm.store.js";

/**
 * **Alertes de compte client** — les règles qui font remarquer au commercial
 * qu'un client vient de prendre un produit inédit, ou trois fois moins que
 * d'habitude. Cf.
 * `documentation/b2b/architecture-alertes-compte-client.md`.
 *
 * Contexte à part, et pas un coin de `growth/` : le langage n'est pas celui de
 * l'acquisition (règle, dérogation, détecteur, alerte), et il porte sa propre
 * question — surveiller un compte **déjà client**, pas en gagner un.
 *
 * Il ne connaît d'`orders` que la **classe d'événement** `OrderPlacedEvent` :
 * jamais ses tables, jamais ses agrégats.
 */
@Module({
  imports: [CqrsModule],
  controllers: [
    AdminAlertRulesController,
    AdminAccountAlertRulesController,
    AdminAccountAlertsController,
    AdminRecomputeNormsController,
  ],
  providers: [
    { provide: AlertRulesStore, useClass: PrismaAlertRulesStore },
    { provide: AccountAlertOverridesStore, useClass: PrismaAccountAlertOverridesStore },
    { provide: AccountAlertRepository, useClass: PrismaAccountAlertRepository },
    { provide: AlertCompanyReader, useClass: PrismaAlertCompanyReader },
    { provide: EvaluatedOrderReader, useClass: PrismaEvaluatedOrderReader },
    { provide: AccountOrderHistoryReader, useClass: PrismaAccountOrderHistoryReader },
    { provide: ProductNormReader, useClass: PrismaProductNormReader },
    { provide: ProductNormStore, useClass: PrismaProductNormStore },
    EvaluateOrderAlerts,
    OnOrderPlacedEvaluateAlerts,
    ListAlertRulesHandler,
    SaveAlertRuleHandler,
    GetAccountAlertRulesHandler,
    SaveAccountAlertOverrideHandler,
    ClearAccountAlertOverrideHandler,
    ListAccountAlertsHandler,
    AcknowledgeAlertHandler,
    RecomputeProductNormsHandler,
  ],
})
export class AlertsModule {}
