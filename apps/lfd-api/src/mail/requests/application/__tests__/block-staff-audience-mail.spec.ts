import { ConsoleLogger, Logger, type LoggerService } from "@nestjs/common";

import { AppConfig, type MailerConfig } from "../../../../platform/config/app-config.js";
import {
  type StaffNoticeRecipient,
  StaffNoticeRecipients,
} from "../../../../staff/notifications/domain/ports/staff-notice-recipients.js";
import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../channels/requests/__tests__/recording-mail.js";
import { BlockStaffAudienceMail } from "../block-staff-audience-mail.js";

class Inbox extends AppConfig {
  constructor(private readonly inbox: string | null) {
    super();
  }
  override mailerConfig(): MailerConfig {
    return { ...super.mailerConfig(), staffInbox: this.inbox };
  }
}

class FixedRecipients extends StaffNoticeRecipients {
  readonly asked: string[] = [];
  constructor(private readonly members: readonly StaffNoticeRecipient[]) {
    super();
  }
  recipientsOf(template: string): Promise<readonly StaffNoticeRecipient[]> {
    this.asked.push(template);
    return Promise.resolve(this.members);
  }
}

class CapturedWarnings implements LoggerService {
  readonly warnings: string[] = [];
  log(): void {}
  error(): void {}
  warn(message: unknown): void {
    this.warnings.push(String(message));
  }
}

const uow = new OpenableUnitOfWork();
const KEY = "mail:payment.link_paid:pay_1";

async function sendWith(members: readonly StaffNoticeRecipient[], inbox: string | null) {
  const mails = new RecordingMail(uow);
  const recipients = new FixedRecipients(members);
  const port = new BlockStaffAudienceMail(recipients, mails, new Inbox(inbox));
  const requested = await uow.run(() =>
    port.sendToStaffAudience({
      template: "staff.link-payment-received",
      data: {
        amountCents: 1_000,
        channelLabel: "lfc-stripe (Stripe)",
        payerLabel: "Café",
        applicationLabel: "La Folie Coffee",
        settledLabel: "Commande",
        screenPath: "/commandes/ord_1",
        linkCreatedOn: "lundi",
        linkCreatedAutomatically: true,
        linkAuthorName: "",
        refused: false,
      },
      subjects: [{ type: "payment", id: "pay_1" }],
      idempotencyKey: KEY,
    }),
  );
  return { mails, recipients, requested };
}

describe("BlockStaffAudienceMail — l'avis à l'équipe", () => {
  let captured: CapturedWarnings;
  beforeEach(() => {
    captured = new CapturedWarnings();
    Logger.overrideLogger(captured);
  });
  afterEach(() => {
    Logger.overrideLogger(new ConsoleLogger());
  });

  it("une demande par membre, clé suffixée de son id, et la liste des demandes", async () => {
    const { mails, recipients, requested } = await sendWith(
      [
        { staffUserId: "s_1", email: "anne@lfc.test" },
        { staffUserId: "s_2", email: "bruno@lfc.test" },
      ],
      "equipe@lfc.test",
    );

    expect(recipients.asked).toEqual(["staff.link-payment-received"]);
    expect(mails.queued.map((mail) => [mail.to, mail.idempotencyKey])).toEqual([
      ["anne@lfc.test", `${KEY}:s_1`],
      ["bruno@lfc.test", `${KEY}:s_2`],
    ]);
    expect(mails.queued[0]?.subjects).toEqual([{ type: "payment", id: "pay_1" }]);
    expect(requested).toEqual([{ requestId: "mail_1" }, { requestId: "mail_2" }]);
    expect(captured.warnings).toEqual([]);
  });

  it("personne de joignable : une seule demande à la boîte, clé `:inbox`, et un avertissement sans adresse", async () => {
    const { mails, requested } = await sendWith([], "equipe@lfc.test");

    expect(mails.queued.map((mail) => [mail.to, mail.idempotencyKey])).toEqual([
      ["equipe@lfc.test", `${KEY}:inbox`],
    ]);
    expect(requested).toHaveLength(1);
    expect(captured.warnings).toHaveLength(1);
    expect(captured.warnings[0]).not.toContain("@");
  });

  it("sans boîte non plus : rien ne part, et un avertissement le dit", async () => {
    const { mails, requested } = await sendWith([], null);

    expect(mails.queued).toEqual([]);
    expect(requested).toEqual([]);
    expect(captured.warnings).toHaveLength(1);
    expect(captured.warnings[0]).toContain(KEY);
    expect(captured.warnings[0]).not.toContain("@");
  });
});
