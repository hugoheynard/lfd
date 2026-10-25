import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  ShortfallNotice,
  type ShortfallNoticeSnapshot,
} from "../../../domain/entities/shortfall-notice.js";
import {
  ShortfallCustomerAlreadyNotifiedError,
  ShortfallLetterNoRecipientError,
  ShortfallLetterNotSentError,
  ShortfallLetterRequiredError,
  ShortfallLetterWithoutDecisionError,
} from "../../../domain/errors/shortfall-letter-errors.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../../../domain/ports/order-recipient.reader.js";
import {
  ShortfallNoticeRepository,
  type LockedShortfallNotice,
} from "../../../domain/ports/shortfall-notice.repository.js";
import { WriteShortfallLetterCommand } from "../write-shortfall-letter.command.js";
import { WriteShortfallLetterHandler } from "../write-shortfall-letter.handler.js";

// Instant comparé à la trace, jamais à l'horloge.
const NOW = new Date(5_000);

type Trace = string[];

const BLANK: ShortfallNoticeSnapshot = {
  decisionId: "dec_1",
  orderId: "ord_1",
  reference: "ORD-0001",
  notifiedAt: null,
  notifiedBy: null,
};

class FixedNotices extends ShortfallNoticeRepository {
  readonly saved: ShortfallNoticeSnapshot[] = [];

  constructor(
    private readonly trace: Trace,
    private readonly snapshot: ShortfallNoticeSnapshot | null,
    private readonly locale: LockedShortfallNotice["locale"] = "it",
  ) {
    super();
  }

  lock(): Promise<LockedShortfallNotice | null> {
    this.trace.push("lock");
    return Promise.resolve(
      this.snapshot === null
        ? null
        : {
            notice: ShortfallNotice.fromSnapshot(this.snapshot),
            placedByUserId: "u_1",
            locale: this.locale,
          },
    );
  }

  save(notice: ShortfallNotice): Promise<void> {
    this.trace.push("save");
    this.saved.push(notice.toSnapshot());
    return Promise.resolve();
  }
}

class Recipients extends OrderRecipientReader {
  constructor(private readonly email: string | null) {
    super();
  }

  findById(): Promise<OrderRecipient | null> {
    return Promise.resolve(this.email === null ? null : { email: this.email, firstName: "Jean" });
  }
}

class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails>[] = [];
  refusal: Error | null = null;

  constructor(private readonly trace: Trace) {}

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.trace.push("send");
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.sent.push(args);
    return Promise.resolve({ providerId: "re_1" });
  }
}

function scene(
  snapshot: ShortfallNoticeSnapshot | null = BLANK,
  email: string | null = "jean@exemple.fr",
  locale: LockedShortfallNotice["locale"] = "it",
) {
  const trace: Trace = [];
  const notices = new FixedNotices(trace, snapshot, locale);
  const mailer = new RecordingMailer(trace);
  const handler = new WriteShortfallLetterHandler(
    notices,
    new Recipients(email),
    mailer,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
  const write = (message = "  Il manque deux croissants.  "): Promise<void> =>
    handler.execute(new WriteShortfallLetterCommand("ord_1", "staff_1", message));
  return { trace, notices, mailer, write };
}

describe("« Écrire au client » (E6d)", () => {
  it("trace l'envoi puis envoie le texte RELU, au client, dans la langue de la commande", async () => {
    const { trace, notices, mailer, write } = scene();

    await write();

    expect(trace).toEqual(["lock", "save", "send"]);
    expect(notices.saved).toEqual([{ ...BLANK, notifiedAt: NOW, notifiedBy: "staff_1" }]);
    expect(mailer.sent).toEqual([
      {
        to: "jean@exemple.fr",
        template: "customer.order-shortfall",
        idempotencyKey: "order-shortfall:dec_1",
        data: { reference: "ORD-0001", message: "Il manque deux croissants.", locale: "it" },
      },
    ]);
  });

  it("écrit en français une commande sans langue", async () => {
    const { mailer, write } = scene(BLANK, "jean@exemple.fr", null);

    await write();

    expect(mailer.sent[0]?.data).toMatchObject({ locale: "fr" });
  });

  it("refuse un second envoi sans rien envoyer", async () => {
    const { trace, mailer, write } = scene({ ...BLANK, notifiedAt: NOW, notifiedBy: "staff_0" });

    await expect(write()).rejects.toBeInstanceOf(ShortfallCustomerAlreadyNotifiedError);
    expect(trace).toEqual(["lock"]);
    expect(mailer.sent).toEqual([]);
  });

  it("refuse un texte vide avant même de verrouiller", async () => {
    const { trace, write } = scene();

    await expect(write("   ")).rejects.toBeInstanceOf(ShortfallLetterRequiredError);
    expect(trace).toEqual([]);
  });

  it("refuse une commande sans décision", async () => {
    const { mailer, write } = scene(null);

    await expect(write()).rejects.toBeInstanceOf(ShortfallLetterWithoutDecisionError);
    expect(mailer.sent).toEqual([]);
  });

  it("refuse un client sans adresse : rien ne part", async () => {
    const { trace, write } = scene(BLANK, null);

    await expect(write()).rejects.toBeInstanceOf(ShortfallLetterNoRecipientError);
    expect(trace).not.toContain("send");
  });

  it("un envoi refusé par le fournisseur remonte, pour que la trace soit annulée avec lui", async () => {
    const { mailer, write } = scene();
    mailer.refusal = new RangeError("Resend injoignable");

    await expect(write()).rejects.toBeInstanceOf(ShortfallLetterNotSentError);
  });
});
