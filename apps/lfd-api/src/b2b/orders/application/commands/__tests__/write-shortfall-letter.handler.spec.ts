import type {
  DeferrableMailTemplate,
  DeferredMailDemand,
  MailRequested,
} from "../../../../../mail/channels/requests/mail.js";
import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  ShortfallNotice,
  type ShortfallNoticeSnapshot,
} from "../../../domain/entities/shortfall-notice.js";
import {
  ShortfallCustomerAlreadyNotifiedError,
  ShortfallLetterNoRecipientError,
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

/** La porte du bloc `mail`, qui note sa demande dans la trace. */
class TracedMail extends RecordingMail {
  constructor(
    private readonly trace: Trace,
    unitOfWork: OpenableUnitOfWork,
  ) {
    super(unitOfWork);
  }

  override send<K extends DeferrableMailTemplate>(
    demand: DeferredMailDemand<K>,
  ): Promise<MailRequested> {
    this.trace.push("request");
    return super.send(demand);
  }
}

function scene(
  snapshot: ShortfallNoticeSnapshot | null = BLANK,
  email: string | null = "jean@exemple.fr",
  locale: LockedShortfallNotice["locale"] = "it",
) {
  const trace: Trace = [];
  const notices = new FixedNotices(trace, snapshot, locale);
  const unitOfWork = new OpenableUnitOfWork();
  const mailer = new TracedMail(trace, unitOfWork);
  const handler = new WriteShortfallLetterHandler(
    notices,
    new Recipients(email),
    mailer,
    new FixedClock(NOW),
    unitOfWork,
  );
  const write = (message = "  Il manque deux croissants.  "): Promise<void> =>
    handler.execute(new WriteShortfallLetterCommand("ord_1", "staff_1", message));
  return { trace, notices, mailer, write };
}

describe("« Écrire au client » (E6d)", () => {
  it("trace l'envoi puis DEMANDE le texte RELU, au client, dans la langue de la commande", async () => {
    const { trace, notices, mailer, write } = scene();

    await write();

    // La demande est faite DANS la transaction de la trace (la porte doublée
    // refuse sinon) : elles tombent ensemble.
    expect(trace).toEqual(["lock", "save", "request"]);
    expect(notices.saved).toEqual([{ ...BLANK, notifiedAt: NOW, notifiedBy: "staff_1" }]);
    expect(mailer.queued).toEqual([
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

    expect(mailer.queued[0]?.data).toMatchObject({ locale: "fr" });
  });

  it("refuse un second envoi sans rien envoyer", async () => {
    const { trace, mailer, write } = scene({ ...BLANK, notifiedAt: NOW, notifiedBy: "staff_0" });

    await expect(write()).rejects.toBeInstanceOf(ShortfallCustomerAlreadyNotifiedError);
    expect(trace).toEqual(["lock"]);
    expect(mailer.queued).toEqual([]);
  });

  it("refuse un texte vide avant même de verrouiller", async () => {
    const { trace, write } = scene();

    await expect(write("   ")).rejects.toBeInstanceOf(ShortfallLetterRequiredError);
    expect(trace).toEqual([]);
  });

  it("refuse une commande sans décision", async () => {
    const { mailer, write } = scene(null);

    await expect(write()).rejects.toBeInstanceOf(ShortfallLetterWithoutDecisionError);
    expect(mailer.queued).toEqual([]);
  });

  it("refuse un client sans adresse : rien ne part", async () => {
    const { trace, write } = scene(BLANK, null);

    await expect(write()).rejects.toBeInstanceOf(ShortfallLetterNoRecipientError);
    expect(trace).not.toContain("request");
  });

  /**
   * Depuis S2a (plan `plan-service-e-mails.md`), l'envoi au fournisseur se
   * fait après la validation, par le bloc `mail` : son refus ne remonte plus
   * ici. Ce qui peut échouer dans la transaction est la DEMANDE — et elle
   * remonte, pour que la trace soit annulée avec elle.
   */
  it("une demande qui échoue remonte, pour que la trace soit annulée avec elle", async () => {
    const { mailer, write } = scene();
    mailer.failWith = new RangeError("base injoignable");

    await expect(write()).rejects.toThrow("base injoignable");
  });
});
