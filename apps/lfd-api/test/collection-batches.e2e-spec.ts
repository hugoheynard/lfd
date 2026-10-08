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

import { CollectionCandidatesReader } from "../src/b2b/accounting/domain/ports/collection-candidates.reader.js";
import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import {
  collectionDayOf,
  depositDeadlineOf,
} from "../src/b2b/accounting/domain/services/collection-calendar.js";
import { simulateInvoiceDossier } from "../src/b2b/accounting/domain/services/invoice-dossier.js";
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

/** Ce qu'un bon fige : UNE ligne à 5,5 %, et sa TVA ventilée. `null` = aucune ligne. */
interface BonSpec {
  readonly unitPriceMillicents: number;
  readonly lineTotalCents: number;
  readonly vatCents: number;
}

/** 100 € HT, 5,50 € de TVA : un bon facturable, sans écart d'arrondi. */
const PLAIN_BON: BonSpec = {
  unitPriceMillicents: 10_000_000,
  lineTotalCents: 10_000,
  vatCents: 550,
};
/** 10,5 c HT : le bon arrondit à 11 c, la facture de deux bons à 21 c (F2). */
const HALF_CENT_BON: BonSpec = { unitPriceMillicents: 10_500, lineTotalCents: 11, vatCents: 1 };

/**
 * Une commande passée au compte, `daysBefore` jours avant la clôture.
 *
 * Elle porte une ligne figée cohérente avec son total : depuis F2, un bon dont
 * le total ne se recompose pas est écarté `unbillable` — un bon sans ligne en
 * serait un (`null` le demande, pour la lecture brute de F1).
 */
async function orderOf(
  companyId: string,
  daysBefore = 2,
  bon: BonSpec | null = PLAIN_BON,
): Promise<{ id: string; orderNumber: string }> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `lot-${String(seq)}` });
  const spec = bon ?? PLAIN_BON;
  return ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-LOT-${String(seq)}`,
      companyId,
      placedByUserId: user.id,
      subtotalCents: spec.lineTotalCents,
      totalCents: spec.lineTotalCents + spec.vatCents,
      vatCents: spec.vatCents,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - daysBefore * DAY_MS),
      ...(bon === null
        ? {}
        : {
            vatShares: [{ rate: 5.5, amountCents: bon.vatCents }],
            lines: {
              create: {
                sku: "PAIN-LOT",
                productNameSnapshot: "Pain du lot",
                unitPriceMillicents: bon.unitPriceMillicents,
                vatRate: 5.5,
                quantity: 1,
                lineTotalCents: bon.lineTotalCents,
              },
            },
          }),
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

describe("les bons que la constitution lit (F1)", () => {
  it("portent leurs lignes figées et le taux de surtaxe, en une lecture", async () => {
    const companyId = await client("Boulangerie figée");
    const placed = await orderOf(companyId, 2, null);
    await ctx.prisma.order.update({
      where: { id: placed.id },
      data: {
        lateFeeCents: 200,
        lateFeeAdjustment: { adjustment: { mode: "amount", cents: 200 }, vatRatePercent: 5.5 },
        vatShares: [{ rate: 5.5, amountCents: 550 }],
        lines: {
          create: {
            sku: "PAIN-E2E",
            productNameSnapshot: "Pain e2e",
            unitPriceMillicents: 980_000,
            vatRate: 5.5,
            quantity: 1,
            lineTotalCents: 9_800,
          },
        },
      },
    });
    const reader = ctx.app.get(CollectionCandidatesReader);
    const floor = await reader.floor();

    const orders = await reader.collectableOrders(floor ?? closesAt, closesAt);

    expect(orders).toHaveLength(1);
    expect(orders[0]?.frozen).toMatchObject({
      reference: placed.orderNumber,
      lateFeeCents: 200,
      lateFeeVatRate: 5.5,
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      totalCents: 10_550,
      lines: [
        {
          sku: "PAIN-E2E",
          unitPriceMillicents: 980_000,
          vatRate: "5.5",
          quantity: 1,
          lineTotalCents: 9_800,
        },
      ],
    });
  });
});

describe("le lot figé", () => {
  /**
   * PA1 (plan `plan-prelevement-automatique.md`) : l'échéance du calendrier
   * est FIGÉE sur le lot, et le fichier stocké porte la même. Attendue
   * calculée par le domaine depuis la clôture courante — aucune date écrite.
   */
  it("fige l'échéance du calendrier (N réglé, report TARGET2) et le XML porte la même", async () => {
    const entity = await collectingEntity();
    await staff()
      .put(`/admin/accounting/legal-entities/${entity}/collection-schedule`)
      .send({
        delayHours: 1,
        daysAfterClosure: 20,
        depositCutoff: { businessDaysBefore: 2, time: "16:00" },
      })
      .expect(204);
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    const expectedDay = collectionDayOf(closesAt, 14, 20);

    const [batchId] = await constitute(entity);

    const [batch] = (await cycle(entity)).batches;
    expect(batch?.requestedCollectionDay).toBe(expectedDay);
    expect(batch?.depositDeadline).toEqual(
      depositDeadlineOf(expectedDay, { businessDaysBefore: 2, time: "16:00" }),
    );
    const file = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    expect(file.text).toContain(`<ReqdColltnDt>${expectedDay}</ReqdColltnDt>`);
  });

  it("un réglage changé APRÈS la constitution ne touche pas l'échéance du lot", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    await constitute(entity);

    await staff()
      .put(`/admin/accounting/legal-entities/${entity}/collection-schedule`)
      .send({ delayHours: 1, daysAfterClosure: 30, depositCutoff: null })
      .expect(204);

    const [batch] = (await cycle(entity)).batches;
    expect(batch?.requestedCollectionDay).toBe(collectionDayOf(closesAt, 14, null));
    expect(batch?.depositDeadline).toBeNull();
  });

  it("un lot d'avant le calendrier garde une échéance nulle — jamais inventée", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);
    const [batchId] = await constitute(entity);
    await ctx.prisma.collectionBatch.update({
      where: { id: batchId ?? "" },
      data: { requestedCollectionDay: null },
    });

    const [batch] = (await cycle(entity)).batches;
    expect(batch?.requestedCollectionDay).toBeNull();
  });

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

describe("le prélèvement suit la facture (F2)", () => {
  function ctrlSumOf(xml: string): string {
    return /<CtrlSum>([^<]*)</u.exec(xml)?.[1] ?? "";
  }

  it("une ligne prélève le total de la facture de SES bons ; Σ lignes = CtrlSum ; Σ bons écrit", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const quai = await client("Café du Quai");
    await mandated(entity, port);
    await mandated(entity, quai);
    await orderOf(port, 2, HALF_CENT_BON);
    await orderOf(port, 3, HALF_CENT_BON);
    await orderOf(quai);
    const reader = ctx.app.get(CollectionCandidatesReader);
    const read = await reader.collectableOrders((await reader.floor()) ?? closesAt, closesAt);
    const expectedOf = (companyId: string): number =>
      simulateInvoiceDossier(read.filter((o) => o.companyId === companyId).map((o) => o.frozen))
        .invoice.totalCents;

    const [batchId] = await constitute(entity);

    const lines = await ctx.prisma.collectionBatchLine.findMany({
      where: { batchId: batchId ?? "" },
    });
    const byDebtor = new Map(lines.map((line) => [line.debtorCompanyId, line]));
    expect(byDebtor.get(port)).toMatchObject({
      amountCents: expectedOf(port),
      ordersTotalCents: 24,
    });
    expect(expectedOf(port)).toBe(22);
    expect(byDebtor.get(quai)).toMatchObject({
      amountCents: expectedOf(quai),
      ordersTotalCents: 10_550,
    });
    const total = lines.reduce((sum, line) => sum + line.amountCents, 0);
    const xml = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    expect(ctrlSumOf(xml.text)).toBe((total / 100).toFixed(2));
    const view = await cycle(entity);
    expect(view.batches[0]?.totalCents).toBe(total);
    const csv = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/audit.csv`)
      .expect(200);
    expect(csv.text).toContain('"Σ bons (€)";"Écart (€)"');
    expect(csv.text).toContain("0,22;0,24;-0,02");
  });

  it("un bon incohérent est écarté `unbillable`, les autres partent", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    const quai = await client("Café du Quai");
    await mandated(entity, port);
    await mandated(entity, quai);
    const sound = await orderOf(port);
    const broken = await orderOf(port, 3);
    await ctx.prisma.order.update({ where: { id: broken.id }, data: { totalCents: 10_549 } });
    const other = await orderOf(quai);

    await constitute(entity);

    expect((await cycle(entity)).exclusions).toMatchObject([
      { orderNumber: broken.orderNumber, reason: "unbillable" },
    ]);
    expect(await stateOf(broken.id)).toBe("excluded");
    expect(await stateOf(sound.id)).toBe("batched");
    expect(await stateOf(other.id)).toBe("batched");
  });

  /**
   * Régression (2026-10-08) : un plancher posé APRÈS la clôture du cycle
   * constitué faisait répondre « aucune commande à prélever ».
   */
  it("plancher après la clôture : 409 `not_yet_open`, pas « aucune commande »", async () => {
    const entity = await collectingEntity();
    await ctx.prisma.collectionFloor.update({
      where: { id: true },
      data: { floorAt: new Date(closesAt.getTime() + DAY_MS) },
    });
    const response = await staff()
      .post(`${BASE}/batches`)
      .send({ legalEntityId: entity })
      .expect(409);
    expect(JSON.stringify(response.body)).toContain("accounting.collection.not_yet_open");
  });
});
