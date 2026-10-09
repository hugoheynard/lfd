import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CustomerRequestReceivedEvent } from "../../../domain/customer-request.events.js";
import {
  AT,
  contactRequest,
  orderProblem,
  photo,
} from "../../../domain/__tests__/request-fixtures.js";
import { MailCustomerRequest } from "../mail-customer-request.handler.js";
import {
  CUSTOMER_REQUESTS_LINK,
  RingCustomerRequestReceived,
} from "../ring-customer-request-received.handler.js";

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

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

const CONTACT = new CustomerRequestReceivedEvent(
  contactRequest({ audience: "b2b", companyId: "c1", body: "Bonjour" }),
  "commercial@lfc.fr",
);

function problemEvent(): CustomerRequestReceivedEvent {
  const problem = orderProblem();
  problem.attachPhoto("p1", photo(), AT);
  problem.attachPhoto("p2", photo(), AT);
  return new CustomerRequestReceivedEvent(problem, "sav@lfc.fr");
}

async function mailOf(event: CustomerRequestReceivedEvent): Promise<RecordingMailer> {
  const mailer = new RecordingMailer();
  const work = new BackgroundWork();
  new MailCustomerRequest(mailer, work).handle(event);
  await work.whenIdle();
  return mailer;
}

describe("MailCustomerRequest — le courriel à l'adresse du motif", () => {
  it("« Nous écrire » : Reply-To = l'auteur, sans commande ni photo", async () => {
    const mailer = await mailOf(CONTACT);
    expect(mailer.sent).toEqual([
      {
        to: "commercial@lfc.fr",
        replyTo: "jean@exemple.fr",
        template: "staff.customer-request",
        idempotencyKey: "customer-request:q1",
        data: {
          requestId: "q1",
          formLabel: "Nous écrire",
          orderNumber: "",
          photoCount: 0,
          reasonLabel: "Devenir client pro",
          urgent: true,
          authorName: "Jean Martin",
          authorEmail: "jean@exemple.fr",
          authorPhone: "06 00 00 00 00",
          originLabel: "Espace pro",
          clientLabel: "société c1",
          message: "Bonjour",
        },
      },
    ]);
  });

  it("un signalement porte la référence de la commande et le nombre de photos — pas les photos", async () => {
    const mailer = await mailOf(problemEvent());
    expect(mailer.sent[0]?.data).toMatchObject({
      formLabel: "Signaler un problème",
      orderNumber: "CMD-0001",
      photoCount: 2,
      clientLabel: "compte u1",
    });
    expect(JSON.stringify(mailer.sent[0])).not.toContain("requests/");
  });

  it("un envoi refusé ne lève pas : la demande reste rangée", async () => {
    const mailer = new RecordingMailer();
    mailer.refusal = new Error("Resend indisponible");
    const work = new BackgroundWork();
    new MailCustomerRequest(mailer, work).handle(CONTACT);
    await expect(work.whenIdle()).resolves.toBeUndefined();
  });

  it("une adresse refusée en en-tête part SANS Reply-To plutôt que pas du tout", async () => {
    // Valide pour le domaine, refusée en en-tête par le mailer (chevron).
    const odd = contactRequest({
      author: { name: "Jean", email: "jean<x>@exemple.fr", phone: "" },
    });
    const mailer = await mailOf(new CustomerRequestReceivedEvent(odd, "commercial@lfc.fr"));
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).not.toHaveProperty("replyTo");
  });
});

describe("RingCustomerRequestReceived — la cloche", () => {
  it("sonne pour qui lit `b2b_contact`, vers la boîte, sans le nom ni le texte", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();
    new RingCustomerRequestReceived(notifier, work).handle(problemEvent());
    await work.whenIdle();

    expect(notifier.notices).toHaveLength(1);
    const notice = notifier.notices[0];
    expect(notice).toMatchObject({
      kind: "customer_request.received",
      subject: "Signaler un problème — Produit abîmé",
      link: CUSTOMER_REQUESTS_LINK,
      audience: "b2b_contact:read",
      idempotencyKey: "notification:customer_request.received:q1",
    });
    expect(CUSTOMER_REQUESTS_LINK).toBe("/b2b/demandes");
    expect(JSON.stringify(notice)).not.toMatch(/Jean|exemple\.fr|écrasé/u);
  });
});
