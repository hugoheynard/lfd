import { Invoice } from "../../../domain/entities/invoice.js";
import { BUYER, issueInput } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import {
  InvoiceCompanyNotFoundError,
  InvoiceNotFoundError,
  InvoiceRoleRequiredError,
} from "../../../domain/errors/invoice-access-errors.js";
import { InvoiceNumber } from "../../../domain/value-objects/invoice-number.js";
import {
  FixedInvoicePeriods,
  FixedRoles,
  MemoryInvoiceReader,
} from "../../services/__tests__/issued-invoice-doubles.js";
import { GetIssuedInvoiceHandler } from "../get-issued-invoice.handler.js";
import { GetMyCompanyInvoiceHandler } from "../get-my-company-invoice.handler.js";
import {
  GetIssuedInvoiceQuery,
  GetMyCompanyInvoiceQuery,
  ListCompanyInvoicesQuery,
  ListMyCompanyInvoicesQuery,
} from "../issued-invoice-queries.js";
import { ListCompanyInvoicesHandler } from "../list-company-invoices.handler.js";
import { ListMyCompanyInvoicesHandler } from "../list-my-company-invoices.handler.js";

const SEPTEMBER = Invoice.issue(
  issueInput({ paymentMeans: { code: "59", mandateReference: "RUM-PORT-1" } }),
);
const OCTOBER = Invoice.issue(
  issueInput({
    id: "inv_2",
    number: InvoiceNumber.compose(2026, 2),
    issuedOn: "2026-10-31",
    dueOn: "2026-11-14",
  }),
);
const OTHER_PAYER = Invoice.issue(
  issueInput({
    id: "inv_3",
    number: InvoiceNumber.compose(2026, 3),
    buyer: { ...BUYER, companyId: "c_other", name: "Autre" },
  }),
);

const invoices = new MemoryInvoiceReader([SEPTEMBER, OCTOBER, OTHER_PAYER]);
const periods = new FixedInvoicePeriods(new Map([["inv_1", "2026-09"]]));
const roles = new FixedRoles(
  new Map([
    ["u_owner:c_port", "owner"],
    ["u_compta:c_port", "billing"],
    ["u_orders:c_port", "orders"],
  ] as const),
);

describe("« Mes factures » côté client (E6)", () => {
  const list = new ListMyCompanyInvoicesHandler(roles, invoices, periods);
  const read = new GetMyCompanyInvoiceHandler(roles, invoices, periods);

  it("le détenteur et le rôle facturation voient les pièces adressées à leur société, récentes d'abord", async () => {
    for (const user of ["u_owner", "u_compta"]) {
      const view = await list.execute(new ListMyCompanyInvoicesQuery(user, "c_port"));
      expect(view.invoices.map((invoice) => [invoice.number, invoice.period])).toEqual([
        ["FA-2026-000002", null],
        ["FA-2026-000001", "2026-09"],
      ]);
    }
  });

  it("un résumé porte la date, l'échéance et les trois totaux", async () => {
    const view = await list.execute(new ListMyCompanyInvoicesQuery("u_owner", "c_port"));

    expect(view.invoices[1]).toEqual({
      invoiceId: "inv_1",
      number: "FA-2026-000001",
      kind: "invoice",
      correctedInvoiceNumber: null,
      issuedOn: "2026-09-30",
      dueOn: "2026-10-14",
      period: "2026-09",
      totalHtCents: 1_500,
      totalVatCents: 155,
      totalTtcCents: 1_655,
      documentAvailable: false,
    });
  });

  it("un non-membre : 404 ; un autre rôle : 403", async () => {
    await expect(
      list.execute(new ListMyCompanyInvoicesQuery("u_stranger", "c_port")),
    ).rejects.toBeInstanceOf(InvoiceCompanyNotFoundError);
    await expect(
      list.execute(new ListMyCompanyInvoicesQuery("u_orders", "c_port")),
    ).rejects.toBeInstanceOf(InvoiceRoleRequiredError);
    await expect(
      read.execute(new GetMyCompanyInvoiceQuery("u_orders", "c_port", "inv_1")),
    ).rejects.toBeInstanceOf(InvoiceRoleRequiredError);
  });

  it("le détail : lignes, ventilation, mentions, RUM — sans l'IBAN du vendeur", async () => {
    const view = await read.execute(new GetMyCompanyInvoiceQuery("u_compta", "c_port", "inv_1"));

    expect(view.lines.map((line) => line.sku)).toEqual(["PAIN", "JUS"]);
    expect(view.vat.categories.map((category) => [category.rate, category.vatCents])).toEqual([
      [5.5, 55],
      [20, 100],
    ]);
    expect(view.mentions.latePenaltyRateBasisPoints).toBe(1_415);
    expect(view.mandateReference).toBe("RUM-PORT-1");
    expect(view.orders).toEqual([
      { reference: "CMD-001", deliveredOn: "2026-09-12" },
      { reference: "CMD-002", deliveredOn: null },
    ]);
    expect(view.documentAvailable).toBe(false);
    expect(JSON.stringify(view.seller)).not.toMatch(/iban|bic/iu);
  });

  /** Le mur est la société : la pièce d'un autre payeur est un 404, comme une pièce absente. */
  it("une facture adressée à une autre société, ou absente : 404", async () => {
    await expect(
      read.execute(new GetMyCompanyInvoiceQuery("u_owner", "c_port", "inv_3")),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    await expect(
      read.execute(new GetMyCompanyInvoiceQuery("u_owner", "c_port", "absente")),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });
});

describe("les factures depuis le back-office (E6)", () => {
  it("la fiche lit celles de la société ; la comptabilité lit n'importe quelle pièce", async () => {
    const list = await new ListCompanyInvoicesHandler(invoices, periods).execute(
      new ListCompanyInvoicesQuery("c_other"),
    );
    expect(list.invoices.map((invoice) => invoice.number)).toEqual(["FA-2026-000003"]);

    const one = await new GetIssuedInvoiceHandler(invoices, periods).execute(
      new GetIssuedInvoiceQuery("inv_3"),
    );
    expect(one.payerCompanyId).toBe("c_other");
    await expect(
      new GetIssuedInvoiceHandler(invoices, periods).execute(new GetIssuedInvoiceQuery("absente")),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });
});
