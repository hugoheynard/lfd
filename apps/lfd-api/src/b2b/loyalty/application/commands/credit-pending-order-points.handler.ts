import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompletedOrderReader } from "../../../orders/domain/ports/completed-order.reader.js";
import { LoyaltyEarnedOrdersReader } from "../../domain/ports/loyalty-earned-orders.reader.js";
import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { OrderPointsCrediting } from "../services/order-points-crediting.js";
import {
  CreditPendingOrderPointsCommand,
  type PendingOrderPointsReport,
} from "./credit-pending-order-points.command.js";

/** Un lot lu d'un coup : une lecture reste courte, et chaque gain a sa transaction. */
export const CREDIT_BATCH = 200;

/**
 * Parcourt les commandes définitives par lots bornés, écarte celles qui ont
 * déjà leur gain, et crédite le reste — une transaction par commande : un
 * échec n'en emporte qu'une, et le passage suivant la reprend.
 *
 * Programme fermé : rien n'est parcouru. Il lit l'état, pas les événements —
 * c'est ce qui couvre tous les chemins vers `paid`, présents et à venir.
 *
 * `@hors-transaction` le passage entier : chaque gain ouvre SA transaction
 * dans `OrderPointsCrediting`, et y trace son fait. Une transaction englobant
 * tout le parcours tiendrait des verrous de titulaires pendant des lots
 * entiers, et un échec annulerait des gains déjà justes.
 */
@CommandHandler(CreditPendingOrderPointsCommand)
export class CreditPendingOrderPointsHandler implements ICommandHandler<
  CreditPendingOrderPointsCommand,
  PendingOrderPointsReport
> {
  constructor(
    private readonly orders: CompletedOrderReader,
    private readonly earned: LoyaltyEarnedOrdersReader,
    private readonly settings: LoyaltySettingsReader,
    private readonly crediting: OrderPointsCrediting,
  ) {}

  async execute(): Promise<PendingOrderPointsReport> {
    const settings = await this.settings.read();
    if (settings === null) {
      return { scanned: 0, credited: 0 };
    }
    let after: string | null = null;
    let scanned = 0;
    let credited = 0;
    do {
      const page = await this.orders.listCompleted(after, CREDIT_BATCH);
      const done = await this.earned.earnedAmong(page.orders.map((order) => order.orderId));
      for (const order of page.orders) {
        if (
          !done.has(order.orderId) &&
          (await this.crediting.creditEarnedPoints(order, settings))
        ) {
          credited += 1;
        }
      }
      scanned += page.orders.length;
      after = page.nextAfter;
    } while (after !== null);
    return { scanned, credited };
  }
}
