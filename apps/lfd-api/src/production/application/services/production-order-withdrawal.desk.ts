import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderInscriptionReader } from "../../channels/commerce/order-inscription.reader.js";
import {
  OrderWithdrawalDesk,
  type OrderWithdrawalAllowance,
  type OrderWithdrawalOutcome,
} from "../../channels/commerce/order-withdrawal.desk.js";
import { OrderWithdrawalLedger } from "../../domain/ports/order-withdrawal.ledger.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Le guichet du retrait, tel que le fournil l'implémente — cf.
 * {@link OrderWithdrawalDesk}.
 *
 * Verrou de la journée, PUIS lecture de l'inscription, PUIS écriture : la
 * clôture et le retirage prennent le même verrou avant d'inscrire, donc ils
 * voient le retrait, ou le retrait voit leur inscription — jamais aucun des
 * deux.
 *
 * Une commande inscrite n'est retirée que sous `before_packing` (plan A1,
 * § 2.1) : la ligne porte alors `after_inscription`, et rien d'autre ne bouge
 * au fournil — ni le compte à produire, ni les fournées.
 *
 * L'unité de travail REJOINT celle de l'appelant (`PrismaUnitOfWork.run`) :
 * appelé hors transaction, il en ouvrirait une à lui, et le verrou n'aurait
 * de sens que pour lui seul — c'est pourquoi le commerce l'appelle dans la
 * sienne.
 */
@Injectable()
export class ProductionOrderWithdrawalDesk extends OrderWithdrawalDesk {
  constructor(
    private readonly lock: ProductionDayLock,
    private readonly inscriptions: OrderInscriptionReader,
    private readonly ledger: OrderWithdrawalLedger,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  async withdraw(
    day: ServiceDay,
    orderId: string,
    allowance: OrderWithdrawalAllowance,
  ): Promise<OrderWithdrawalOutcome> {
    return this.uow.run(async () => {
      await this.lock.lock(day);
      const inscribed = (await this.inscriptions.inscribedDayOf(orderId)) !== null;
      if (!inscribed) {
        await this.ledger.record(day, orderId, this.clock.now(), false);
        return "withdrawn";
      }
      if (allowance === "before_inscription") {
        return "inscribed";
      }
      await this.ledger.record(day, orderId, this.clock.now(), true);
      return "withdrawn_after_inscription";
    });
  }
}
