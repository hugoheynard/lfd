import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CollectionNotice, type NoticeDraft } from "../../../domain/entities/collection-notice.js";
import { FixedEntities } from "../../commands/__tests__/collection-doubles.js";
import { MemoryNotices, NoticeStore } from "../../commands/__tests__/notice-doubles.js";
import { CollectionNoticeSender } from "../collection-notice-sender.js";

/** Comparé aux tampons de l'avis seulement, jamais au mur. */
const NOW = new Date("2026-10-02T09:05:00.000Z");

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

function draft(overrides: Partial<NoticeDraft> = {}): NoticeDraft {
  return {
    id: "n1",
    legalEntityId: "le_1",
    cycleClosesAt: new Date("2026-09-30T22:00:00.000Z"),
    line: { batchId: "b1", lineRank: 1, statementId: "st_1", invoiceNumbers: [] },
    debtorCompanyId: "c_port",
    debtorName: "Boulangerie du Port",
    recipient: { email: "compta@port.test", source: "billing_contact" },
    terms: { amountCents: 123_456, collectionDay: "2026-10-16" },
    mandateReference: "RUM-1",
    creditor: { name: "Crazeativity", ics: "FR00ZZZ900001" },
    at: new Date("2026-10-02T09:00:00.000Z"),
    ...overrides,
  };
}

function setup(notice: CollectionNotice) {
  const store = new NoticeStore();
  store.notices.push(notice);
  const mailer = new RecordingMailer();
  const events = new RecordingPublisher();
  const sender = new CollectionNoticeSender(
    new MemoryNotices(store),
    new FixedEntities(),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
    mailer,
  );
  return { sender, mailer, events, notice };
}

describe("l'envoi d'un avis de prélèvement", () => {
  it("envoie au destinataire, avec la clé d'idempotence de l'avis, puis le marque envoyé", async () => {
    const { sender, mailer, events, notice } = setup(CollectionNotice.announce(draft()));

    expect(await sender.send("n1")).toBe("sent");

    expect(mailer.sent).toEqual([
      {
        to: "compta@port.test",
        template: "customer.collection-notice",
        idempotencyKey: "collection.notice:n1",
        data: {
          kind: "notice",
          creditorName: "Crazeativity",
          creditorIdentifier: "FR00ZZZ900001",
          debtorName: "Boulangerie du Port",
          amount: "1 234,56 €",
          collectionDay: "vendredi 16 octobre 2026",
          mandateReference: "RUM-1",
          statementReference: "st_1",
          invoiceNumbers: [],
          previous: null,
        },
      },
    ]);
    expect(notice.toPersistence()).toMatchObject({ status: "sent", sentAt: NOW });
    expect(events.factTypes()).toEqual(["collection.notice_sent"]);
  });

  it("un refus du fournisseur marque l'avis en échec, avec le refus, sans lever", async () => {
    const { sender, mailer, events, notice } = setup(CollectionNotice.announce(draft()));
    mailer.refusal = new Error("Resend : adresse en liste de suppression");

    expect(await sender.send("n1")).toBe("failed");

    expect(notice.toPersistence()).toMatchObject({
      status: "failed",
      failure: "Resend : adresse en liste de suppression",
    });
    expect(events.factTypes()).toEqual(["collection.notice_failed"]);
  });

  it("un avis qui n'est plus en file ne repart pas", async () => {
    const notice = CollectionNotice.announce(draft());
    notice.markSent(NOW);
    const { sender, mailer, events } = setup(notice);

    expect(await sender.send("n1")).toBe("sent");

    expect(mailer.sent).toHaveLength(0);
    expect(events.factTypes()).toEqual([]);
  });

  it("un avis non envoyable ne part pas, et un avis inconnu ne lève pas", async () => {
    const { sender, mailer } = setup(CollectionNotice.announce(draft({ recipient: null })));

    expect(await sender.send("n1")).toBe("unsendable");
    expect(await sender.send("absent")).toBeNull();
    expect(mailer.sent).toHaveLength(0);
  });
});
