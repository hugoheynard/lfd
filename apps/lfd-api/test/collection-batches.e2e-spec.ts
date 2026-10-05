/**
 * E2E du **lot de prélèvement figé** (plan
 * `documentation/comptabilite/plan-lot-de-prelevement-fige.md`, P1 et P2).
 *
 * Ce que seul le vrai SQL prouve : le fichier STOCKÉ rend les mêmes octets,
 * un lot reconstitué change de `MsgId`, l'index partiel tient un lot vivant par
 * cycle, la course avec la passation laisse la commande tardive `due`, et la
 * relecture du dépôt voit un mandat révoqué en base.
 *
 * ⚠️ Commandes, mandats et suivis écrits par Prisma : même dette que
 * `accounting-legal-entity.e2e-spec.ts`. Le plancher est rejoué à chaque
 * remise à zéro — la migration le pose, le `TRUNCATE` l'emporte.
 *
 * Aucune date absolue : la clôture est le dernier 1er du mois atteint, calculé
 * par le domaine depuis l'instant présent ; les commandes tombent deux jours
 * avant, le plancher trente jours avant.
 */
import type { CollectionCycleView, ConstitutedBatchesView } from "@lfd/contracts";

import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";

const SIREN = "552100554";
const ICS = "FR72ZZZ123456";
const ACCOUNT = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Crazeativity",
  line1: "Route de la Balme",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
const DEBTOR_RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
const DAY_MS = 24 * 60 * 60 * 1000;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;
let seq = 0;
/** La dernière clôture calendaire atteinte — le cycle qu'on constitue. */
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  closesAt = cycleToConstitute(new Date(daysAgo(0)), null).closesAt;
  await ctx.prisma.collectionFloor.create({
    data: { id: true, floorAt: new Date(closesAt.getTime() - 30 * DAY_MS) },
  });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

const BASE = "/admin/accounting/collection";

async function collectingEntity(): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: SIREN,
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR89552100554",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics: ICS })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send(ACCOUNT)
    .expect(204);
  return id;
}

async function client(name: string, parentId?: string): Promise<string> {
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  if (parentId !== undefined) {
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { parentCompanyId: parentId },
    });
  }
  return company.id;
}

/** Un mandat actif B2B de cette société chez l'entité, avec son RIB. */
async function mandated(entityId: string, companyId: string): Promise<string> {
  seq += 1;
  await staff().put(`/admin/companies/${companyId}/bank-account`).send(DEBTOR_RIB).expect(204);
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId,
      creditorId: entityId,
      reference: `RUM-LOT-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return mandate.id;
}

/** Une commande passée au compte, `daysBefore` jours avant la clôture. */
async function orderOf(
  companyId: string,
  daysBefore = 2,
): Promise<{ id: string; orderNumber: string }> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `lot-${String(seq)}` });
  return ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-LOT-${String(seq)}`,
      companyId,
      placedByUserId: user.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - daysBefore * DAY_MS),
    },
    select: { id: true, orderNumber: true },
  });
}

async function constitute(entityId: string, expected = 201): Promise<readonly string[]> {
  const response = await staff()
    .post(`${BASE}/batches`)
    .send({ legalEntityId: entityId })
    .expect(expected);
  return expected === 201 ? jsonBody<ConstitutedBatchesView>(response).batchIds : [];
}

async function cycle(entityId: string): Promise<CollectionCycleView> {
  return jsonBody<CollectionCycleView>(
    await staff().get(`${BASE}/cycle?legalEntityId=${entityId}`).expect(200),
  );
}

function messageIdOf(xml: string): string {
  return /<MsgId>([^<]*)</u.exec(xml)?.[1] ?? "";
}

async function stateOf(orderId: string): Promise<string> {
  const row = await ctx.prisma.orderCollection.findUnique({ where: { orderId } });
  return row?.state ?? "absent";
}

describe("le lot figé", () => {
  it("rend deux fois les MÊMES octets, sous les identifiants du lot", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);

    const [batchId] = await constitute(entity);
    const first = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    const second = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);

    expect(second.text).toBe(first.text);
    expect(messageIdOf(first.text)).toBe(batchId);
    expect(first.text).toContain(`<EndToEndId>${batchId ?? ""}-0001</EndToEndId>`);
    expect(first.headers["content-disposition"]).not.toContain("BROUILLON");
    const csv = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/audit.csv`)
      .expect(200);
    expect(csv.text).toContain("CMD-LOT-");
  });

  it("annuler puis reconstituer change le MsgId, et la commande revient", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    const placed = await orderOf(port);

    const [first] = await constitute(entity);
    const before = await staff()
      .get(`${BASE}/batches/${first ?? ""}/file.xml`)
      .expect(200);
    await staff()
      .post(`${BASE}/batches/${first ?? ""}/cancel`)
      .expect(204);
    expect(await stateOf(placed.id)).toBe("due");
    const [second] = await constitute(entity);
    const after = await staff()
      .get(`${BASE}/batches/${second ?? ""}/file.xml`)
      .expect(200);

    expect(messageIdOf(after.text)).not.toBe(messageIdOf(before.text));
    expect(await stateOf(placed.id)).toBe("batched");
  });

  it("une société sans mandat rend le lot NON déposable (Q2), et l'exclusion est reprise au lot suivant", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    const orphan = await client("Chalet Sans Mandat");
    const unpaid = await orderOf(orphan);

    const [batchId] = await constitute(entity);
    const view = await cycle(entity);
    expect(view.batches[0]).toMatchObject({
      depositable: false,
      unmandatedCompanies: ["Chalet Sans Mandat"],
    });
    expect(view.exclusions).toMatchObject([
      { orderNumber: unpaid.orderNumber, reason: "no_mandate" },
    ]);
    const file = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    expect(file.headers["content-disposition"]).toContain("BROUILLON");
    await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(409);

    await mandated(entity, orphan);
    await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/cancel`)
      .expect(204);
    await constitute(entity);

    expect(await stateOf(unpaid.id)).toBe("batched");
    expect((await cycle(entity)).exclusions).toEqual([]);
  });

  it("refuse le dépôt d'un lot dont un mandat a été révoqué depuis la constitution", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const mandateId = await mandated(entity, port);
    await orderOf(port);
    const [batchId] = await constitute(entity);

    await ctx.prisma.paymentMandate.update({
      where: { id: mandateId },
      data: { status: "revoked" },
    });
    const refused = await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(409);

    expect(refused.text).toContain("Boulangerie du Port");
  });

  it("déposé : les commandes passent prélevées, et ne se règlent plus autrement", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    const placed = await orderOf(port);
    const [batchId] = await constitute(entity);

    await staff()
      .post(`${BASE}/batches/${batchId ?? ""}/deposit`)
      .expect(204);

    expect(await stateOf(placed.id)).toBe("collected");
    await staff()
      .post(`${BASE}/orders/${placed.id}/settle-otherwise`)
      .send({ note: "virement" })
      .expect(409);
  });

  it("la commande validée APRÈS la constitution, même datée avant la clôture, attend le lot suivant", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    await constitute(entity);

    const late = await orderOf(port, 1);
    await constitute(entity, 409);

    expect(await stateOf(late.id)).toBe("absent");
  });

  it("un sous-compte détaché depuis sa commande est écarté `payer_detached`", async () => {
    const entity = await collectingEntity();
    const principal = await client("Club Principal");
    await mandated(entity, principal);
    const chalet = await client("Chalet Détaché", principal);
    await ctx.prisma.companyFollow.create({
      data: {
        companyId: chalet,
        parentId: principal,
        aspect: "billing",
        validFrom: new Date(closesAt.getTime() - 20 * DAY_MS),
        validTo: new Date(Date.parse(daysAgo(0)) - 60 * 60 * 1000),
      },
    });
    const placed = await orderOf(chalet);

    await constitute(entity);

    expect((await cycle(entity)).exclusions).toMatchObject([
      { orderNumber: placed.orderNumber, reason: "payer_detached" },
    ]);
    await staff()
      .post(`${BASE}/orders/${placed.id}/settle-otherwise`)
      .send({ note: "chèque" })
      .expect(204);
    expect(await stateOf(placed.id)).toBe("settled_otherwise");
  });
});
