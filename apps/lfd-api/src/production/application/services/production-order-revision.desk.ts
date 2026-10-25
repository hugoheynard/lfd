import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderInscriptionReader } from "../../channels/commerce/order-inscription.reader.js";
import {
  OrderRevisionDesk,
  type OrderRevisionAllowance,
  type OrderRevisionOutcome,
  type RevisedOrderLine,
} from "../../channels/commerce/order-revision.desk.js";
import { OrderQuantitiesRaisedEvent } from "../../domain/events/order-quantities-raised.events.js";
import { OrderRevisionNoticeLedger } from "../../domain/ports/order-revision-notice.ledger.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Ce que la révision après l'arrêt apporte au guichet : qui, quelle révision, quoi. */
interface InscribedRevision {
  readonly orderId: string;
  readonly revision: number;
  readonly lines: readonly RevisedOrderLine[];
}

/**
 * Le guichet de la révision, tel que le fournil l'implémente — cf.
 * {@link OrderRevisionDesk}. Verrous des journées par date croissante, PUIS
 * lecture de l'inscription, PUIS les notes : la clôture prend le même verrou
 * avant d'inscrire, donc elle voit la note, ou la note voit son inscription.
 *
 * Inscrite, sous `staff_quantities` (plan A2, § 7, B3) — toujours sous le
 * verrou de la journée, seule : la journée est rechargée, les coches
 * héritées matérialisées et écrites en fournées (le chemin du retirage), le
 * dû de la commande révisé et le compte refait sans baisser. Une hausse
 * publie `production.order_quantities_raised`, durable et journalisé.
 *
 * L'unité de travail REJOINT celle de l'appelant (`PrismaUnitOfWork.run`).
 */
@Injectable()
export class ProductionOrderRevisionDesk extends OrderRevisionDesk {
  constructor(
    private readonly lock: ProductionDayLock,
    private readonly inscriptions: OrderInscriptionReader,
    private readonly notices: OrderRevisionNoticeLedger,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly events: DomainEventPublisher,
    private readonly durable: DurablePublisher,
  ) {
    super();
  }

  async note(
    days: readonly ServiceDay[],
    orderId: string,
    revision: number,
    lines: readonly RevisedOrderLine[],
    allowance: OrderRevisionAllowance,
  ): Promise<OrderRevisionOutcome> {
    // Date croissante, une fois chacune : deux révisions croisées (du 3 au 4
    // et du 4 au 3) prennent les verrous dans le même ordre.
    const ordered = [...new Map(days.map((day) => [day.value, day])).values()].sort((a, b) =>
      a.value.localeCompare(b.value),
    );
    return this.uow.run(async () => {
      for (const day of ordered) {
        await this.lock.lock(day);
      }
      if ((await this.inscriptions.inscribedDayOf(orderId)) !== null) {
        const [only] = ordered;
        // Une révision après l'arrêt ne change pas de jour : deux journées, c'est « inscrite ».
        if (allowance !== "staff_quantities" || only === undefined || ordered.length > 1) {
          return "inscribed";
        }
        return this.reviseInscribed(only, { orderId, revision, lines });
      }
      const at = this.clock.now();
      for (const day of ordered) {
        await this.notices.record(day, orderId, revision, at);
      }
      return "noted";
    });
  }

  /** Sous le verrou déjà pris : le chemin du retirage, puis le dû révisé. */
  private async reviseInscribed(
    day: ServiceDay,
    revised: InscribedRevision,
  ): Promise<OrderRevisionOutcome> {
    const plan = await this.days.load(day);
    const inherited = plan.materialize();
    const raised = plan.reviseOrder(revised.orderId, revised.lines);
    for (const batch of inherited) {
      await this.batches.record(day, batch);
    }
    await this.days.save(plan);
    if (raised.length === 0) {
      return "unchanged";
    }
    const reference =
      plan.orders.find((order) => order.orderId === revised.orderId)?.reference ?? revised.orderId;
    const event = new OrderQuantitiesRaisedEvent(
      day.value,
      revised.orderId,
      reference,
      revised.revision,
      raised,
      this.clock.now(),
    );
    await this.events.publishTraced(event);
    await this.durable.publish(event.durableFact());
    return "raised";
  }
}
