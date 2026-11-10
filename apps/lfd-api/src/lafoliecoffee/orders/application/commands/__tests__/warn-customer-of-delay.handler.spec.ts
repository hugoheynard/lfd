import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { orderPageLink } from "../../../cancellation/application/commands/__tests__/customer-cancellation-doubles.js";
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

function setup(
  options: {
    readonly snapshot?: OrderCustomerNudgesSnapshot | null;
    readonly email?: string | null;
    readonly now?: Date;
    readonly delay?: number;
  } = {},
) {
  const unitOfWork = new OpenableUnitOfWork();
  const mailer = new RecordingMail(unitOfWork);
  const nudges = new OneOrderNudges(options.snapshot === undefined ? NOT_READY : options.snapshot);
  const handler = new WarnCustomerOfDelayHandler(
    nudges,
    new FixedNudgeDelays({ pickupReminderMinutes: 0, delayWarningMinutes: options.delay ?? 0 }),
    new OneRecipientReader(options.email === undefined ? "camille@halles.test" : options.email),
    new FixedOrigins(),
    orderPageLink(),
    mailer,
    new FixedClock(options.now ?? minutesAfterEnd(20)),
    unitOfWork,
  );
  const run = async (): Promise<void> => {
    await handler.execute(new WarnCustomerOfDelayCommand("order_1", "staff_lea"));
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
    expect(subject.mailer.queued).toEqual([
      {
        to: "camille@halles.test",
        template: "customer.order-delayed",
        idempotencyKey: "order.delay-warning:order_1",
        subjects: [{ type: "order", id: "order_1" }],
        data: {
          reference: "ORD-4812",
          pickupLabel: "Le Labo",
          orderUrl: "https://app.lfc.test/mes-commandes/order_1",
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
    expect(subject.mailer.queued).toEqual([]);
  });

  it("🔴 refuse avant le délai réglé après la fin du créneau", async () => {
    const subject = setup({ now: minutesAfterEnd(4), delay: 5 });

    await expect(subject.run()).rejects.toBeInstanceOf(DelayWarningTooEarlyError);
    expect(subject.mailer.queued).toEqual([]);
  });

  it("🔴 refuse sur une commande déjà prête : c'est un rappel qu'il faut", async () => {
    const subject = setup({ snapshot: nudgeSnapshot() });

    await expect(subject.run()).rejects.toBeInstanceOf(DelayWarningRefusedError);
    expect(subject.mailer.queued).toEqual([]);
  });

  it("refuse sans adresse lisible", async () => {
    const subject = setup({ email: null });

    await expect(subject.run()).rejects.toBeInstanceOf(DelayWarningRefusedError);
  });

  it("refuse sur une commande introuvable", async () => {
    await expect(setup({ snapshot: null }).run()).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  /**
   * Depuis S2a (plan `plan-service-e-mails.md`), le courriel est DEMANDÉ dans
   * la transaction du geste : l'envoi au fournisseur se fait après la
   * validation, par le bloc `mail`, et son échec ne remonte plus ici. Ce qui
   * peut encore échouer est la demande elle-même — une écriture — et elle
   * emporte la trace avec elle.
   */
  it("une demande qui échoue fait échouer le geste : la trace et le courriel tombent ensemble", async () => {
    const subject = setup();
    subject.mailer.failWith = new TypeError("base indisponible");

    await expect(subject.run()).rejects.toThrow("base indisponible");
  });
});
