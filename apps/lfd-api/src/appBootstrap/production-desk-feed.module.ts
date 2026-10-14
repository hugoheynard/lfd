import { Global, Module } from "@nestjs/common";

import { ProductionOrderWithdrawalDesk } from "../production/application/services/production-order-withdrawal.desk.js";
import { ProductionPlanAdmissionDesk } from "../production/application/services/production-plan-admission.desk.js";
import {
  ClosedPlansReader,
  OrderInscriptionReader,
  OrderWithdrawalDesk,
  PlanAdmissionDesk,
} from "../production/channels/commerce/index.js";
import { PrismaClosedPlansReader } from "../production/infrastructure/prisma-closed-plans.reader.js";
import { PrismaOrderInscriptionReader } from "../production/infrastructure/prisma-order-inscription.reader.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Les guichets que le fournil tient POUR le commerce, reliés** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4, 2026-10-12).
 *
 * L'autre sens de `ProductionFeedModule` : là, le fournil déclare et le
 * commerce implémente ; ici, le fournil déclare ET implémente, et le commerce
 * appelle — retirer une commande de la journée sous son verrou, et dire si
 * elle est inscrite. Même figure que les lecteurs que le retrait sert à la
 * comptabilité (`HandoverFeedModule`).
 *
 * Un module à part plutôt qu'une ligne de plus dans `ProductionFeedModule` :
 * celui-ci importe le commerce, et y importer aussi la production ferait du
 * même module les deux bouts du fil.
 *
 * `@Global` pour la raison des autres fils : `b2b/` ne peut pas importer le
 * module du fournil sans franchir la frontière.
 */
@Global()
@Module({
  imports: [ProductionModule],
  providers: [
    { provide: OrderWithdrawalDesk, useExisting: ProductionOrderWithdrawalDesk },
    { provide: OrderInscriptionReader, useExisting: PrismaOrderInscriptionReader },
    // L'arrêt du plan comme limite (lot O3, 2026-10-14) : la boutique lit les
    // journées arrêtées, la passation s'y admet sous le verrou de la journée.
    { provide: ClosedPlansReader, useExisting: PrismaClosedPlansReader },
    { provide: PlanAdmissionDesk, useExisting: ProductionPlanAdmissionDesk },
  ],
  exports: [OrderWithdrawalDesk, OrderInscriptionReader, ClosedPlansReader, PlanAdmissionDesk],
})
export class ProductionDeskFeedModule {}
