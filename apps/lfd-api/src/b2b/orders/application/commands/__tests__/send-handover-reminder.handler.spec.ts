import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { OrderCustomerNudgesSnapshot } from "../../../domain/entities/order-customer-nudges.js";
import {
  PickupReminderAlreadySentError,
  PickupReminderTooEarlyError,
} from "../../../domain/errors/customer-nudge-errors.js";
import { OrderNotFoundError, ReminderRefusedError } from "../../../domain/errors/order-errors.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import { AT_PLACEMENT } from "../../../domain/services/order-sheet.js";
import {
  OneOrderReader,
  OneRecipientReader,
  RecordingMailer,
  orderView,
} from "../../../application/handlers/__tests__/payment-failure-doubles.js";
import { OrderReadyMail } from "../../services/order-ready-mail.service.js";
import { SendHandoverReminderCommand } from "../send-handover-reminder.command.js";
import { SendHandoverReminderHandler } from "../send-handover-reminder.handler.js";
import {
  FixedNudgeDelays,
  OneOrderNudges,
  minutesAfterEnd,
  nudgeSnapshot,
} from "./customer-nudge-doubles.js";
import { FixedRemainders } from "../../handlers/__tests__/remainder-shipment-doubles.js";

/**
 * **« Rappel au client »**, depuis la Supervision (2026-10-25) : ce qui part,
 * ce qui se trace, et ce qui est refusé avant d'envoyer quoi que ce soit.
 *
 * 🔴 Il ne partait que sur une commande prête, mais se répétait à volonté :
 * sa clé portait l'instant. Il ne part désormais qu'UNE fois, passé le délai
 * réglé après la fin du créneau, et la commande garde qui l'a envoyé.
 */

class FixedOrigins extends OrderMailOrigins {
  override clientBaseUrl(): string | null {
    return "https://app.lfc.test";
  }

  override adminBaseUrl(): string | null {
    return "https://admin.lfc.test";
  }
}

function setup(
  options: {
    readonly snapshot?: OrderCustomerNudgesSnapshot | null;
    readonly email?: string | null;
    readonly now?: Date;
    readonly delay?: number;
  } = {},
) {
  const mailer = new RecordingMailer();
  const work = new BackgroundWork();
  const nudges = new OneOrderNudges(
    options.snapshot === undefined ? nudgeSnapshot() : options.snapshot,
  );
  const recipients = new OneRecipientReader(
    options.email === undefined ? "camille@halles.test" : options.email,
  );
  const orders = new OneOrderReader({
    view: { ...orderView("ready", "paid"), id: "order_1" },
    companyId: null,
    placedByUserId: "user_7",
    stripePaymentIntentId: null,
    clientele: "public",
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  });
  const handler = new SendHandoverReminderHandler(
    nudges,
    new FixedNudgeDelays({ pickupReminderMinutes: options.delay ?? 0, delayWarningMinutes: 0 }),
    recipients,
    new OrderReadyMail(orders, recipients, new FixedOrigins(), mailer, new FixedRemainders()),
    new FixedClock(options.now ?? minutesAfterEnd(20)),
    new DirectUnitOfWork(),
    work,
  );
  const run = async (): Promise<void> => {
    await handler.execute(new SendHandoverReminderCommand("order_1", "staff_karim"));
    await work.whenIdle();
  };
  return { run, mailer, nudges };
}

describe("« Rappel au client »", () => {
  it("trace le geste et envoie le courriel de retrait, en-tête de rappel, au client", async () => {
    const subject = setup();

    await subject.run();

    expect(subject.nudges.saved).toEqual([
      expect.objectContaining({
        pickupReminder: { at: minutesAfterEnd(20), byStaffId: "staff_karim" },
      }),
    ]);
    expect(subject.mailer.sent).toHaveLength(1);
    expect(subject.mailer.sent[0]?.to).toBe("camille@halles.test");
    expect(subject.mailer.sent[0]?.template).toBe("customer.order-ready");
    expect(subject.mailer.sent[0]?.data).toMatchObject({ reminder: true });
  });

  it("🔴 porte UNE clé par commande : il ne part qu'une fois", async () => {
    const subject = setup();

    await subject.run();

    expect(subject.mailer.sent[0]?.idempotencyKey).toBe("order.pickup-reminder:order_1");
  });

  it("🔴 refuse un second rappel, sans rien envoyer", async () => {
    const subject = setup({
      snapshot: nudgeSnapshot({
        pickupReminder: { at: minutesAfterEnd(5), byStaffId: "staff_lea" },
      }),
    });

    await expect(subject.run()).rejects.toBeInstanceOf(PickupReminderAlreadySentError);
    expect(subject.mailer.sent).toEqual([]);
    expect(subject.nudges.saved).toEqual([]);
  });

  it("🔴 refuse avant le délai réglé après la fin du créneau", async () => {
    const subject = setup({ now: minutesAfterEnd(10), delay: 15 });

    await expect(subject.run()).rejects.toBeInstanceOf(PickupReminderTooEarlyError);
    expect(subject.mailer.sent).toEqual([]);
  });

  it("🔴 refuse sur une commande que le fournil n'a pas déclarée prête", async () => {
    const subject = setup({ snapshot: nudgeSnapshot({ status: "confirmed", readyAt: null }) });

    await expect(subject.run()).rejects.toBeInstanceOf(ReminderRefusedError);
    expect(subject.mailer.sent).toEqual([]);
  });

  it("refuse sans adresse lisible, plutôt que de dire qu'un message est parti", async () => {
    const subject = setup({ email: null });

    await expect(subject.run()).rejects.toBeInstanceOf(ReminderRefusedError);
    expect(subject.mailer.sent).toEqual([]);
  });

  it("refuse sur une commande introuvable", async () => {
    const subject = setup({ snapshot: null });

    await expect(subject.run()).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
