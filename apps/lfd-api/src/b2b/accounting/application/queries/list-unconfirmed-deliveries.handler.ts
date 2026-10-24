import type { UnconfirmedDeliveriesView } from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnconfirmedDeliveriesReader } from "../../domain/ports/unconfirmed-deliveries.reader.js";
import { unconfirmedDeliveryView } from "../unconfirmed-delivery-view.js";
import { ListUnconfirmedDeliveriesQuery } from "./list-unconfirmed-deliveries.query.js";

/**
 * **Les bons à constater** (plan
 * `documentation/comptabilite/facturation/plan-zero-faille.md`, §12, lot ZL).
 *
 * Depuis que la facture ne prend que les bons LIVRÉS, un bon dont personne
 * n'a constaté la remise n'est facturé nulle part ; sans cette liste, il
 * disparaîtrait en silence. « Passé » se juge au jour de Paris : le bon du
 * jour n'y entre que le lendemain.
 */
@QueryHandler(ListUnconfirmedDeliveriesQuery)
export class ListUnconfirmedDeliveriesHandler implements IQueryHandler<
  ListUnconfirmedDeliveriesQuery,
  UnconfirmedDeliveriesView
> {
  constructor(
    private readonly reader: UnconfirmedDeliveriesReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<UnconfirmedDeliveriesView> {
    const today = instantToLocal(this.clock.now()).day;
    const orders = await this.reader.servedBefore(today);
    return { before: today, orders: orders.map(unconfirmedDeliveryView) };
  }
}
