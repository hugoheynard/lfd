import { Injectable } from "@nestjs/common";

import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../channels/commerce/day-orders.reader.js";
import { OrderRevisionNoticesReader } from "../../domain/ports/order-revision-notices.reader.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Les commandes lues hors verrou, avec le repère des révisions pris AVANT elles. */
export interface DayOrdersSnapshot {
  readonly marker: number | null;
  readonly producible: readonly ProducibleOrder[];
}

/**
 * **Une révision n'est jamais inscrite dans une ancienne composition** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §9.1, 2026-10-23).
 *
 * La clôture et le retirage lisent les commandes du commerce HORS du verrou
 * de la journée — pas de lecture d'un autre bloc sous un verrou tenu, en temps
 * normal. Une révision validée entre cette lecture et le verrou aurait été
 * inscrite dans son ancienne composition (ou dans l'ancienne journée).
 *
 * Le repère des notes de révision est lu AVANT les commandes, puis relu SOUS
 * le verrou : s'il a bougé, une révision est passée entre les deux, et les
 * commandes sont RELUES sous le verrou. C'est la seule lecture du commerce
 * faite sous le verrou de la journée, et elle n'arrive que dans ce cas : le
 * guichet de la révision tient la journée jusqu'à son `COMMIT`, donc la
 * relecture voit la révision validée.
 *
 * Le plan disait « comparer la révision lue à la révision notée » ; le repère
 * par journée tient la même garantie sans faire porter une révision à chaque
 * commande lue par le fournil (écart de mécanique, signalé au rapport du lot M1).
 */
@Injectable()
export class FreshDayOrders {
  constructor(
    private readonly orders: DayOrdersReader,
    private readonly notices: OrderRevisionNoticesReader,
  ) {}

  /** HORS verrou : le repère, puis les commandes — dans cet ordre. */
  async read(day: ServiceDay): Promise<DayOrdersSnapshot> {
    const marker = await this.notices.markerOf(day);
    const producible = await this.orders.producibleFor(day);
    return { marker, producible };
  }

  /** SOUS le verrou : les commandes lues, ou relues si une révision est passée depuis. */
  async underLock(day: ServiceDay, read: DayOrdersSnapshot): Promise<readonly ProducibleOrder[]> {
    if ((await this.notices.markerOf(day)) === read.marker) {
      return read.producible;
    }
    return this.orders.producibleFor(day);
  }
}
