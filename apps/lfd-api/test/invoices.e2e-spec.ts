/**
 * E2E de **la facture émise** (plan
 * `documentation/comptabilite/facturation/facture-emise.md`).
 *
 * Ce que seul le vrai SQL prouve : le compteur rend des numéros consécutifs
 * par entité et par année, sans trou même quand l'émission échoue après
 * avoir pris son numéro ni quand deux émissions se croisent ; la base tient la
 * pièce immuable (aucune modification hors la pose du document, une fois ;
 * aucune suppression) ; un bon n'est facturé qu'une fois.
 *
 * Les pièces viennent des fixtures du domaine (`invoice-fixtures.ts`) : le
 * contenu d'une facture est le sujet d'E1, ici on éprouve sa persistance. Les
 * dates d'émission ne sont comparées qu'entre elles, jamais à l'horloge.
 */
import { InvoiceFontsUnavailableError } from "../src/b2b/accounting/domain/errors/invoice-document-errors.js";
import {
  InvoiceFontSource,
  type InvoicePdfFonts,
} from "../src/b2b/accounting/domain/ports/invoice-font-source.js";
import { Invoice } from "../src/b2b/accounting/domain/entities/invoice.js";
import {
  breakdownOf,
  issueInput,
  line,
} from "../src/b2b/accounting/domain/entities/__tests__/invoice-fixtures.js";
import type { InvoiceOrderReference } from "../src/b2b/accounting/domain/entities/invoice.types.js";
import {
  InvoiceDocumentAlreadyAttachedError,
  InvoiceIssuanceBlockedError,
  InvoiceIssuedBeforePreviousError,
} from "../src/b2b/accounting/domain/errors/invoice-errors.js";
import { InvoiceReader } from "../src/b2b/accounting/domain/ports/invoice.reader.js";
import { InvoiceRepository } from "../src/b2b/accounting/domain/ports/invoice.repository.js";
import { InvoiceIssuer } from "../src/b2b/accounting/application/services/invoice-issuer.js";
import type { InvoiceNumber } from "../src/b2b/accounting/domain/value-objects/invoice-number.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const ISSUED_ON = "2026-09-30";
const DUE_ON = "2026-10-14";
const NEXT_YEAR_ON = "2027-01-04";
const SHA = "a".repeat(64);

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/**
 * Le rendu PDF (E3b) suit chaque émission en tâche de fond et pose
 * `document_key` : il courrait ici contre les specs qui posent le document
 * à la main pour éprouver la base. Cette suite éprouve la PIÈCE ; le rendu
 * l'est dans `issued-invoices.e2e-spec.ts`. Des polices refusées le font
 * échouer, journalisé, sans rien attacher.
 */
class NoFonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.reject(new InvoiceFontsUnavailableError("fonts (suite invoices.e2e)", null));
  }
}

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: InvoiceFontSource, value: new NoFonts() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une entité émettrice en base — la clé étrangère de la facture et du compteur. */
async function declareEntity(
  name = "La Folie Douce",
  siren = "552100554",
  vatNumber = "FR40552100554",
): Promise<string> {
  const response = await ctx
    .asSub("staff-e2e")
    .post("/admin/accounting/legal-entities")
    .send({
      name,
      legalForm: "SAS",
      siren,
      rcs: `Chambéry B ${siren}`,
      shareCapitalCents: 1_000_000,
      vatNumber,
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Des bons neufs à chaque appel : l'unicité d'un bon facturé ne se croise pas entre tests. */
function freshOrders(): [InvoiceOrderReference, InvoiceOrderReference] {
  seq += 2;
  // Pas dans l'ordre des numéros : la relecture rend l'ordre d'écriture (`position`).
  return [
    { orderId: `o_${String(seq + 1)}`, reference: `CMD-${String(seq + 1)}`, deliveredOn: null },
    { orderId: `o_${String(seq)}`, reference: `CMD-${String(seq)}`, deliveredOn: ISSUED_ON },
  ];
}

interface DraftOptions {
  readonly issuedOn?: string;
  readonly dueOn?: string;
  readonly orders?: readonly InvoiceOrderReference[];
}

/** Le brouillon d'une facture de l'entité, à numéroter. */
function draftFor(
  entityId: string,
  options: DraftOptions = {},
): (number: InvoiceNumber) => Invoice {
  const base = issueInput();
  return (number: InvoiceNumber): Invoice => {
    seq += 1;
    return Invoice.issue(
      issueInput({
        id: `inv_${String(seq)}`,
        number,
        issuedOn: options.issuedOn ?? ISSUED_ON,
        dueOn: options.dueOn ?? DUE_ON,
        seller: { ...base.seller, legalEntityId: entityId },
        ...(base.sellerFacts === null
          ? {}
          : { sellerFacts: { ...base.sellerFacts, legalEntityId: entityId } }),
        orders: options.orders ?? freshOrders(),
      }),
    );
  };
}

async function issue(entityId: string, options: DraftOptions = {}): Promise<Invoice> {
  return ctx.app.get(InvoiceIssuer).issue({
    legalEntityId: entityId,
    issuedOn: options.issuedOn ?? ISSUED_ON,
    draft: draftFor(entityId, options),
  });
}

function reader(): InvoiceReader {
  return ctx.app.get(InvoiceReader);
}

async function mustRead(invoiceId: string): Promise<Invoice> {
  const invoice = await reader().byId(invoiceId);
  if (invoice === null) {
    throw new Error(`facture ${invoiceId} absente`);
  }
  return invoice;
}

async function numbersOf(entityId: string, year: number): Promise<string[]> {
  return (await reader().byEntityAndYear(entityId, year)).map((invoice) => invoice.number);
}

describe("la facture émise", () => {
  it("se relit identique, et journalise son émission", async () => {
    const entity = await declareEntity();
    const orders = freshOrders();

    const issued = await issue(entity, { orders });

    const read = await reader().byId(issued.id);
    expect(read?.toState()).toEqual(issued.toState());
    expect(await reader().byPayer(issued.toState().buyer.companyId)).toHaveLength(1);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: issued.id, type: "invoice.issued" },
      select: { payload: true },
    });
    expect(facts).toEqual([
      {
        payload: {
          subjectLabel: "FA-2026-000001",
          legalEntity: { id: entity, name: issued.toState().seller.name },
          payer: { id: "c_port", name: "Boulangerie du Port" },
          issuedOn: ISSUED_ON,
          orderCount: 2,
          totalCents: issued.totalTtcCents,
        },
      },
    ]);
  });

  it("numérote à la suite par entité et par année, et repart à 1 l'année suivante", async () => {
    const first = await declareEntity();
    const second = await declareEntity("Seconde entité", "732829320", "FR44732829320");

    await issue(first);
    await issue(first);
    await issue(first, { issuedOn: NEXT_YEAR_ON, dueOn: NEXT_YEAR_ON });

    expect(await numbersOf(first, 2026)).toEqual(["FA-2026-000001", "FA-2026-000002"]);
    expect(await numbersOf(first, 2027)).toEqual(["FA-2027-000001"]);
    // Le numéro est unique dans toute la base (plan § 9, une seule entité encaisse) :
    // la seconde entité prend sa propre séquence, et sa première émission de
    // 2026 heurte le FA-2026-000001 de la première.
    await expect(issue(second)).rejects.toThrow(/number/u);
    expect(await numbersOf(second, 2026)).toEqual([]);
  });

  it("donne deux numéros distincts et consécutifs à deux émissions concurrentes", async () => {
    const entity = await declareEntity();

    const issued = await Promise.all([issue(entity), issue(entity)]);

    expect(issued.map((invoice) => invoice.number).sort()).toEqual([
      "FA-2026-000001",
      "FA-2026-000002",
    ]);
  });

  /** Le numéro pris est rendu avec la transaction : la suivante le reprend. */
  it("ne laisse aucun trou quand l'émission échoue après avoir pris son numéro", async () => {
    const entity = await declareEntity();
    await issue(entity);

    const refused = ctx.app.get(InvoiceIssuer).issue({
      legalEntityId: entity,
      issuedOn: ISSUED_ON,
      draft: (number) => Invoice.issue(issueInput({ number, buyer: null, orders: freshOrders() })),
    });
    await expect(refused).rejects.toBeInstanceOf(InvoiceIssuanceBlockedError);
    await issue(entity);

    expect(await numbersOf(entity, 2026)).toEqual(["FA-2026-000001", "FA-2026-000002"]);
    const counter = await ctx.prisma.invoiceNumberCounter.findMany({
      where: { legalEntityId: entity },
    });
    expect(counter).toEqual([
      {
        legalEntityId: entity,
        year: 2026,
        lastRank: 2,
        lastIssuedOn: new Date(`${ISSUED_ON}T00:00:00.000Z`),
      },
    ]);
  });

  it("attache son document une fois, et refuse la seconde pose", async () => {
    const entity = await declareEntity();
    const issued = await issue(entity);
    const repository = ctx.app.get(InvoiceRepository);

    const loaded = await mustRead(issued.id);
    loaded.attachDocument("invoices/FA-2026-000001.pdf", SHA);
    await repository.attachDocument(loaded);
    // Une seconde copie, chargée avant la pose : l'agrégat l'accepte, la base non.
    issued.attachDocument("invoices/autre.pdf", "b".repeat(64));

    await expect(repository.attachDocument(issued)).rejects.toBeInstanceOf(
      InvoiceDocumentAlreadyAttachedError,
    );
    const reread = (await reader().byId(issued.id))?.toState();
    expect(reread?.documentKey).toBe("invoices/FA-2026-000001.pdf");
    expect(reread?.documentSha256).toBe(SHA);
  });

  it("refuse en base toute modification et toute suppression", async () => {
    const entity = await declareEntity();
    const issued = await issue(entity);

    await expect(
      ctx.prisma.invoice.update({ where: { id: issued.id }, data: { totalHtCents: 1 } }),
    ).rejects.toThrow(/invoice_immutable/u);
    await expect(ctx.prisma.invoice.delete({ where: { id: issued.id } })).rejects.toThrow(
      /invoice_immutable/u,
    );
    await expect(
      ctx.prisma.invoiceOrder.updateMany({
        where: { invoiceId: issued.id },
        data: { orderNumber: "AUTRE" },
      }),
    ).rejects.toThrow(/invoice_order_immutable/u);
    await expect(
      ctx.prisma.invoiceOrder.deleteMany({ where: { invoiceId: issued.id } }),
    ).rejects.toThrow(/invoice_order_immutable/u);
    await expect(
      ctx.prisma.invoiceNumberCounter.updateMany({
        where: { legalEntityId: entity },
        data: { lastRank: 5 },
      }),
    ).rejects.toThrow(/invoice_number_counter_monotonic/u);
  });

  it("refuse en base un document posé seul, ou reposé", async () => {
    const entity = await declareEntity();
    const issued = await issue(entity);

    await expect(
      ctx.prisma.invoice.update({ where: { id: issued.id }, data: { documentKey: "k" } }),
    ).rejects.toThrow(/invoice_immutable/u);
    await ctx.prisma.invoice.update({
      where: { id: issued.id },
      data: { documentKey: "k", documentSha256: SHA },
    });
    await expect(
      ctx.prisma.invoice.update({
        where: { id: issued.id },
        data: { documentKey: "k2", documentSha256: SHA },
      }),
    ).rejects.toThrow(/invoice_immutable/u);
  });

  it("ne facture un bon qu'une fois, et rend le numéro du refus", async () => {
    const entity = await declareEntity();
    const orders = freshOrders();
    await issue(entity, { orders });

    await expect(issue(entity, { orders: [orders[0]] })).rejects.toThrow(/order_id/u);

    await issue(entity);
    expect(await numbersOf(entity, 2026)).toEqual(["FA-2026-000001", "FA-2026-000002"]);
  });
});

describe("la chronologie", () => {
  /** La séquence est chronologique ET continue : un jour antérieur ne prend pas de rang. */
  it("refuse une émission datée avant la précédente, sans laisser de trou", async () => {
    const entity = await declareEntity();
    await issue(entity, { issuedOn: DUE_ON, dueOn: DUE_ON });

    await expect(issue(entity)).rejects.toBeInstanceOf(InvoiceIssuedBeforePreviousError);
    await issue(entity, { issuedOn: DUE_ON, dueOn: DUE_ON });

    expect(await numbersOf(entity, 2026)).toEqual(["FA-2026-000001", "FA-2026-000002"]);
    await expect(
      ctx.prisma.invoiceNumberCounter.updateMany({
        where: { legalEntityId: entity },
        data: { lastRank: 3, lastIssuedOn: new Date(`${ISSUED_ON}T00:00:00.000Z`) },
      }),
    ).rejects.toThrow(/invoice_number_counter_monotonic/u);
  });
});

describe("l'avoir", () => {
  it("prend son numéro dans la même séquence, cite sa facture et ses bons, et se relit lié", async () => {
    const entity = await declareEntity();
    const orders = freshOrders();
    const invoice = await issue(entity, { orders });
    const lines = [line("PAIN", 5.5, 500)];

    const creditNote = await ctx.app.get(InvoiceIssuer).issue({
      legalEntityId: entity,
      issuedOn: DUE_ON,
      draft: (number) =>
        Invoice.creditNote({
          id: "cn_e2e",
          number,
          issuedOn: DUE_ON,
          corrected: invoice,
          priorCreditNotes: [],
          orders: [orders[0]],
          lines,
          vat: breakdownOf(lines),
        }),
    });

    expect(creditNote.number).toBe("FA-2026-000002");
    const read = (await reader().byId("cn_e2e"))?.toState();
    expect(read).toEqual(creditNote.toState());
    expect(read?.correctedInvoiceId).toBe(invoice.id);
    expect(read?.correctedInvoiceNumber).toBe("FA-2026-000001");
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: "cn_e2e", type: "invoice.credit_note_issued" },
      select: { payload: true },
    });
    expect(facts[0]?.payload).toMatchObject({
      subjectLabel: "FA-2026-000002",
      correctedInvoice: { id: invoice.id, name: "FA-2026-000001" },
    });
  });
});
