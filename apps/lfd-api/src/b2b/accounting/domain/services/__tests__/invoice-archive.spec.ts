import {
  InvoiceArchiveEmptyError,
  InvoiceArchiveNotRenderedError,
  InvoiceArchiveNotVisibleError,
  InvoiceArchiveTooLargeError,
} from "../../errors/invoice-archive-errors.js";
import {
  archiveFileName,
  archivePieces,
  INVOICE_ARCHIVE_MAX_PIECES,
  type ArchiveCandidate,
} from "../invoice-archive.js";
import { NO_LEDGER_FILTER } from "../my-invoices-ledger.js";

/** Les dates ne sont comparées qu'entre elles (filtre d'émission), jamais à l'horloge. */
function piece(rank: number, overrides: Partial<ArchiveCandidate> = {}): ArchiveCandidate {
  return {
    id: `inv_${String(rank)}`,
    number: `FA-2026-${String(rank).padStart(6, "0")}`,
    isCreditNote: false,
    issuedOn: "2026-03-01",
    rendered: true,
    ...overrides,
  };
}

const ALL = { by: "filter", filter: NO_LEDGER_FILTER } as const;

describe("les pièces du zip de « Mes factures » (P2)", () => {
  it("retient le filtre de la liste, les plus récentes d'abord", () => {
    const visible = [
      piece(1),
      piece(2, { issuedOn: "2026-04-02" }),
      piece(3, { isCreditNote: true, number: "AV-2026-000003" }),
    ];

    const march = archivePieces(visible, {
      by: "filter",
      filter: { year: 2026, month: 3, kind: "invoice" },
    });

    expect(march.map((p) => p.id)).toEqual(["inv_1"]);
    expect(archivePieces(visible, ALL).map((p) => p.id)).toEqual(["inv_2", "inv_1", "inv_3"]);
  });

  it("retient une sélection d'ids, doublons compris une fois", () => {
    const visible = [piece(1), piece(2), piece(3)];

    expect(
      archivePieces(visible, { by: "ids", ids: ["inv_1", "inv_3", "inv_1"] }).map((p) => p.id),
    ).toEqual(["inv_3", "inv_1"]);
  });

  it("refuse une sélection dont un id n'est pas visible, en le nommant", () => {
    const refuse = (): unknown =>
      archivePieces([piece(1)], { by: "ids", ids: ["inv_1", "inv_other", "inv_ghost"] });

    expect(refuse).toThrow(InvoiceArchiveNotVisibleError);
    expect(refuse).toThrow(/inv_other, inv_ghost/);
  });

  it("refuse un filtre qui ne retient rien", () => {
    expect(() =>
      archivePieces([piece(1)], { by: "filter", filter: { year: 2025, month: null, kind: null } }),
    ).toThrow(InvoiceArchiveEmptyError);
  });

  it("plafonne à 200 pièces : 200 passent, 201 sont refusées en le disant", () => {
    const many = (count: number): ArchiveCandidate[] =>
      Array.from({ length: count }, (_, index) => piece(index + 1));

    expect(archivePieces(many(INVOICE_ARCHIVE_MAX_PIECES), ALL)).toHaveLength(200);
    expect(() => archivePieces(many(INVOICE_ARCHIVE_MAX_PIECES + 1), ALL)).toThrow(
      InvoiceArchiveTooLargeError,
    );
    expect(() => archivePieces(many(INVOICE_ARCHIVE_MAX_PIECES + 1), ALL)).toThrow(/201 pièces/);
  });

  it("refuse si une pièce retenue n'a pas son PDF, en nommant chacune", () => {
    const visible = [piece(1), piece(2, { rendered: false }), piece(3, { rendered: false })];

    expect(() => archivePieces(visible, ALL)).toThrow(InvoiceArchiveNotRenderedError);
    expect(() => archivePieces(visible, ALL)).toThrow(/FA-2026-000003, FA-2026-000002/);
    expect(archivePieces(visible, { by: "ids", ids: ["inv_1"] })).toHaveLength(1);
  });
});

describe("le nom du zip", () => {
  it("dit la société en ASCII et le filtre", () => {
    expect(archiveFileName("Boulangerie Élysée & Fils", ALL)).toBe(
      "factures-boulangerie-elysee-fils-tout.zip",
    );
    expect(
      archiveFileName("Café", { by: "filter", filter: { year: 2026, month: 3, kind: null } }),
    ).toBe("factures-cafe-2026-03.zip");
    expect(
      archiveFileName("Café", {
        by: "filter",
        filter: { year: 2026, month: null, kind: "credit_note" },
      }),
    ).toBe("factures-cafe-2026-avoirs.zip");
    expect(archiveFileName("Café", { by: "ids", ids: ["inv_1"] })).toBe(
      "factures-cafe-selection.zip",
    );
  });

  it("un nom sans lettre latine retombe sur « societe »", () => {
    expect(archiveFileName("", ALL)).toBe("factures-societe-tout.zip");
  });
});
