import { Injectable } from "@nestjs/common";

import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../channels/commerce/day-orders.reader.js";
import {
  DayResuppliesReader,
  type PlacedResupply,
} from "../../channels/commerce/day-resupplies.reader.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import { OrderWithdrawalsReader } from "../../domain/ports/order-withdrawals.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Ce que le retirage absorbe : les commandes du commerce, moins les retraits. */
export interface OrderIntake {
  readonly withdrawn: ReadonlySet<string>;
  readonly producible: readonly ProducibleOrder[];
}

/** Ce que l'arrêt fige : les commandes, les retraits, et les réassorts « pour demain ». */
export interface ArrestIntake extends OrderIntake {
  readonly resupplies: readonly PlacedResupply[];
}

/**
 * **Ce que l'arrêt et le retirage lisent, SOUS le verrou de la journée** —
 * sorti des deux handlers (audit du réassort, 2026-11-02 : douze et dix
 * dépendances), comme `ResupplyLaunchReading` pour le lancement. L'appelant a
 * DÉJÀ pris le verrou ; ces lectures ne le prennent pas, et n'ont de sens
 * qu'après lui — la passation, l'annulation et l'envoi d'un réassort prennent
 * le même verrou par leur guichet, donc ce qui est lu ici est définitif.
 *
 * Rien ne s'y lit hors verrou : le coup d'œil à l'en-tête qui précède l'arrêt
 * est passé à `PlanArrestAdmission` le 2026-11-03, avec l'heure limite qu'il
 * servait à contrôler.
 */
@Injectable()
export class PlanIntakeReading {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly orders: DayOrdersReader,
    private readonly withdrawals: OrderWithdrawalsReader,
    private readonly resupplies: DayResuppliesReader,
  ) {}

  /** La journée RECHARGÉE sous le verrou : c'est elle qui décide. */
  dayUnderLock(day: ServiceDay): Promise<ProductionDay> {
    return this.days.load(day);
  }

  /**
   * Les retraits de l'annulation staff, puis les réassorts « pour demain »,
   * puis les commandes — dans cet ordre, tous sous le verrou.
   */
  async arrestUnderLock(day: ServiceDay): Promise<ArrestIntake> {
    const withdrawn = await this.withdrawals.withdrawnOn(day);
    const resupplies = await this.resupplies.placedFor(day);
    const producible = await this.orders.producibleFor(day);
    return { withdrawn, resupplies, producible };
  }

  /** Les retraits, puis les commandes : le retirage n'absorbe aucun réassort. */
  async retakeUnderLock(day: ServiceDay): Promise<OrderIntake> {
    const withdrawn = await this.withdrawals.withdrawnOn(day);
    const producible = await this.orders.producibleFor(day);
    return { withdrawn, producible };
  }
}
