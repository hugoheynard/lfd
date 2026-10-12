import {
  BatchHasUnmandatedCompaniesError,
  BatchNotConstitutedError,
  ClosureNotAfterPreviousError,
  CycleNotClosedError,
  DepositRecheckFailedError,
  FirstClosureOffRhythmError,
} from "../../errors/collection-errors.js";
import { CollectionNoticesNotSentError } from "../../errors/collection-notice-errors.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../../value-objects/billing-rhythm-setting.js";
import { defaultModes, paris } from "../../services/__tests__/billing-mode-fixtures.js";
import { InvoicingCalendar } from "../../services/invoicing-calendar.js";
import { CollectionBatch, type ConstituteBatchInput } from "../collection-batch.js";

const SEPTEMBER = {
  startsAt: new Date("2026-08-31T22:00:00.000Z"),
  closesAt: new Date("2026-09-30T22:00:00.000Z"),
};
const AFTER_CLOSE = new Date("2026-10-02T09:00:00.000Z");
const STAMP = { at: AFTER_CLOSE, staffId: "staff_1" };
const CONSTITUTED = { at: AFTER_CLOSE, by: { kind: "staff", staffId: "staff_1" } } as const;
/** L'avis de l'unique ligne est parti — ce que le dépôt exige depuis PA2. */
const SENT = new Map([[1, "sent" as const]]);

function input(overrides: Partial<ConstituteBatchInput> = {}): ConstituteBatchInput {
  return {
    id: "01JBQ7Z5K8M3QT9P2X4BZZZZZZ",
    legalEntityId: "le_1",
    scheme: "B2B",
    cycle: SEPTEMBER,
    previousClosure: null,
    calendar: InvoicingCalendar.following(BillingRhythmSetting.initial()),
    constituted: CONSTITUTED,
    unmandatedCompanies: [],
    requestedCollectionDay: "2026-10-15",
    postponedFromDay: null,
    lines: [
      {
        rank: 1,
        endToEndId: "X-0001",
        mandateId: "m1",
        mandateReference: "RUM-1",
        mandateSignedAt: new Date("2026-08-01T10:00:00.000Z"),
        debtorCompanyId: "c1",
        debtorName: "Port",
        debtorIban: "FR7630004000031234567890143",
        debtorBic: null,
        sequence: "RCUR",
        amountCents: 1_000,
        ordersTotalCents: 1_000,
        orderIds: ["o1"],
        invoices: [],
        priorOrderCount: 0,
      },
    ],
    xml: "<xml/>",
    fileSha256: "0".repeat(64),
    ...overrides,
  };
}

describe("le lot de prélèvement", () => {
  it("ne se constitue qu'après la clôture", () => {
    expect(() =>
      CollectionBatch.constitute(
        input({ constituted: { ...CONSTITUTED, at: new Date("2026-09-30T21:00:00.000Z") } }),
      ),
    ).toThrow(CycleNotClosedError);
  });

  it("la PREMIÈRE clôture est une clôture du rythme de l'entité — au 1er par défaut", () => {
    const offCalendar = {
      startsAt: SEPTEMBER.startsAt,
      closesAt: new Date("2026-09-19T22:00:00.000Z"),
    };

    expect(() => CollectionBatch.constitute(input({ cycle: offCalendar }))).toThrow(
      FirstClosureOffRhythmError,
    );
  });

  it("la première clôture d'une entité hebdomadaire du lundi tombe un lundi", () => {
    const weekly = InvoicingCalendar.following(
      BillingRhythmSetting.of(BillingRhythm.weekly(1), null),
    );
    // Lundi 28 septembre 2026, 00h00 Paris.
    const monday = { startsAt: SEPTEMBER.startsAt, closesAt: new Date("2026-09-27T22:00:00.000Z") };
    const tuesday = {
      startsAt: SEPTEMBER.startsAt,
      closesAt: new Date("2026-09-28T22:00:00.000Z"),
    };

    expect(() =>
      CollectionBatch.constitute(input({ cycle: monday, calendar: weekly })),
    ).not.toThrow();
    expect(() => CollectionBatch.constitute(input({ cycle: tuesday, calendar: weekly }))).toThrow(
      FirstClosureOffRhythmError,
    );
    // Le 1er octobre n'est pas une clôture du lundi.
    expect(() => CollectionBatch.constitute(input({ calendar: weekly }))).toThrow(
      FirstClosureOffRhythmError,
    );
  });

  it("rythmes mêlés : le 1er ET le lundi d'un payeur hebdomadaire sont des clôtures du lot (M3)", () => {
    const mixed = InvoicingCalendar.of(defaultModes(), [
      {
        payerCompanyId: "c_week",
        segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" as const }],
      },
    ]);
    const monday = { startsAt: paris("2026-09-21"), closesAt: paris("2026-09-28") };
    const tuesday = { startsAt: paris("2026-09-21"), closesAt: paris("2026-09-29") };

    expect(() => CollectionBatch.constitute(input({ calendar: mixed }))).not.toThrow();
    expect(() =>
      CollectionBatch.constitute(input({ cycle: monday, calendar: mixed })),
    ).not.toThrow();
    expect(() => CollectionBatch.constitute(input({ cycle: tuesday, calendar: mixed }))).toThrow(
      FirstClosureOffRhythmError,
    );
  });

  it("une clôture suit la précédente", () => {
    expect(() =>
      CollectionBatch.constitute(input({ previousClosure: SEPTEMBER.closesAt })),
    ).toThrow(ClosureNotAfterPreviousError);
  });

  it("s'annule une fois, et un lot annulé ne se dépose pas", () => {
    const batch = CollectionBatch.constitute(input());

    batch.cancel(STAMP);

    expect(batch.status).toBe("cancelled");
    expect(() => batch.cancel(STAMP)).toThrow(BatchNotConstitutedError);
    expect(() => batch.markDeposited(STAMP, [], SENT)).toThrow(BatchNotConstitutedError);
  });

  it("ne se dépose pas tant qu'il nomme une société sans mandat (Q2)", () => {
    const batch = CollectionBatch.constitute(input({ unmandatedCompanies: ["Chalet"] }));

    expect(batch.depositable).toBe(false);
    expect(() => batch.markDeposited(STAMP, [], SENT)).toThrow(BatchHasUnmandatedCompaniesError);
  });

  it("refuse le dépôt quand la relecture a trouvé un écart, et le nomme", () => {
    const batch = CollectionBatch.constitute(input());

    expect(() =>
      batch.markDeposited(STAMP, ["le mandat RUM-1 de Port n'est plus actif"], SENT),
    ).toThrow(/RUM-1 de Port/u);
    expect(() => batch.markDeposited(STAMP, ["x"], SENT)).toThrow(DepositRecheckFailedError);
    batch.markDeposited(STAMP, [], SENT);
    expect(batch.status).toBe("deposited");
  });

  /** PA2 : mis en file ne vaut pas envoyé — le refus nomme le payeur et la raison. */
  it.each([
    ["queued", "avis en file, pas encore envoyé"],
    ["failed", "envoi de l'avis refusé"],
    ["unsendable", "aucune adresse"],
  ] as const)("refuse le dépôt quand l'avis est « %s », et nomme le payeur", (status, words) => {
    const batch = CollectionBatch.constitute(input());

    const refusal = () => batch.markDeposited(STAMP, [], new Map([[1, status]]));

    expect(refusal).toThrow(CollectionNoticesNotSentError);
    expect(refusal).toThrow(`Port (${words}`);
    expect(batch.status).toBe("constituted");
  });

  it("refuse le dépôt d'une ligne sans avis (lot d'avant les avis)", () => {
    const batch = CollectionBatch.constitute(input());

    expect(() => batch.markDeposited(STAMP, [], new Map())).toThrow(
      "Port (aucun avis (lot préparé avant les avis))",
    );
  });
});
