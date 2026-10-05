import {
  BatchHasUnmandatedCompaniesError,
  BatchNotConstitutedError,
  ClosureNotAfterPreviousError,
  CycleNotClosedError,
  DepositRecheckFailedError,
  FirstClosureNotOnFirstOfMonthError,
} from "../../errors/collection-errors.js";
import { CollectionBatch, type ConstituteBatchInput } from "../collection-batch.js";

const SEPTEMBER = {
  startsAt: new Date("2026-08-31T22:00:00.000Z"),
  closesAt: new Date("2026-09-30T22:00:00.000Z"),
};
const AFTER_CLOSE = new Date("2026-10-02T09:00:00.000Z");
const STAMP = { at: AFTER_CLOSE, staffId: "staff_1" };

function input(overrides: Partial<ConstituteBatchInput> = {}): ConstituteBatchInput {
  return {
    id: "01JBQ7Z5K8M3QT9P2X4BZZZZZZ",
    legalEntityId: "le_1",
    scheme: "B2B",
    cycle: SEPTEMBER,
    previousClosure: null,
    constituted: STAMP,
    unmandatedCompanies: [],
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
        orderIds: ["o1"],
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
        input({ constituted: { ...STAMP, at: new Date("2026-09-30T21:00:00.000Z") } }),
      ),
    ).toThrow(CycleNotClosedError);
  });

  it("la PREMIÈRE clôture tombe un 1er du mois à 00h00 de Paris", () => {
    const offCalendar = {
      startsAt: SEPTEMBER.startsAt,
      closesAt: new Date("2026-09-19T22:00:00.000Z"),
    };

    expect(() => CollectionBatch.constitute(input({ cycle: offCalendar }))).toThrow(
      FirstClosureNotOnFirstOfMonthError,
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
    expect(() => batch.markDeposited(STAMP, [])).toThrow(BatchNotConstitutedError);
  });

  it("ne se dépose pas tant qu'il nomme une société sans mandat (Q2)", () => {
    const batch = CollectionBatch.constitute(input({ unmandatedCompanies: ["Chalet"] }));

    expect(batch.depositable).toBe(false);
    expect(() => batch.markDeposited(STAMP, [])).toThrow(BatchHasUnmandatedCompaniesError);
  });

  it("refuse le dépôt quand la relecture a trouvé un écart, et le nomme", () => {
    const batch = CollectionBatch.constitute(input());

    expect(() => batch.markDeposited(STAMP, ["le mandat RUM-1 de Port n'est plus actif"])).toThrow(
      /RUM-1 de Port/u,
    );
    expect(() => batch.markDeposited(STAMP, ["x"])).toThrow(DepositRecheckFailedError);
    batch.markDeposited(STAMP, []);
    expect(batch.status).toBe("deposited");
  });
});
