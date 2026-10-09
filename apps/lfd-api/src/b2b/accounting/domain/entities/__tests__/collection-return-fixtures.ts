import type { RecordReturnInput, ReturnableLine } from "../collection-return.js";

/** Comparé à aucune horloge : un instant de saisie. */
export const RECORDED_AT = new Date("2026-10-12T09:00:00.000Z");

/** Une ligne de factures émises, d'un lot CORE déposé, sous mandat récurrent. */
export function returnableLine(overrides: Partial<ReturnableLine> = {}): ReturnableLine {
  return {
    batchId: "lot_1",
    rank: 1,
    endToEndId: "E2E-LOT1-1",
    batchStatus: "deposited",
    scheme: "CORE",
    cycleClosesAt: new Date("2026-09-30T22:00:00.000Z"),
    amountCents: 12_345,
    mandateId: "mdt_1",
    mandateReference: "RUM-1",
    sequence: "RCUR",
    debtorCompanyId: "co_payer",
    debtorName: "Boulangerie du Port",
    regime: "invoices",
    requestedCollectionDay: "2026-10-15",
    ...overrides,
  };
}

/** Un rejet AM04 du montant de la ligne. */
export function rejectInput(overrides: Partial<RecordReturnInput> = {}): RecordReturnInput {
  return {
    id: "ret_1",
    kind: "reject",
    reasonCode: "AM04",
    reasonLabel: null,
    returnedOn: "2026-10-16",
    amountCents: 12_345,
    feeCents: 750,
    source: "manual",
    recorded: { at: RECORDED_AT, staffId: "staff_1" },
    ...overrides,
  };
}
