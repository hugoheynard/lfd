import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderInscriptionReader } from "../../channels/commerce/order-inscription.reader.js";
import {
  OrderRevisionDesk,
  type OrderRevisionOutcome,
} from "../../channels/commerce/order-revision.desk.js";
import { OrderRevisionNoticeLedger } from "../../domain/ports/order-revision-notice.ledger.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Le guichet de la révision, tel que le fournil l'implémente — cf.
 * {@link OrderRevisionDesk}. Verrous des journées par date croissante, PUIS
 * lecture de l'inscription, PUIS les notes : la clôture prend le même verrou
 * avant d'inscrire, donc elle voit la note, ou la note voit son inscription.
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
  ) {
    super();
  }

  async note(
    days: readonly ServiceDay[],
    orderId: string,
    revision: number,
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
        return "inscribed";
      }
      const at = this.clock.now();
      for (const day of ordered) {
        await this.notices.record(day, orderId, revision, at);
      }
      return "noted";
    });
  }
}
