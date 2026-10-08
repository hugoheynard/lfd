import {
  CollectionNoticeNotQueuedError,
  InvalidCollectionNoticeError,
} from "../../errors/collection-notice-errors.js";
import { CollectionNotice, type NoticeDraft } from "../collection-notice.js";

/** Les instants ne sont comparés qu'entre eux : jamais à l'horloge. */
const AT = new Date("2026-10-02T09:00:00.000Z");
const LATER = new Date("2026-10-02T09:05:00.000Z");

function draft(overrides: Partial<NoticeDraft> = {}): NoticeDraft {
  return {
    id: "n1",
    legalEntityId: "le_1",
    cycleClosesAt: new Date("2026-09-30T22:00:00.000Z"),
    line: { batchId: "b1", lineRank: 1, statementId: "st_1", invoiceNumbers: [] },
    debtorCompanyId: "c_port",
    debtorName: "Port",
    recipient: { email: "compta@port.test", source: "billing_contact" },
    terms: { amountCents: 10_018, collectionDay: "2026-10-16" },
    mandateReference: "RUM-1",
    creditor: { name: "Crazeativity", ics: "FR00ZZZ900001" },
    at: AT,
    ...overrides,
  };
}

function sent(overrides: Partial<NoticeDraft> = {}): CollectionNotice {
  const notice = CollectionNotice.announce(draft({ id: "n0", ...overrides }));
  notice.markSent(AT);
  return notice;
}

describe("l'avis de prélèvement", () => {
  it("naît en file quand il a une adresse, non envoyable sinon", () => {
    expect(CollectionNotice.announce(draft()).status).toBe("queued");
    expect(CollectionNotice.announce(draft({ recipient: null })).status).toBe("unsendable");
  });

  it("envoyé ≠ mis en file : seul un avis en file devient envoyé ou en échec, une fois", () => {
    const notice = CollectionNotice.announce(draft());
    notice.markSent(LATER);

    expect(notice.toPersistence()).toMatchObject({ status: "sent", sentAt: LATER });
    expect(() => notice.markSent(LATER)).toThrow(CollectionNoticeNotQueuedError);
    expect(() => notice.markFailed(LATER, "x")).toThrow(CollectionNoticeNotQueuedError);
  });

  it("un échec garde le refus du fournisseur, et ne redevient pas envoyé", () => {
    const notice = CollectionNotice.announce(draft());
    notice.markFailed(LATER, "adresse en rebond dur");

    expect(notice.toPersistence()).toMatchObject({
      status: "failed",
      failure: "adresse en rebond dur",
    });
    expect(() => notice.markSent(LATER)).toThrow(CollectionNoticeNotQueuedError);
  });

  it("un avis non envoyable ne part jamais", () => {
    const notice = CollectionNotice.announce(draft({ recipient: null }));

    expect(notice.needsSending).toBe(false);
    expect(() => notice.markSent(LATER)).toThrow(CollectionNoticeNotQueuedError);
  });

  it("refuse un montant nul ou négatif", () => {
    expect(() =>
      CollectionNotice.announce(draft({ terms: { amountCents: 0, collectionDay: "2026-10-16" } })),
    ).toThrow(InvalidCollectionNoticeError);
  });

  it("un rectificatif porte ce qu'annonçait l'avis parti, et le cite", () => {
    const before = sent();

    const correction = CollectionNotice.correct(
      draft({ terms: { amountCents: 12_000, collectionDay: "2026-10-16" } }),
      before,
    );

    expect(correction.toPersistence()).toMatchObject({
      kind: "correction",
      status: "queued",
      previous: { amountCents: 10_018, collectionDay: "2026-10-16" },
      supersedesId: "n0",
    });
  });

  it("un rectificatif qui ne change rien n'existe pas", () => {
    expect(() => CollectionNotice.correct(draft(), sent())).toThrow(InvalidCollectionNoticeError);
  });

  it("on ne rectifie, n'annule ni ne reconduit un avis qui n'est pas parti", () => {
    const queued = CollectionNotice.announce(draft({ id: "n0" }));
    const changed = draft({ terms: { amountCents: 1, collectionDay: "2026-10-16" } });

    expect(() => CollectionNotice.correct(changed, queued)).toThrow(InvalidCollectionNoticeError);
    expect(() => CollectionNotice.carry(draft(), queued)).toThrow(InvalidCollectionNoticeError);
    expect(() => CollectionNotice.cancel(queued, { id: "n2", recipient: null, at: LATER })).toThrow(
      InvalidCollectionNoticeError,
    );
  });

  it("une reconduction reprend l'envoi de l'avis parti, sans rien envoyer", () => {
    const carried = CollectionNotice.carry(draft({ id: "n2" }), sent());

    expect(carried.toPersistence()).toMatchObject({
      kind: "unchanged",
      status: "sent",
      sentAt: AT,
      supersedesId: "n0",
    });
    expect(carried.needsSending).toBe(false);
  });

  it("une annulation n'appartient à aucun lot et annule les termes promis", () => {
    const cancellation = CollectionNotice.cancel(sent(), {
      id: "n2",
      recipient: { email: "compta@port.test", source: "billing_contact" },
      at: LATER,
    });

    expect(cancellation.toPersistence()).toMatchObject({
      kind: "cancellation",
      status: "queued",
      line: null,
      terms: { amountCents: 10_018, collectionDay: "2026-10-16" },
      supersedesId: "n0",
    });
    expect(cancellation.isSentPromise).toBe(false);
  });
});
