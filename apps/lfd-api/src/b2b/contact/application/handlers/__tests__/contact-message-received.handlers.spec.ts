import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { ContactMessage } from "../../../domain/contact-message.js";
import { ContactMessageReceivedEvent } from "../../../domain/contact-message.events.js";
import { MailContactMessage } from "../mail-contact-message.handler.js";
import {
  CONTACT_MESSAGES_LINK,
  RingContactMessageReceived,
} from "../ring-contact-message-received.handler.js";

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

const EVENT = new ContactMessageReceivedEvent(
  ContactMessage.receive({
    id: "m1",
    subject: { id: "s1", labelFr: "Devenir client pro", priority: "urgent" },
    audience: "b2b",
    author: { name: "Jean Martin", email: "jean@exemple.fr", phone: "06 00 00 00 00" },
    body: "Bonjour",
    userId: "u1",
    companyId: "c1",
    at: new Date(0),
  }),
  "commercial@lfc.fr",
);

describe("MailContactMessage — le courriel à l'adresse de l'objet", () => {
  it("écrit à l'adresse de l'objet, Reply-To = l'auteur", async () => {
    const mailer = new RecordingMailer();
    const work = new BackgroundWork();
    new MailContactMessage(mailer, work).handle(EVENT);
    await work.whenIdle();

    expect(mailer.sent).toEqual([
      {
        to: "commercial@lfc.fr",
        replyTo: "jean@exemple.fr",
        template: "staff.contact-message",
        idempotencyKey: "contact-message:m1",
        data: {
          subjectLabel: "Devenir client pro",
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

  it("un envoi refusé ne lève pas : le message reste rangé", async () => {
    const mailer = new RecordingMailer();
    mailer.refusal = new Error("Resend indisponible");
    const work = new BackgroundWork();
    new MailContactMessage(mailer, work).handle(EVENT);
    await expect(work.whenIdle()).resolves.toBeUndefined();
  });
});

describe("MailContactMessage — une adresse refusée en en-tête", () => {
  it("part SANS Reply-To plutôt que pas du tout", async () => {
    const mailer = new RecordingMailer();
    const work = new BackgroundWork();
    // Valide pour le domaine (pas d'espace, une arobase, un point), refusée en
    // en-tête par le mailer (chevron).
    const odd = ContactMessage.receive({
      id: "m2",
      subject: { id: "s1", labelFr: "Devenir client pro", priority: "medium" },
      audience: "b2c",
      author: { name: "Jean", email: "jean<x>@exemple.fr", phone: "" },
      body: "Bonjour",
      userId: null,
      companyId: null,
      at: new Date(0),
    });
    new MailContactMessage(mailer, work).handle(
      new ContactMessageReceivedEvent(odd, "commercial@lfc.fr"),
    );
    await work.whenIdle();

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).not.toHaveProperty("replyTo");
    expect(mailer.sent[0]?.data).toMatchObject({ authorEmail: "jean<x>@exemple.fr" });
  });
});

describe("RingContactMessageReceived — la cloche", () => {
  it("sonne pour qui lit `b2b_contact`, sans le nom ni le texte de l'auteur", async () => {
    const notifier = new RecordingNotifier();
    const work = new BackgroundWork();
    new RingContactMessageReceived(notifier, work).handle(EVENT);
    await work.whenIdle();

    expect(notifier.notices).toHaveLength(1);
    const notice = notifier.notices[0];
    expect(notice).toMatchObject({
      kind: "contact.message_received",
      link: CONTACT_MESSAGES_LINK,
      audience: "b2b_contact:read",
      idempotencyKey: "notification:contact.message_received:m1",
    });
    expect(JSON.stringify(notice)).not.toMatch(/Jean|exemple\.fr|Bonjour/u);
  });
});
