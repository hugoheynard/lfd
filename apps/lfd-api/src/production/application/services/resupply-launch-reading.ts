import { Injectable } from "@nestjs/common";

import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import {
  DayResuppliesReader,
  type PlacedResupply,
} from "../../channels/commerce/day-resupplies.reader.js";
import {
  NOTHING_PENDING,
  type PendingPlan,
  type ProductionDay,
} from "../../domain/entities/production-day.js";
import { ResupplyToLaunchNotFoundError } from "../../domain/errors/resupply-launch-errors.js";
import { OrderWithdrawalsReader } from "../../domain/ports/order-withdrawals.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Ce qu'un lancement lit sous le verrou : la journée, le réassort, ce qui reste à figer. */
export interface ResupplyLaunchSubject {
  readonly current: ProductionDay;
  readonly resupply: PlacedResupply;
  readonly pending: PendingPlan;
}

/**
 * **Ce qu'un lancement « au plus tôt » lit, SOUS le verrou de la journée** —
 * sorti de `LaunchResupplyHandler` pour qu'il ne porte plus onze
 * dépendances (audit du réassort, 2026-11-02). L'appelant a DÉJÀ pris le
 * verrou ; cette lecture ne le prend pas, et n'a de sens qu'après lui.
 *
 * Elle recharge la journée, lit LE réassort au commerce, puis — sur une
 * journée encore ouverte seulement — ce que l'arrêt figerait encore : les
 * commandes, les retraits de l'annulation staff et les réassorts « pour
 * demain » envoyés. Lues avant le verrou, une commande admise entre la
 * lecture et le verrou échappait à la garde « une journée jamais arrêtée ne
 * s'ouvre pas avec ce seul réassort » (G-A, audit du 2026-11-02).
 */
@Injectable()
export class ResupplyLaunchReading {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly resupplies: DayResuppliesReader,
    private readonly orders: DayOrdersReader,
    private readonly withdrawals: OrderWithdrawalsReader,
  ) {}

  /** @throws {ResupplyToLaunchNotFoundError} le commerce ne rend pas ce réassort à lancer. */
  async underLock(day: ServiceDay, resupplyId: string): Promise<ResupplyLaunchSubject> {
    const current = await this.days.load(day);
    const resupply = await this.resupplies.asapToLaunch(day, resupplyId);
    if (resupply === null) {
      throw new ResupplyToLaunchNotFoundError(day.value);
    }
    return { current, resupply, pending: await this.pendingOf(day, current) };
  }

  /** Rien sur une journée déjà arrêtée : l'arrêt a tout figé. */
  private async pendingOf(day: ServiceDay, current: ProductionDay): Promise<PendingPlan> {
    if (current.isClosed) {
      return NOTHING_PENDING;
    }
    return {
      orders: await this.orders.producibleFor(day),
      withdrawn: await this.withdrawals.withdrawnOn(day),
      resupplies: await this.resupplies.placedFor(day),
    };
  }
}
