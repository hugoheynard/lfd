import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { OrderNoShowSnapshot } from "../../../domain/entities/order-no-show.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  NoShowNoticeAlreadyRequestedError,
  NoShowNoticeRefusedError,
} from "../../../domain/errors/order-no-show-errors.js";
import { OneRecipientReader } from "../../handlers/__tests__/payment-failure-doubles.js";
import { RequestNoShowNoticeCommand } from "../request-no-show-notice.command.js";
import { RequestNoShowNoticeHandler } from "../request-no-show-notice.handler.js";
import { OneOrderNoShow, minutesAfterEnd, noShowSnapshot } from "./no-show-doubles.js";

/**
 * **« Prévenir le client »** : l'e-mail « commande non retirée » est demandé
 * une fois, dans la transaction qui trace la demande ; rien sans adresse.
 */

const DECLARED = noShowSnapshot({
  status: "no_show",
  declared: { at: minutesAfterEnd(30), byStaffId: "staff_lea" },
});

function setup(
  options: { readonly snapshot?: OrderNoShowSnapshot | null; readonly email?: string | null } = {},
) {
  const clock = new FixedClock(minutesAfterEnd(90));
  const unitOfWork = new OpenableUnitOfWork();
  const mailer = new RecordingMail(unitOfWork);
  const noShows = new OneOrderNoShow(options.snapshot === undefined ? DECLARED : options.snapshot);
  const handler = new RequestNoShowNoticeHandler(
    noShows,
    new OneRecipientReader(options.email === undefined ? "camille@halles.test" : options.email),
    mailer,
    new OncePerIntent(new InMemoryGestureIntentLedger(), clock),
    clock,
    unitOfWork,
  );
  const run = (key = "key_1", staff = "staff_sup"): Promise<void> =>
    handler.execute(new RequestNoShowNoticeCommand("order_1", staff, key));
  return { run, mailer, noShows };
}

describe("RequestNoShowNoticeHandler", () => {
  it("trace la demande et demande « commande non retirée », dans la langue de la commande, sans montant", async () => {
    const subject = setup();

    await subject.run();

    expect(subject.noShows.saved).toEqual([
      expect.objectContaining({
        noticeRequested: { at: minutesAfterEnd(90), byStaffId: "staff_sup" },
      }),
    ]);
    expect(subject.mailer.queued).toEqual([
      {
        to: "camille@halles.test",
        template: "customer.order-not-collected",
        idempotencyKey: "order.no-show-notice:order_1",
        subjects: [{ type: "order", id: "order_1" }],
        data: { reference: "ORD-4812", pickupLabel: "Le Labo", locale: "it" },
      },
    ]);
  });

  it("rejouée avec la même clé, ne demande pas un second e-mail", async () => {
    const subject = setup();

    await subject.run("key_1");
    await subject.run("key_1");

    expect(subject.mailer.queued).toHaveLength(1);
  });

  it("avec une autre clé, refuse : l'e-mail ne part qu'une fois par commande", async () => {
    const subject = setup();
    await subject.run("key_1");

    await expect(subject.run("key_2", "staff_max")).rejects.toThrow(
      NoShowNoticeAlreadyRequestedError,
    );
    expect(subject.mailer.queued).toHaveLength(1);
  });

  it("refuse une commande qui n'est pas déclarée non retirée, sans rien demander", async () => {
    const subject = setup({ snapshot: noShowSnapshot() });

    await expect(subject.run()).rejects.toThrow(NoShowNoticeRefusedError);
    expect(subject.mailer.queued).toEqual([]);
  });

  it("sans adresse lisible, refuse et dit d'appeler le client", async () => {
    const subject = setup({ email: null });

    await expect(subject.run()).rejects.toThrow("Appelez le client");
    expect(subject.mailer.queued).toEqual([]);
  });

  it("refuse une commande inconnue", async () => {
    const subject = setup({ snapshot: null });

    await expect(subject.run()).rejects.toThrow(OrderNotFoundError);
  });
});
