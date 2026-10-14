import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { ClosedPlansReader } from "../../channels/commerce/closed-plans.reader.js";
import {
  type PlanAdmission,
  PlanAdmissionDesk,
} from "../../channels/commerce/plan-admission.desk.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Le guichet d'admission, tel que le fournil l'implémente — cf.
 * {@link PlanAdmissionDesk}.
 *
 * Verrou de la journée, PUIS lecture de l'arrêt : l'arrêt du plan prend le
 * même verrou avant d'écrire `closed_at`. L'unité de travail REJOINT celle de
 * l'appelant (`PrismaUnitOfWork.run`) ; appelé hors transaction, il en
 * ouvrirait une à lui et le verrou ne protégerait rien — c'est pourquoi le
 * commerce l'appelle dans la sienne.
 */
@Injectable()
export class ProductionPlanAdmissionDesk extends PlanAdmissionDesk {
  constructor(
    private readonly lock: ProductionDayLock,
    private readonly plans: ClosedPlansReader,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  async admit(day: ServiceDay): Promise<PlanAdmission> {
    return this.uow.run(async () => {
      await this.lock.lock(day);
      const closed = await this.plans.closedBetween(day.value, day.value);
      return closed.length === 0 ? "open" : "closed";
    });
  }
}
