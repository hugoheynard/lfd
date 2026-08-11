import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { SaveAlertRuleHandler } from "./application/commands/save-alert-rule.handler.js";
import { ListAlertRulesHandler } from "./application/queries/list-alert-rules.handler.js";
import { AlertRulesStore } from "./domain/ports/alert-rules.store.js";
import { AdminAlertRulesController } from "./http/admin-alert-rules.controller.js";
import { PrismaAlertRulesStore } from "./infrastructure/prisma-alert-rules.store.js";

/**
 * **Alertes de compte client** — les règles qui font remarquer au commercial
 * qu'un client vient de prendre un produit inédit, ou trois fois moins que
 * d'habitude. Cf.
 * `documentation/b2b/architecture-alertes-compte-client.md`.
 *
 * Contexte à part, et pas un coin de `growth/` : le langage n'est pas celui de
 * l'acquisition (règle, dérogation, détecteur, alerte), et il porte sa propre
 * question — surveiller un compte **déjà client**, pas en gagner un.
 */
@Module({
  imports: [CqrsModule],
  controllers: [AdminAlertRulesController],
  providers: [
    { provide: AlertRulesStore, useClass: PrismaAlertRulesStore },
    ListAlertRulesHandler,
    SaveAlertRuleHandler,
  ],
})
export class AlertsModule {}
