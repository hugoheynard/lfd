import type { InvoiceSettlementStatus } from "../invoice-settlement.js";
import {
  amountDueOf,
  filteredLedger,
  NO_LEDGER_FILTER,
  type LedgerEntry,
} from "../my-invoices-ledger.js";

const entry = (
  number: string,
  status: InvoiceSettlementStatus | null,
  totalTtcCents = 1_000,
  issuedOn = "2026-09-30",
): LedgerEntry => ({
  number,
  isCreditNote: status === null,
  issuedOn,
  totalTtcCents,
  settlement: status === null ? null : { status, date: null, otherInvoicesOnDebit: 0 },
});

describe("le total dû (Q2, Q-D, Q-E)", () => {
  it("prévu, rejeté et re-présenté entrent ; le reste, et les avoirs, non", () => {
    const due = amountDueOf([
      entry("FA-LFD-2026-000001", "collection_planned", 100),
      entry("FA-LFD-2026-000002", "collection_rejected", 200),
      entry("FA-LFD-2026-000003", "recollection_planned", 400),
      entry("FA-LFD-2026-000004", "card_paid", 1),
      entry("FA-LFD-2026-000005", "collected", 2),
      entry("FA-LFD-2026-000006", "settled", 4),
      entry("FA-LFD-2026-000007", "closed", 8),
      entry("FA-LFD-2026-000008", "processing", 16),
      entry("FA-LFD-2026-000009", null, 32),
    ]);
    expect(due).toEqual({ totalCents: 700, invoiceCount: 3, rejectedCount: 1, rejectedCents: 200 });
  });

  it("rien : zéro partout", () => {
    expect(amountDueOf([])).toEqual({
      totalCents: 0,
      invoiceCount: 0,
      rejectedCount: 0,
      rejectedCents: 0,
    });
  });
});

describe("le filtre et l'ordre de la liste", () => {
  const all = [
    entry("FA-LFD-2025-000009", "collected", 1, "2025-12-31"),
    entry("FA-LFD-2026-000002", null, 1, "2026-10-05"),
    entry("FA-LFD-2026-000001", "collected", 1, "2026-09-30"),
    entry("FA-LFD-2026-000003", "collection_planned", 1, "2026-10-31"),
  ];
  const numbers = (list: readonly LedgerEntry[]): readonly string[] =>
    list.map((one) => one.number);

  it("sans filtre : tout, les plus récentes d'abord", () => {
    expect(numbers(filteredLedger(all, NO_LEDGER_FILTER))).toEqual([
      "FA-LFD-2026-000003",
      "FA-LFD-2026-000002",
      "FA-LFD-2026-000001",
      "FA-LFD-2025-000009",
    ]);
  });

  it("par année, par mois d'émission, par genre", () => {
    expect(numbers(filteredLedger(all, { ...NO_LEDGER_FILTER, year: 2025 }))).toEqual([
      "FA-LFD-2025-000009",
    ]);
    expect(numbers(filteredLedger(all, { year: 2026, month: 10, kind: null }))).toEqual([
      "FA-LFD-2026-000003",
      "FA-LFD-2026-000002",
    ]);
    expect(numbers(filteredLedger(all, { ...NO_LEDGER_FILTER, kind: "credit_note" }))).toEqual([
      "FA-LFD-2026-000002",
    ]);
    expect(numbers(filteredLedger(all, { year: 2026, month: 10, kind: "invoice" }))).toEqual([
      "FA-LFD-2026-000003",
    ]);
  });
});
