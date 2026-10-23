import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import {
  OrderChangeAppliedEvent,
  OrderChangeRefusedEvent,
} from "../../../domain/order-change.events.js";
import { ORDER, orderChange } from "../../../domain/__tests__/request-fixtures.js";
import { MailOrderChangeApplied } from "../mail-order-change-applied.handler.js";
import { MailOrderChangeRefused } from "../mail-order-change-refused.handler.js";

class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails>[] = [];
  refusal: Error | null = null;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.sent.push(args);
    return Promise.resolve({ providerId: "re_1" });
  }
}

const SUBJECT = { requestId: "q1", order: ORDER, baseRevision: 1 };

/** Les deux réponses partent à l'auteur de la demande (M4) ; un échec d'envoi ne remonte pas. */
describe("les courriels de réponse à une demande de modification", () => {
  it("appliquée : au client, la référence de la commande", async () => {
    const mailer = new RecordingMailer();
    const work = new BackgroundWork();
    new MailOrderChangeApplied(mailer, work).handle(
      new OrderChangeAppliedEvent(orderChange(), SUBJECT, 2),
    );
    await work.whenIdle();
    expect(mailer.sent).toEqual([
      {
        to: "jean@exemple.fr",
        template: "customer.order-change-applied",
        idempotencyKey: "order-change-applied:q1",
        data: { reference: "CMD-0001", locale: "fr" },
      },
    ]);
  });

  it("refusée : au client, avec le mot de l'équipe", async () => {
    const mailer = new RecordingMailer();
    const work = new BackgroundWork();
    new MailOrderChangeRefused(mailer, work).handle(
      new OrderChangeRefusedEvent(orderChange(), SUBJECT, "La fournée est lancée."),
    );
    await work.whenIdle();
    expect(mailer.sent[0]).toMatchObject({
      to: "jean@exemple.fr",
      template: "customer.order-change-refused",
      data: { reference: "CMD-0001", reason: "La fournée est lancée." },
    });
  });

  it("un envoi refusé ne fait rien échouer : la réponse reste lisible sur la commande", async () => {
    const mailer = new RecordingMailer();
    mailer.refusal = new Error("resend");
    const work = new BackgroundWork();
    new MailOrderChangeApplied(mailer, work).handle(
      new OrderChangeAppliedEvent(orderChange(), SUBJECT, 2),
    );
    await expect(work.whenIdle()).resolves.toBeUndefined();
  });
});
