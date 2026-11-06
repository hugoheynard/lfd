import {
  OpenableUnitOfWork,
  RecordingMailRequests,
} from "../../../../../mail/channels/requests/__tests__/recording-mail-requests.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CollectionNotice, type NoticeDraft } from "../../../domain/entities/collection-notice.js";
import { FixedEntities } from "../../commands/__tests__/collection-doubles.js";
import { MemoryNotices, NoticeStore } from "../../commands/__tests__/notice-doubles.js";
import { CollectionNoticeSender } from "../collection-notice-sender.js";

/** Comparé aux tampons de l'avis seulement, jamais au mur. */
const NOW = new Date("2026-10-02T09:05:00.000Z");

function draft(overrides: Partial<NoticeDraft> = {}): NoticeDraft {
  return {
    id: "n1",
    legalEntityId: "le_1",
    cycleClosesAt: new Date("2026-09-30T22:00:00.000Z"),
    line: {
      batchId: "b1",
      lineRank: 1,
      statementId: "st_1",
      invoiceNumbers: [],
      representedRejectionDay: null,
    },
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
  const uow = new OpenableUnitOfWork();
  const mails = new RecordingMailRequests(uow);
  const events = new RecordingPublisher();
  const sender = new CollectionNoticeSender(
    new MemoryNotices(store),
    new FixedEntities(),
    new FixedClock(NOW),
    events,
    uow,
    mails,
  );
  return { sender, mails, events, notice };
}

describe("l'envoi d'un avis de prélèvement", () => {
  it("envoie sur-le-champ hors transaction (`sendNow`), avec la clé de l'avis, puis le marque envoyé", async () => {
    const { sender, mails, events, notice } = setup(CollectionNotice.announce(draft()));

    expect(await sender.send("n1")).toBe("sent");

    expect(mails.requested).toEqual([]);
    expect(mails.sentNow).toEqual([
      {
        to: "compta@port.test",
        brand: "lfc",
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
          representedRejectionDay: null,
          previous: null,
        },
      },
    ]);
    expect(notice.toPersistence()).toMatchObject({ status: "sent", sentAt: NOW });
    expect(events.factTypes()).toEqual(["collection.notice_sent"]);
  });

  it("un refus du fournisseur marque l'avis en échec, avec le refus, sans lever", async () => {
    const { sender, mails, events, notice } = setup(CollectionNotice.announce(draft()));
    mails.failWith = new Error("Resend : adresse en liste de suppression");

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
    const { sender, mails, events } = setup(notice);

    expect(await sender.send("n1")).toBe("sent");

    expect(mails.sentNow).toHaveLength(0);
    expect(events.factTypes()).toEqual([]);
  });

  it("un avis non envoyable ne part pas, et un avis inconnu ne lève pas", async () => {
    const { sender, mails } = setup(CollectionNotice.announce(draft({ recipient: null })));

    expect(await sender.send("n1")).toBe("unsendable");
    expect(await sender.send("absent")).toBeNull();
    expect(mails.sentNow).toHaveLength(0);
  });
});
