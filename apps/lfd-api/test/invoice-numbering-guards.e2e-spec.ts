/**
 * E2E du **préfixe de numéro et du rang lié au compteur** (plan
 * `documentation/comptabilite/facturation/plan-zero-faille.md`, lot ZA).
 *
 * Ce que seul le vrai SQL prouve : le préfixe se pose par la route de l'entité
 * et se gèle à la première pièce — dans l'agrégat ET en base ; deux entités ne
 * le partagent pas ; une pièce ne porte que le préfixe de son entité, que le
 * rang que le compteur vient d'atteindre, et un compteur ne finit pas sa
 * transaction sans sa pièce. Les dates d'émission ne sont comparées qu'entre
 * elles, jamais à l'horloge.
 */
import { InvoiceIssuer } from "../src/b2b/accounting/application/services/invoice-issuer.js";
import { Invoice } from "../src/b2b/accounting/domain/entities/invoice.js";
import { issueInput } from "../src/b2b/accounting/domain/entities/__tests__/invoice-fixtures.js";
import { InvoiceIssuanceBlockedError } from "../src/b2b/accounting/domain/errors/invoice-errors.js";
import { InvoiceFontsUnavailableError } from "../src/b2b/accounting/domain/errors/invoice-document-errors.js";
import {
  InvoiceFontSource,
  type InvoicePdfFonts,
} from "../src/b2b/accounting/domain/ports/invoice-font-source.js";
import { InvoiceNumber } from "../src/b2b/accounting/domain/value-objects/invoice-number.js";
import { toInvoiceCreate } from "../src/b2b/accounting/infrastructure/invoice.mapper.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const ENTITIES = "/admin/accounting/legal-entities";
const ISSUED_ON = "2026-09-30";
const DUE_ON = "2026-10-14";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** Le rendu PDF suit l'émission en tâche de fond ; il n'est pas le sujet ici. */
class NoFonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.reject(new InvoiceFontsUnavailableError("fonts (suite numbering)", null));
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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function declareEntity(name = "La Folie Douce", siren = "552100554"): Promise<string> {
  const response = await staff()
    .post(ENTITIES)
    .send({
      name,
      legalForm: "SAS",
      siren,
      rcs: `Chambéry B ${siren}`,
      shareCapitalCents: 1_000_000,
      vatNumber: "",
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

function setPrefix(entityId: string, prefix: string) {
  return staff().put(`${ENTITIES}/${entityId}/invoice-prefix`).send({ prefix });
}

/** Une facture de l'entité sous ce numéro — construite par le domaine. */
function invoiceOf(entityId: string, number: InvoiceNumber): Invoice {
  const base = issueInput();
  seq += 1;
  return Invoice.issue(
    issueInput({
      id: `inv_${String(seq)}`,
      number,
      issuedOn: ISSUED_ON,
      dueOn: DUE_ON,
      seller: { ...base.seller, legalEntityId: entityId },
      ...(base.sellerFacts === null
        ? {}
        : {
            sellerFacts: {
              ...base.sellerFacts,
              legalEntityId: entityId,
              invoicePrefix: number.prefix,
            },
          }),
      orders: [
        { orderId: `o_${String(seq)}`, reference: `ORD-${String(seq)}`, receivedOn: ISSUED_ON },
      ],
    }),
  );
}

async function issue(entityId: string): Promise<Invoice> {
  return ctx.app.get(InvoiceIssuer).issue({
    legalEntityId: entityId,
    issuedOn: ISSUED_ON,
    draft: (number) => invoiceOf(entityId, number),
  });
}

async function viewOf(entityId: string): Promise<{
  readonly invoicePrefix: string | null;
  readonly invoicePrefixFrozen: boolean;
  readonly missingToInvoice: readonly string[];
}> {
  const response = await staff().get(`${ENTITIES}/${entityId}`).expect(200);
  return jsonBody(response);
}

describe("le préfixe de numéro, par la route de l'entité", () => {
  it("se pose en majuscules, se relit, et lève le manque « préfixe » de la fiche", async () => {
    const entity = await declareEntity();
    expect((await viewOf(entity)).missingToInvoice.join(" ")).toContain("préfixe de numéro");

    await setPrefix(entity, "lfd").expect(204);

    const view = await viewOf(entity);
    expect(view).toMatchObject({ invoicePrefix: "LFD", invoicePrefixFrozen: false });
    expect(view.missingToInvoice.join(" ")).not.toContain("préfixe de numéro");
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: entity, type: "legal_entity.invoice_prefix_set" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({ from: null, to: "LFD" });
  });

  it("refuse une forme fausse en 400, et un préfixe pris par une autre entité en 409", async () => {
    const first = await declareEntity();
    const second = await declareEntity("Seconde entité", "732829320");
    await setPrefix(first, "LFD").expect(204);

    const malformed = await setPrefix(second, "L1").expect(400);
    expect(JSON.stringify(malformed.body)).toContain("2 à 6 lettres");
    const taken = await setPrefix(second, "LFD").expect(409);
    expect(JSON.stringify(taken.body)).toContain("La Folie Douce");
    expect((await viewOf(second)).invoicePrefix).toBeNull();
  });

  it("se gèle à la première pièce : la fiche le dit, la route refuse en 409", async () => {
    const entity = await declareEntity();
    await setPrefix(entity, "LFD").expect(204);
    await setPrefix(entity, "LFC").expect(204);

    const issued = await issue(entity);

    expect(issued.number).toBe("FA-LFC-2026-000001");
    expect(await viewOf(entity)).toMatchObject({ invoicePrefix: "LFC", invoicePrefixFrozen: true });
    const refused = await setPrefix(entity, "LFD").expect(409);
    expect(JSON.stringify(refused.body)).toContain("FA-LFC-");
    await setPrefix(entity, "LFC").expect(204);
  });
});

describe("la base tient le préfixe", () => {
  it("une entité sans préfixe n'émet pas : refus nommé, aucun compteur ouvert", async () => {
    const entity = await declareEntity();

    await expect(issue(entity)).rejects.toBeInstanceOf(InvoiceIssuanceBlockedError);
    await expect(issue(entity)).rejects.toThrow(/n'a pas de préfixe de numéro de facture/u);
    expect(await ctx.prisma.invoiceNumberCounter.count({ where: { legalEntityId: entity } })).toBe(
      0,
    );
  });

  it("refuse de changer en base le préfixe d'une entité qui a émis", async () => {
    const entity = await declareEntity();
    await setPrefix(entity, "LFD").expect(204);
    await issue(entity);

    await expect(
      ctx.prisma.legalEntity.update({ where: { id: entity }, data: { invoicePrefix: "XYZ" } }),
    ).rejects.toThrow(/legal_entity_invoice_prefix_frozen/u);
    await expect(
      ctx.prisma.legalEntity.update({ where: { id: entity }, data: { invoicePrefix: null } }),
    ).rejects.toThrow(/legal_entity_invoice_prefix_frozen/u);
  });

  it("refuse une pièce dont le préfixe n'est pas celui de son entité", async () => {
    const entity = await declareEntity();
    await setPrefix(entity, "LFD").expect(204);

    await expect(
      ctx.app.get(InvoiceIssuer).issue({
        legalEntityId: entity,
        issuedOn: ISSUED_ON,
        draft: (number) =>
          invoiceOf(entity, InvoiceNumber.compose("XYZ", number.year, number.sequence)),
      }),
    ).rejects.toThrow(/invoice_prefix_of_entity/u);
    expect(await ctx.prisma.invoice.count({ where: { legalEntityId: entity } })).toBe(0);
  });

  it("refuse en base un numéro qui ne se recompose pas de son préfixe, son année et son rang", async () => {
    const entity = await declareEntity();
    await setPrefix(entity, "LFD").expect(204);
    await issue(entity);
    const second = toInvoiceCreate(invoiceOf(entity, InvoiceNumber.compose("LFD", 2026, 2)));

    await expect(
      ctx.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "invoice_number_counter" SET "last_rank" = "last_rank" + 1 WHERE "legal_entity_id" = ${entity}`;
        await tx.invoice.create({ data: { ...second, number: "FA-2026-000002" } });
      }),
    ).rejects.toThrow(/invoice_number_shape/u);
  });
});

describe("la base lie le rang au compteur", () => {
  it("refuse une pièce sous un rang que le compteur n'a pas atteint", async () => {
    const entity = await declareEntity();
    await setPrefix(entity, "LFD").expect(204);
    await issue(entity);

    await expect(
      ctx.prisma.invoice.create({
        data: toInvoiceCreate(invoiceOf(entity, InvoiceNumber.compose("LFD", 2026, 5))),
      }),
    ).rejects.toThrow(/invoice_rank_from_counter/u);
  });

  it("refuse une pièce sans compteur ouvert pour son année", async () => {
    const entity = await declareEntity();
    await setPrefix(entity, "LFD").expect(204);

    await expect(
      ctx.prisma.invoice.create({
        data: toInvoiceCreate(invoiceOf(entity, InvoiceNumber.compose("LFD", 2026, 1))),
      }),
    ).rejects.toThrow(/invoice_rank_from_counter/u);
  });

  /** Le trou que le code seul tenait : un rang pris, validé, sans pièce. */
  it("refuse de valider un compteur avancé sans sa pièce", async () => {
    const entity = await declareEntity();
    await setPrefix(entity, "LFD").expect(204);
    await issue(entity);

    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "invoice_number_counter" SET "last_rank" = "last_rank" + 1 WHERE "legal_entity_id" = ${entity}`,
    ).rejects.toThrow(/invoice_number_counter_has_invoice/u);

    const counter = await ctx.prisma.invoiceNumberCounter.findMany({
      where: { legalEntityId: entity },
      select: { lastRank: true },
    });
    expect(counter).toEqual([{ lastRank: 1 }]);
    await issue(entity);
    expect(
      (
        await ctx.prisma.invoice.findMany({
          where: { legalEntityId: entity },
          orderBy: { rank: "asc" },
        })
      ).map((invoice) => invoice.number),
    ).toEqual(["FA-LFD-2026-000001", "FA-LFD-2026-000002"]);
  });
});
