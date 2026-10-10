import type { SupportRequestView } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { AppConfig, type MailerConfig } from "../../../../../platform/config/app-config.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { SupportRequestedEvent } from "../../../domain/events/support-requested.event.js";
import { SupportRequestReader } from "../../../domain/ports/support-request.reader.js";
import { availabilityOf, MailSupportRequested } from "../mail-support-requested.handler.js";

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

class Settings extends AppConfig {
  constructor(private readonly inbox: string | null) {
    super();
  }
  override mailerConfig(): MailerConfig {
    return { ...super.mailerConfig(), staffInbox: this.inbox };
  }
}

class OneRequest extends SupportRequestReader {
  constructor(private readonly stored: SupportRequestView | null) {
    super();
  }
  find(id: string): Promise<SupportRequestView | null> {
    return Promise.resolve(this.stored?.id === id ? this.stored : null);
  }
}

/** Les dates ne sont comparées qu'entre elles ou à leur mise en forme, jamais à l'horloge. */
const REQUEST: SupportRequestView = {
  id: "sr_1",
  companyId: "c1",
  requestedByUserId: "user_1",
  channel: "phone",
  purpose: "billing",
  phoneNumber: "06 12 34 56 78",
  asap: true,
  scheduledDate: null,
  slot: null,
  message: "Une facture en double",
  handledAt: null,
  createdAt: "2026-06-01T08:00:00.000Z",
};

const EVENT = new SupportRequestedEvent(
  "sr_1",
  "c1",
  "user_1",
  "Le Pain Quotidien",
  "phone",
  new Date("2026-06-01T08:00:00.000Z"),
);

async function deliver(
  stored: SupportRequestView | null,
  inbox: string | null,
  mailer = new RecordingMailer(),
): Promise<RecordingMailer> {
  const work = new BackgroundWork();
  new MailSupportRequested(new OneRequest(stored), mailer, new Settings(inbox), work).handle(EVENT);
  await work.whenIdle();
  return mailer;
}

describe("MailSupportRequested — la demande de rappel, à la boîte de l'équipe", () => {
  it("relit la demande et envoie staff.support-requested", async () => {
    const mailer = await deliver(REQUEST, "equipe@lfc.fr");
    expect(mailer.sent).toEqual([
      {
        to: "equipe@lfc.fr",
        template: "staff.support-requested",
        data: {
          contactName: "Le Pain Quotidien",
          purposeLabel: "Facturation",
          availability: "Rappel au plus vite",
          phoneNumber: "06 12 34 56 78",
          message: "Une facture en double",
        },
        idempotencyKey: "mail:support.requested:sr_1",
      },
    ]);
  });

  it("sans boîte d'équipe, rien ne part", async () => {
    expect((await deliver(REQUEST, null)).sent).toEqual([]);
  });

  it("une demande introuvable n'envoie rien", async () => {
    expect((await deliver(null, "equipe@lfc.fr")).sent).toEqual([]);
  });

  it("une panne du fournisseur est avalée — le travail de fond se termine", async () => {
    const mailer = new RecordingMailer();
    mailer.refusal = new Error("Resend indisponible");
    await expect(deliver(REQUEST, "equipe@lfc.fr", mailer)).resolves.toBe(mailer);
  });
});

describe("availabilityOf", () => {
  it("par e-mail", () => {
    expect(availabilityOf({ ...REQUEST, channel: "email" })).toBe("Par e-mail");
  });

  it("un créneau daté : le jour en toutes lettres et la demi-journée", () => {
    expect(
      availabilityOf({ ...REQUEST, asap: false, scheduledDate: "2026-06-09", slot: "afternoon" }),
    ).toBe("mardi 9 juin, l'après-midi");
  });
});
