import { Buffer } from "node:buffer";

import { Invoice } from "../../../domain/entities/invoice.js";
import { BUYER, issueInput } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import {
  InvoiceCompanyNotFoundError,
  InvoiceRoleRequiredError,
} from "../../../domain/errors/invoice-access-errors.js";
import {
  InvoiceArchiveNotRenderedError,
  InvoiceArchiveNotVisibleError,
  InvoiceArchiveTamperedError,
} from "../../../domain/errors/invoice-archive-errors.js";
import { CompanyLabelReader } from "../../../domain/ports/company-label.reader.js";
import { StoredZipWriter, type ZipEntry } from "../../../domain/ports/stored-zip-writer.js";
import { NO_LEDGER_FILTER } from "../../../domain/services/my-invoices-ledger.js";
import { InvoiceNumber } from "../../../domain/value-objects/invoice-number.js";
import { sha256Hex } from "../../invoice-document-support.js";
import {
  FixedRoles,
  MemoryCompanyInvoices,
  MemoryKeptStore,
} from "../../services/__tests__/issued-invoice-doubles.js";
import { ExportMyCompanyInvoicesArchiveHandler } from "../export-my-company-invoices-archive.handler.js";
import { ExportMyCompanyInvoicesArchiveQuery } from "../issued-invoice-queries.js";

/** Le zip de « Mes factures » (P2) : le mur, une lecture, tout vérifié avant de rendre. */

class RecordingZip extends StoredZipWriter {
  readonly written: (readonly ZipEntry[])[] = [];
  write(entries: readonly ZipEntry[]): Uint8Array {
    this.written.push(entries);
    return new Uint8Array([0x50, 0x4b]);
  }
}

class FixedLabel extends CompanyLabelReader {
  labelOf(): Promise<string | null> {
    return Promise.resolve("Le Port");
  }
}

const ALL = { by: "filter", filter: NO_LEDGER_FILTER } as const;

function rendered(rank: number, bytes: Buffer, companyId = BUYER.companyId): Invoice {
  const invoice = Invoice.issue(
    issueInput({
      id: `inv_${String(rank)}`,
      number: InvoiceNumber.compose("LFD", 2026, rank),
      buyer: { ...BUYER, companyId },
    }),
  );
  invoice.attachDocument(`invoices/le_1/${invoice.toState().number}.pdf`, sha256Hex(bytes));
  return invoice;
}

function harness(invoices: readonly Invoice[], bytes: ReadonlyMap<string, Buffer>) {
  const store = new MemoryKeptStore();
  for (const invoice of invoices) {
    const key = invoice.toState().documentKey;
    const content = bytes.get(invoice.id);
    if (key !== null && content !== undefined) {
      store.objects.set(key, { bytes: content, contentType: "application/pdf" });
    }
  }
  const reader = new MemoryCompanyInvoices(invoices);
  const zip = new RecordingZip();
  const roles = new FixedRoles(
    new Map([
      ["u_compta:c_port", "billing"],
      ["u_orders:c_port", "orders"],
    ] as const),
  );
  return {
    store,
    reader,
    zip,
    handler: new ExportMyCompanyInvoicesArchiveHandler(roles, reader, new FixedLabel(), store, zip),
  };
}

const PDF_1 = Buffer.from("%PDF-1.7 une");
const PDF_2 = Buffer.from("%PDF-1.7 deux");
const BYTES = new Map([
  ["inv_1", PDF_1],
  ["inv_2", PDF_2],
]);

describe("le zip de « Mes factures » (P2)", () => {
  it("toutes les pièces visibles, en UNE lecture de liste, aucune lecture unitaire", async () => {
    const h = harness([rendered(1, PDF_1), rendered(2, PDF_2)], BYTES);

    const archive = await h.handler.execute(
      new ExportMyCompanyInvoicesArchiveQuery("u_compta", BUYER.companyId, ALL),
    );

    expect(archive.fileName).toBe("factures-le-port-tout.zip");
    expect(h.reader.listCalls).toEqual([undefined]);
    expect(h.reader.oneCalls).toBe(0);
    const [entries] = h.zip.written;
    expect(entries?.map((entry) => entry.name)).toEqual([
      "FA-LFD-2026-000002.pdf",
      "FA-LFD-2026-000001.pdf",
    ]);
    expect(Buffer.from(entries?.[1]?.bytes ?? []).equals(PDF_1)).toBe(true);
  });

  it("une sélection est lue par la même lecture, filtrée par ses ids", async () => {
    const h = harness([rendered(1, PDF_1), rendered(2, PDF_2)], BYTES);

    await h.handler.execute(
      new ExportMyCompanyInvoicesArchiveQuery("u_compta", BUYER.companyId, {
        by: "ids",
        ids: ["inv_2"],
      }),
    );

    expect(h.reader.listCalls).toEqual([["inv_2"]]);
    expect(h.zip.written[0]?.map((entry) => entry.name)).toEqual(["FA-LFD-2026-000002.pdf"]);
  });

  it("le mur : non-membre 404, autre rôle 403 — et rien n'est lu", async () => {
    const h = harness([rendered(1, PDF_1)], BYTES);

    await expect(
      h.handler.execute(new ExportMyCompanyInvoicesArchiveQuery("u_stranger", "c_port", ALL)),
    ).rejects.toBeInstanceOf(InvoiceCompanyNotFoundError);
    await expect(
      h.handler.execute(new ExportMyCompanyInvoicesArchiveQuery("u_orders", "c_port", ALL)),
    ).rejects.toBeInstanceOf(InvoiceRoleRequiredError);
    expect(h.reader.listCalls).toEqual([]);
    expect(h.store.readKeys).toEqual([]);
    expect(h.zip.written).toEqual([]);
  });

  it("un id d'une autre société : refusé en le nommant, rien n'est relu", async () => {
    const h = harness([rendered(1, PDF_1), rendered(2, PDF_2, "c_other")], BYTES);

    await expect(
      h.handler.execute(
        new ExportMyCompanyInvoicesArchiveQuery("u_compta", BUYER.companyId, {
          by: "ids",
          ids: ["inv_1", "inv_2"],
        }),
      ),
    ).rejects.toThrow(InvoiceArchiveNotVisibleError);
    expect(h.store.readKeys).toEqual([]);
  });

  it("une pièce pas rendue : refusée avant toute lecture du seau", async () => {
    const pending = Invoice.issue(
      issueInput({ id: "inv_3", number: InvoiceNumber.compose("LFD", 2026, 3) }),
    );
    const h = harness([rendered(1, PDF_1), pending], BYTES);

    await expect(
      h.handler.execute(new ExportMyCompanyInvoicesArchiveQuery("u_compta", BUYER.companyId, ALL)),
    ).rejects.toThrow(InvoiceArchiveNotRenderedError);
    expect(h.store.readKeys).toEqual([]);
  });

  it("une empreinte fausse : tout est relu, le refus nomme chaque pièce, aucun zip", async () => {
    const h = harness(
      [rendered(1, PDF_1), rendered(2, PDF_2)],
      new Map([
        ["inv_1", Buffer.from("altéré 1")],
        ["inv_2", Buffer.from("altéré 2")],
      ]),
    );

    const refusal = h.handler.execute(
      new ExportMyCompanyInvoicesArchiveQuery("u_compta", BUYER.companyId, ALL),
    );

    await expect(refusal).rejects.toThrow(InvoiceArchiveTamperedError);
    await expect(refusal).rejects.toThrow(/FA-LFD-2026-000002, FA-LFD-2026-000001/);
    expect(h.zip.written).toEqual([]);
  });
});
