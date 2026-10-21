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
  SEPTEMBER_2026,
  FixedRoles,
  FixedSettlementFacts,
  MemoryCompanyInvoices,
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
const periods = new FixedInvoicePeriods(new Map([["inv_1", SEPTEMBER_2026]]));
const roles = new FixedRoles(
  new Map([
    ["u_owner:c_port", "owner"],
    ["u_compta:c_port", "billing"],
    ["u_orders:c_port", "orders"],
    ["u_site:c_site", "billing"],
    ["u_site_orders:c_site", "orders"],
  ] as const),
);
/** La facture de la maison mère `c_port` qui porte aussi le bon `o_site` du site `c_site`. */
const MOTHER = Invoice.issue(
  issueInput({
    id: "inv_9",
    number: InvoiceNumber.compose(2026, 9),
    orders: [
      { orderId: "o_port", reference: "CMD-008", deliveredOn: null },
      { orderId: "o_site", reference: "CMD-009", deliveredOn: null },
    ],
  }),
);
const visible = new MemoryCompanyInvoices([SEPTEMBER, OCTOBER, OTHER_PAYER]);
const siteVisible = new MemoryCompanyInvoices(
  [SEPTEMBER, OCTOBER, OTHER_PAYER, MOTHER],
  new Map([["o_site", "c_site"]]),
);

describe("« Mes factures » côté client (E6)", () => {
  const list = new ListMyCompanyInvoicesHandler(
    roles,
    visible,
    periods,
    new FixedSettlementFacts(),
  );
  const read = new GetMyCompanyInvoiceHandler(roles, visible, periods);

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
      periodClosesAt: "2026-09-30T22:00:00.000Z",
      periodLabel: "du 1er au 30 septembre 2026",
      totalHtCents: 1_500,
      totalVatCents: 155,
      totalTtcCents: 1_655,
      documentAvailable: false,
      settlement: { status: "collection_planned", date: "2026-10-14", otherInvoicesOnDebit: 0 },
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

describe("« Mes factures » d'un site (E6, suite (a))", () => {
  const list = new ListMyCompanyInvoicesHandler(
    roles,
    siteVisible,
    periods,
    new FixedSettlementFacts(),
  );
  const read = new GetMyCompanyInvoiceHandler(roles, siteVisible, periods);

  it("voit, en lecture, les pièces de sa maison mère qui couvrent un de ses bons", async () => {
    const view = await list.execute(new ListMyCompanyInvoicesQuery("u_site", "c_site"));

    expect(view.invoices.map((invoice) => invoice.number)).toEqual(["FA-2026-000009"]);
    const one = await read.execute(new GetMyCompanyInvoiceQuery("u_site", "c_site", "inv_9"));
    expect(one.payerCompanyId).toBe("c_port");
  });

  it("ne voit pas une pièce qui ne porte aucun de ses bons ; le rôle commandes : 403", async () => {
    await expect(
      read.execute(new GetMyCompanyInvoiceQuery("u_site", "c_site", "inv_1")),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    await expect(
      list.execute(new ListMyCompanyInvoicesQuery("u_site_orders", "c_site")),
    ).rejects.toBeInstanceOf(InvoiceRoleRequiredError);
  });
});

/** Un retour à traiter sur une ligne déposée qui portait trois factures. */
const REJECTED = {
  debits: [
    {
      batchId: "01B",
      batchStatus: "deposited",
      constitutedAt: new Date("2026-10-02T08:00:00.000Z"),
      requestedCollectionDay: "2026-10-09",
      noticeCollectionDay: "2026-10-08",
      returnResolution: "pending",
      returnedOn: "2026-10-12",
      invoiceCountOnDebit: 3,
    },
  ],
  blocked: false,
} as const;

describe("« Mes factures » : règlement, total dû, filtres (plan page-mes-factures, P1)", () => {
  it("chaque pièce porte son statut ; le total dû compte le prévu et le rejeté, lus en UNE fois", async () => {
    const facts = new FixedSettlementFacts(new Map([["inv_1", REJECTED]]));
    const list = new ListMyCompanyInvoicesHandler(roles, visible, periods, facts);

    const view = await list.execute(new ListMyCompanyInvoicesQuery("u_compta", "c_port"));

    expect(view.invoices.map((one) => [one.number, one.settlement])).toEqual([
      [
        "FA-2026-000002",
        { status: "collection_planned", date: "2026-11-14", otherInvoicesOnDebit: 0 },
      ],
      [
        "FA-2026-000001",
        { status: "collection_rejected", date: "2026-10-12", otherInvoicesOnDebit: 2 },
      ],
    ]);
    expect(view.amountDue).toEqual({
      totalCents: 2 * 1_655,
      invoiceCount: 2,
      rejectedCount: 1,
      rejectedCents: 1_655,
    });
    expect(facts.calls).toEqual([["inv_1", "inv_2"]]);
  });

  it("le filtre choisit les lignes, jamais le total dû (§7.3)", async () => {
    const facts = new FixedSettlementFacts(new Map([["inv_1", REJECTED]]));
    const list = new ListMyCompanyInvoicesHandler(roles, visible, periods, facts);

    const view = await list.execute(
      new ListMyCompanyInvoicesQuery("u_owner", "c_port", { year: 2026, month: 10, kind: null }),
    );

    expect(view.invoices.map((one) => one.number)).toEqual(["FA-2026-000002"]);
    expect(view.amountDue.totalCents).toBe(2 * 1_655);
    const notes = await list.execute(
      new ListMyCompanyInvoicesQuery("u_owner", "c_port", {
        year: null,
        month: null,
        kind: "credit_note",
      }),
    );
    expect(notes.invoices).toEqual([]);
  });

  it("un site compte dans SON total la pièce rejetée de sa maison mère (Q-C)", async () => {
    const facts = new FixedSettlementFacts(new Map([["inv_9", REJECTED]]));
    const list = new ListMyCompanyInvoicesHandler(roles, siteVisible, periods, facts);

    const view = await list.execute(new ListMyCompanyInvoicesQuery("u_site", "c_site"));

    expect(view.amountDue).toMatchObject({ invoiceCount: 1, rejectedCount: 1 });
  });

  it("le mur passe avant toute lecture : un autre rôle, 403, et rien n'est lu", async () => {
    const facts = new FixedSettlementFacts();
    const list = new ListMyCompanyInvoicesHandler(roles, visible, periods, facts);

    await expect(
      list.execute(new ListMyCompanyInvoicesQuery("u_orders", "c_port")),
    ).rejects.toBeInstanceOf(InvoiceRoleRequiredError);
    expect(facts.calls).toEqual([]);
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
