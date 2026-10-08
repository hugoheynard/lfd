import { CollectionNotice } from "../../entities/collection-notice.js";
import { planNotices, type CycleNotice, type NoticeLine } from "../collection-notice-plan.js";
import type { PayerNoticeContacts } from "../collection-notice-recipient.js";

/** Les instants ne sont comparés qu'entre eux. */
const AT = new Date("2026-10-02T09:00:00.000Z");
const CLOSES_AT = new Date("2026-09-30T22:00:00.000Z");

function line(debtor: string, amountCents: number, rank = 1): NoticeLine {
  return {
    ref: { batchId: "b_new", lineRank: rank, statementId: `st_${debtor}`, invoiceNumbers: [] },
    debtorCompanyId: debtor,
    debtorName: `Société ${debtor}`,
    amountCents,
    mandateReference: `RUM-${debtor}`,
  };
}

/** L'avis PARTI d'un lot annulé (ou vivant) : ce qu'une reconstitution relit. */
function earlier(
  debtor: string,
  amountCents: number,
  options: { readonly sent?: boolean; readonly batchLive?: boolean; readonly day?: string } = {},
): CycleNotice {
  const notice = CollectionNotice.announce({
    id: `old_${debtor}`,
    legalEntityId: "le_1",
    cycleClosesAt: CLOSES_AT,
    line: { batchId: "b_old", lineRank: 1, statementId: `st_old_${debtor}`, invoiceNumbers: [] },
    debtorCompanyId: debtor,
    debtorName: `Société ${debtor}`,
    recipient: { email: `ancienne@${debtor}.test`, source: "owner" },
    terms: { amountCents, collectionDay: options.day ?? "2026-10-16" },
    mandateReference: `RUM-${debtor}`,
    creditor: { name: "Crazeativity", ics: "FR00ZZZ900001" },
    at: AT,
  });
  if (options.sent !== false) {
    notice.markSent(AT);
  }
  return { notice, batchLive: options.batchLive ?? false };
}

function plan(
  lines: readonly NoticeLine[],
  previous: readonly CycleNotice[] = [],
  contacts = new Map<string, PayerNoticeContacts>(),
) {
  let seq = 0;
  return planNotices({
    legalEntityId: "le_1",
    cycleClosesAt: CLOSES_AT,
    collectionDay: "2026-10-16",
    creditor: { name: "Crazeativity", ics: "FR00ZZZ900001" },
    lines,
    earlier: previous,
    contacts,
    at: AT,
    nextId: () => `n${String((seq += 1))}`,
  }).map((notice) => notice.toPersistence());
}

const BILLING = (debtor: string): PayerNoticeContacts => ({
  billingContactEmails: [`compta@${debtor}.test`],
  ownerEmail: null,
});

describe("les avis d'une constitution (PA2)", () => {
  it("première constitution : un avis par ligne, au contact de facturation, montant et date du lot", () => {
    const notices = plan([line("c1", 10_018)], [], new Map([["c1", BILLING("c1")]]));

    expect(notices).toEqual([
      expect.objectContaining({
        kind: "notice",
        status: "queued",
        recipient: { email: "compta@c1.test", source: "billing_contact" },
        terms: { amountCents: 10_018, collectionDay: "2026-10-16" },
        mandateReference: "RUM-c1",
        line: { batchId: "b_new", lineRank: 1, statementId: "st_c1", invoiceNumbers: [] },
        creditor: { name: "Crazeativity", ics: "FR00ZZZ900001" },
      }),
    ]);
  });

  it("un payeur sans adresse : l'avis est non envoyable, la ligne reste annoncée", () => {
    const [notice] = plan([line("c1", 10_018)]);

    expect(notice).toMatchObject({ kind: "notice", status: "unsendable", recipient: null });
  });

  it("reconstitution identique : reconduit, rien ne part", () => {
    const [notice] = plan(
      [line("c1", 10_018)],
      [earlier("c1", 10_018)],
      new Map([["c1", BILLING("c1")]]),
    );

    expect(notice).toMatchObject({ kind: "unchanged", status: "sent", supersedesId: "old_c1" });
  });

  it("montant changé : un rectificatif, qui dit l'ancien montant", () => {
    const [notice] = plan(
      [line("c1", 9_000)],
      [earlier("c1", 10_018)],
      new Map([["c1", BILLING("c1")]]),
    );

    expect(notice).toMatchObject({
      kind: "correction",
      status: "queued",
      terms: { amountCents: 9_000, collectionDay: "2026-10-16" },
      previous: { amountCents: 10_018, collectionDay: "2026-10-16" },
    });
  });

  it("date changée (D4) : un rectificatif aussi", () => {
    const [notice] = plan(
      [line("c1", 10_018)],
      [earlier("c1", 10_018, { day: "2026-10-15" })],
      new Map([["c1", BILLING("c1")]]),
    );

    expect(notice).toMatchObject({ kind: "correction", previous: { collectionDay: "2026-10-15" } });
  });

  it("payeur qui n'est plus prélevé : une annulation, hors lot, à l'adresse d'aujourd'hui", () => {
    const notices = plan(
      [line("c1", 10_018)],
      [earlier("c1", 10_018), earlier("c2", 5_000)],
      new Map([
        ["c1", BILLING("c1")],
        ["c2", BILLING("c2")],
      ]),
    );

    expect(notices[1]).toMatchObject({
      kind: "cancellation",
      status: "queued",
      line: null,
      debtorCompanyId: "c2",
      terms: { amountCents: 5_000, collectionDay: "2026-10-16" },
      recipient: { email: "compta@c2.test", source: "billing_contact" },
    });
  });

  it("une annulation sans adresse d'aujourd'hui part à celle qui a reçu l'avis", () => {
    const notices = plan([line("c1", 10_018)], [earlier("c2", 5_000)]);

    expect(notices[1]?.recipient).toEqual({ email: "ancienne@c2.test", source: "owner" });
  });

  it("un avis jamais parti ne promet rien : premier avis, et aucune annulation", () => {
    const notices = plan(
      [line("c1", 10_018)],
      [earlier("c1", 9_000, { sent: false }), earlier("c2", 5_000, { sent: false })],
    );

    expect(notices.map((notice) => notice.kind)).toEqual(["notice"]);
  });

  it("le dernier avis d'un payeur fait foi : une annulation déjà partie n'est pas refaite", () => {
    const first = earlier("c2", 5_000);
    const cancellation = CollectionNotice.cancel(first.notice, {
      id: "x",
      recipient: null,
      at: AT,
    });

    const notices = plan([line("c1", 10_018)], [first, { notice: cancellation, batchLive: false }]);

    expect(notices.map((notice) => notice.kind)).toEqual(["notice"]);
  });

  it("un payeur d'un lot encore vivant (l'autre schéma) n'est pas touché", () => {
    const notices = plan([line("c1", 10_018)], [earlier("c2", 5_000, { batchLive: true })]);

    expect(notices.map((notice) => notice.debtorCompanyId)).toEqual(["c1"]);
  });
});
