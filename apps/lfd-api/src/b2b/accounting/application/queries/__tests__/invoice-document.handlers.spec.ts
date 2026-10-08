import { Buffer } from "node:buffer";

import { Invoice } from "../../../domain/entities/invoice.js";
import { BUYER, issueInput } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import {
  InvoiceCompanyNotFoundError,
  InvoiceNotFoundError,
  InvoiceRoleRequiredError,
} from "../../../domain/errors/invoice-access-errors.js";
import {
  InvoiceDocumentNotRenderedError,
  InvoiceDocumentTamperedError,
} from "../../../domain/errors/invoice-document-errors.js";
import { InvoiceNumber } from "../../../domain/value-objects/invoice-number.js";
import { sha256Hex } from "../../invoice-document-support.js";
import {
  FixedRoles,
  MemoryCompanyInvoices,
  MemoryInvoiceReader,
  MemoryKeptStore,
} from "../../services/__tests__/issued-invoice-doubles.js";
import { GetIssuedInvoiceDocumentHandler } from "../get-issued-invoice-document.handler.js";
import { GetMyCompanyInvoiceDocumentHandler } from "../get-my-company-invoice-document.handler.js";
import {
  GetIssuedInvoiceDocumentQuery,
  GetMyCompanyInvoiceDocumentQuery,
} from "../issued-invoice-queries.js";

/**
 * Lire le PDF rangé d'une pièce (E3b) : le mur client d'E6, un 404 nommé tant
 * que le rendu n'est pas fait, et l'empreinte vérifiée avant de servir.
 */

const PDF = Buffer.from("%PDF-1.7 pièce rangée");
const KEY = "invoices/le_1/FA-2026-000001.pdf";

function rendered(): Invoice {
  const invoice = Invoice.issue(issueInput());
  invoice.attachDocument(KEY, sha256Hex(PDF));
  return invoice;
}

const PENDING = Invoice.issue(issueInput({ id: "inv_2", number: InvoiceNumber.compose(2026, 2) }));
const OTHER_PAYER = Invoice.issue(
  issueInput({
    id: "inv_3",
    number: InvoiceNumber.compose(2026, 3),
    buyer: { ...BUYER, companyId: "c_other", name: "Autre" },
  }),
);
const roles = new FixedRoles(
  new Map([
    ["u_compta:c_port", "billing"],
    ["u_orders:c_port", "orders"],
  ] as const),
);

function harness() {
  const store = new MemoryKeptStore();
  store.objects.set(KEY, { bytes: PDF, contentType: "application/pdf" });
  const invoices = new MemoryInvoiceReader([rendered(), PENDING, OTHER_PAYER]);
  return {
    store,
    admin: new GetIssuedInvoiceDocumentHandler(invoices, store),
    client: new GetMyCompanyInvoiceDocumentHandler(
      roles,
      new MemoryCompanyInvoices([rendered(), PENDING, OTHER_PAYER]),
      store,
    ),
  };
}

describe("le PDF d'une pièce, côté client (E3b)", () => {
  it("le rôle facturation reçoit le PDF rangé, sous le nom de la pièce", async () => {
    const document = await harness().client.execute(
      new GetMyCompanyInvoiceDocumentQuery("u_compta", "c_port", "inv_1"),
    );

    expect(document.fileName).toBe("FA-2026-000001.pdf");
    expect(document.bytes.equals(PDF)).toBe(true);
  });

  it("le mur d'E6 : non-membre 404, autre rôle 403, pièce d'une autre société 404", async () => {
    const { client } = harness();

    await expect(
      client.execute(new GetMyCompanyInvoiceDocumentQuery("u_stranger", "c_port", "inv_1")),
    ).rejects.toBeInstanceOf(InvoiceCompanyNotFoundError);
    await expect(
      client.execute(new GetMyCompanyInvoiceDocumentQuery("u_orders", "c_port", "inv_1")),
    ).rejects.toBeInstanceOf(InvoiceRoleRequiredError);
    await expect(
      client.execute(new GetMyCompanyInvoiceDocumentQuery("u_compta", "c_port", "inv_3")),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it("une pièce pas encore rendue : un 404 qui le dit", async () => {
    await expect(
      harness().client.execute(new GetMyCompanyInvoiceDocumentQuery("u_compta", "c_port", "inv_2")),
    ).rejects.toBeInstanceOf(InvoiceDocumentNotRenderedError);
  });
});

describe("le PDF d'une pièce, depuis la comptabilité (E3b)", () => {
  it("sert n'importe quelle pièce rendue ; 404 pour une absente ou une pas encore rendue", async () => {
    const { admin } = harness();

    expect(
      (await admin.execute(new GetIssuedInvoiceDocumentQuery("inv_1"))).bytes.equals(PDF),
    ).toBe(true);
    await expect(
      admin.execute(new GetIssuedInvoiceDocumentQuery("absente")),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    await expect(admin.execute(new GetIssuedInvoiceDocumentQuery("inv_2"))).rejects.toBeInstanceOf(
      InvoiceDocumentNotRenderedError,
    );
  });

  it("un objet altéré dans le seau n'est pas servi sous le nom de la pièce", async () => {
    const h = harness();
    h.store.objects.set(KEY, {
      bytes: Buffer.from("%PDF- falsifié"),
      contentType: "application/pdf",
    });

    await expect(
      h.admin.execute(new GetIssuedInvoiceDocumentQuery("inv_1")),
    ).rejects.toBeInstanceOf(InvoiceDocumentTamperedError);
  });
});
