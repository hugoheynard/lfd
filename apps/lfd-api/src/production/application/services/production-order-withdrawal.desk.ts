import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderInscriptionReader } from "../../channels/commerce/order-inscription.reader.js";
import {
  OrderWithdrawalDesk,
  type OrderWithdrawalAllowance,
  type OrderWithdrawalOutcome,
} from "../../channels/commerce/order-withdrawal.desk.js";
import { OrderWithdrawnAfterCloseEvent } from "../../domain/events/order-withdrawn-after-close.events.js";
import { OrderWithdrawalLedger } from "../../domain/ports/order-withdrawal.ledger.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
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
 * au fournil — ni le compte à produire, ni les fournées. Le fait
 * `production.order_withdrawn_after_close` part alors, durable et journalisé
 * (lot A1.3) : c'est lui qui explique un compte plus grand que les feuilles.
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
    private readonly days: ProductionDayRepository,
    private readonly events: DomainEventPublisher,
    private readonly durable: DurablePublisher,
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
      const now = this.clock.now();
      await this.ledger.record(day, orderId, now, true);
      await this.announce(day, orderId, now);
      return "withdrawn_after_inscription";
    });
  }

  /** Le fait, avec la référence que le plan a figée — lue sous le verrou déjà pris. */
  private async announce(day: ServiceDay, orderId: string, at: Date): Promise<void> {
    const plan = await this.days.load(day);
    const reference = plan.orders.find((order) => order.orderId === orderId)?.reference ?? null;
    const event = new OrderWithdrawnAfterCloseEvent(day.value, orderId, reference, at);
    await this.events.publishTraced(event);
    await this.durable.publish(event.durableFact());
  }
}
