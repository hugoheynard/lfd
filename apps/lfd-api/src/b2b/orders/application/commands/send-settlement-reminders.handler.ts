import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { OrderCutoffReader } from "../../domain/ports/order-cutoff.reader.js";
import {
  UnpaidLinkOrderReader,
  type UnpaidLinkOrder,
} from "../../domain/ports/unpaid-link-order.reader.js";
import {
  isSettlementReminderDue,
  settlementReminderDay,
} from "../../domain/services/settlement-reminder.js";
import {
  SendSettlementRemindersCommand,
  type SettlementRemindersReport,
} from "./send-settlement-reminders.command.js";

/** Nature du fait dans la cloche. */
const REMINDER_KIND = "order.settlement_overdue";

/**
 * **Le lien de paiement n'est pas réglé à l'heure limite : on prévient le
 * commercial** (plan `documentation/order/plan-abandon-du-reglement.md`, Q6,
 * S5).
 *
 * Une commande saisie par l'équipe en `link` attend que le client clique. S'il
 * ne le fait pas, elle sortait du plan en silence, puis la clôture l'annulait
 * (Q7). Entre l'heure limite et la clôture, il reste le temps de relancer.
 *
 * ## Une seule fois par commande
 *
 * La passe est horaire et rejouable : elle recalcule tout à chaque tour, et
 * c'est la **clé d'idempotence** de la cloche — une par commande, sans
 * l'instant — qui fait qu'une commande ne sonne qu'une fois. La cloche écarte
 * le doublon avant de pousser vers les téléphones (`StaffNoticeStore`).
 *
 * ## La fenêtre
 *
 * Avant l'heure limite, rien. Après la clôture, rien non plus : la commande
 * est annulée et le lecteur ne la rend plus. Sans règle d'heure limite pour la
 * journée, rien — il n'y a pas de « trop tard » à annoncer.
 *
 * Sans destinataire nommé : « le commercial » est un rôle, la cloche est
 * visible de tout le back-office (§5, comme `RingFailedProSettlement`).
 */
@CommandHandler(SendSettlementRemindersCommand)
export class SendSettlementRemindersHandler implements ICommandHandler<
  SendSettlementRemindersCommand,
  SettlementRemindersReport
> {
  constructor(
    private readonly orders: UnpaidLinkOrderReader,
    private readonly cutoffs: OrderCutoffReader,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<SettlementRemindersReport> {
    const candidates = await this.orders.awaitingSettlement();
    if (candidates.length === 0) {
      return { overdue: 0 };
    }
    const rules = await this.cutoffs.list();
    const now = this.clock.now();
    const overdue = candidates.filter((order) =>
      isSettlementReminderDue(rules, settlementReminderDay(order), now),
    );
    if (overdue.length > 0) {
      await this.notifier.notify(overdue.map((order) => reminderOf(order, now)));
    }
    return { overdue: overdue.length };
  }
}

/** La notice d'une commande en retard : qui, laquelle, et le geste. */
function reminderOf(order: UnpaidLinkOrder, now: Date): StaffNotice {
  const who = order.companyName ?? order.orderNumber;
  return {
    kind: REMINDER_KIND,
    subject: `Lien de paiement non réglé — ${who}`,
    body:
      `Commande ${order.orderNumber} pas réglée à l'heure limite : relancer le client ` +
      "avant la fournée, sinon elle sera annulée à la clôture.",
    link: `/commandes/${order.orderId}`,
    idempotencyKey: `notification:${REMINDER_KIND}:${order.orderId}`,
    occurredAt: now,
  };
}
