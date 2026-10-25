import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { OrderCustomerNudgesSnapshot } from "../../../domain/entities/order-customer-nudges.js";
import {
  DelayWarningAlreadySentError,
  DelayWarningRefusedError,
  DelayWarningTooEarlyError,
} from "../../../domain/errors/customer-nudge-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import { OneRecipientReader } from "../../../application/handlers/__tests__/payment-failure-doubles.js";
import { WarnCustomerOfDelayCommand } from "../warn-customer-of-delay.command.js";
import { WarnCustomerOfDelayHandler } from "../warn-customer-of-delay.handler.js";
import {
  FixedNudgeDelays,
  OneOrderNudges,
  minutesAfterEnd,
  nudgeSnapshot,
} from "./customer-nudge-doubles.js";

/**
 * **« Avertir le client »** (2026-10-25) : la fin du créneau est passée, la
 * commande n'est pas prête. Ce qui part, ce qui se trace, ce qui est refusé.
 */

const NOT_READY = nudgeSnapshot({ status: "confirmed", readyAt: null });

class FixedOrigins extends OrderMailOrigins {
  override clientBaseUrl(): string | null {
    return "https://app.lfc.test";
  }

  override adminBaseUrl(): string | null {
    return null;
  }
}

/** Garde les envois ; peut refuser, comme un fournisseur en panne. */
class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails, keyof B2bMails>[] = [];
  refusal: Error | null = null;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.sent.push(args);
    return Promise.resolve({ providerId: "msg_1" });
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
  const nudges = new OneOrderNudges(options.snapshot === undefined ? NOT_READY : options.snapshot);
  const handler = new WarnCustomerOfDelayHandler(
    nudges,
    new FixedNudgeDelays({ pickupReminderMinutes: 0, delayWarningMinutes: options.delay ?? 0 }),
    new OneRecipientReader(options.email === undefined ? "camille@halles.test" : options.email),
    new FixedOrigins(),
    mailer,
    new FixedClock(options.now ?? minutesAfterEnd(20)),
    new DirectUnitOfWork(),
    work,
  );
  const run = async (): Promise<void> => {
    await handler.execute(new WarnCustomerOfDelayCommand("order_1", "staff_lea"));
    await work.whenIdle();
  };
  return { run, mailer, nudges };
}

describe("« Avertir le client »", () => {
  it("trace le geste et envoie « Votre commande prend du retard », dans la langue de la commande", async () => {
    const subject = setup();

    await subject.run();

    expect(subject.nudges.saved).toEqual([
      expect.objectContaining({
        delayWarning: { at: minutesAfterEnd(20), byStaffId: "staff_lea" },
      }),
    ]);
    expect(subject.mailer.sent).toEqual([
      {
        to: "camille@halles.test",
        template: "customer.order-delayed",
        idempotencyKey: "order.delay-warning:order_1",
        data: {
          reference: "ORD-4812",
          pickupLabel: "Le Labo",
          orderUrl: "https://app.lfc.test/mes-commandes",
          locale: "it",
        },
      },
    ]);
  });

  it("🔴 refuse un second avertissement, sans rien envoyer", async () => {
    const subject = setup({
      snapshot: {
        ...NOT_READY,
        delayWarning: { at: minutesAfterEnd(1), byStaffId: "staff_karim" },
      },
    });

    await expect(subject.run()).rejects.toBeInstanceOf(DelayWarningAlreadySentError);
    expect(subject.mailer.sent).toEqual([]);
  });

  it("🔴 refuse avant le délai réglé après la fin du créneau", async () => {
    const subject = setup({ now: minutesAfterEnd(4), delay: 5 });

    await expect(subject.run()).rejects.toBeInstanceOf(DelayWarningTooEarlyError);
    expect(subject.mailer.sent).toEqual([]);
  });

  it("🔴 refuse sur une commande déjà prête : c'est un rappel qu'il faut", async () => {
    const subject = setup({ snapshot: nudgeSnapshot() });

    await expect(subject.run()).rejects.toBeInstanceOf(DelayWarningRefusedError);
    expect(subject.mailer.sent).toEqual([]);
  });

  it("refuse sans adresse lisible", async () => {
    const subject = setup({ email: null });

    await expect(subject.run()).rejects.toBeInstanceOf(DelayWarningRefusedError);
  });

  it("refuse sur une commande introuvable", async () => {
    await expect(setup({ snapshot: null }).run()).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("un envoi refusé par le fournisseur ne fait pas échouer le geste : il est journalisé", async () => {
    const subject = setup();
    subject.mailer.refusal = new Error("Resend indisponible");

    await expect(subject.run()).resolves.toBeUndefined();
    expect(subject.nudges.saved).toHaveLength(1);
  });
});
