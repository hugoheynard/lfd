import { randomUUID } from "node:crypto";
/**
 * E2E des **portes de la Supervision** — `documentation/order/plan-supervision-du-jour.md`,
 * §3, §4 et lot 1.
 *
 * Trois lectures des postes (fiche d'atelier, colisage, file du comptoir)
 * rouvertes sous `b2b_supervision`, plus `supervision/day`. Ce qui ne se prouve
 * qu'ici :
 *
 * - **le droit seul suffit** : une personne qui n'a QUE `b2b_supervision:read`
 *   lit les quatre routes, et se voit toujours refuser les trois postes ;
 * - **c'est la même lecture** : sur les mêmes données, la route de supervision
 *   rend exactement ce que rend le poste — une seconde porte, pas une copie ;
 * - **le jour par défaut est celui du serveur**, quand `supervision/day` n'en
 *   reçoit pas.
 *
 * ⚠️ Le droit est posé par une DÉROGATION sur `communication` (ni
 * `b2b_orders`, ni `b2b_supervision`), et non par un rôle composé : le
 * résolveur d'accès lit encore le catalogue de rôles du contrat, pas
 * `staff_role_definitions` (vérifié le 2026-09-25, `prisma-staff-access.resolver.ts`).
 */
import {
  instantToLocal,
  type DaySupervisionView,
  type HandoverQueueView,
  type ProductionPackingView,
  type ProductionWorksheetView,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { settleCardPayments } from "./card-payments.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

const MEMBER = "auth0|member";
const SUPERVISOR = "staff-supervision-seule";
const WITHOUT_RIGHT = "staff-sans-supervision";
const SERVICE_DAY = serviceDay();

/** Le croissant du catalogue de test — `VIE-001`. */
const CROISSANT = "VIE-001";
/** La baguette — laissée au four, pour qu'une ligne attende. */
const BAGUETTE = "PAI-001";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let intentCount = 0;
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_sup_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

/** Les trois lectures : la porte de la Supervision, et celle du poste qu'elle rejoue. */
const PAIRS = [
  {
    column: "préparation",
    supervision: `/admin/supervision/preparation?date=${SERVICE_DAY}`,
    station: `/admin/production/worksheet?date=${SERVICE_DAY}`,
  },
  {
    column: "colisage",
    supervision: `/admin/supervision/packing?date=${SERVICE_DAY}`,
    station: `/admin/production/packing?date=${SERVICE_DAY}`,
  },
  {
    column: "retrait",
    supervision: `/admin/supervision/handover?jour=${SERVICE_DAY}`,
    station: `/admin/handover/file?jour=${SERVICE_DAY}`,
  },
] as const;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** Une fiche `communication` — ni commandes, ni supervision par son rôle. */
async function communicationStaff(sub: string): Promise<string> {
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "communication",
      status: "active",
      auth0Id: sub,
    },
  });
  return row.id;
}

/** La même fiche, à qui l'on ouvre la Supervision en lecture — et rien d'autre. */
async function supervisorOnly(): Promise<void> {
  const staffUserId = await communicationStaff(SUPERVISOR);
  await ctx.prisma.staffPermissionOverride.create({
    data: { staffUserId, resource: "b2b_supervision", action: "read", effect: "allow" },
  });
}

/** Une commande de retrait du jour servi, payée. */
async function place(lines: readonly { sku: string; quantity: number }[]): Promise<void> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const id =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: id,
      note: "",
      lines,
    })
    .expect(201);
  await settleCardPayments(ctx, issuedIntents);
}

/**
 * Une journée qui a du relief dans les trois colonnes : arrêtée, une ligne
 * sortie du four et une qui attend, un article au bac.
 */
async function seedWorkedDay(): Promise<void> {
  await place([
    { sku: CROISSANT, quantity: 12 },
    { sku: BAGUETTE, quantity: 4 },
  ]);
  const staff = ctx.asSub(E2E_STAFF_SUB);
  await staff.post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);
  await staff
    .put(`/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}/done`)
    .send({ initials: "KA" })
    .expect(204);
  const packing = jsonBody<ProductionPackingView>(
    await staff.get(`/admin/production/packing?date=${SERVICE_DAY}`).expect(200),
  );
  const reference = packing.sheets[0]?.reference;
  if (reference === undefined) {
    throw new Error(`La journée du ${SERVICE_DAY} n'a produit aucun bac à coliser.`);
  }
  await staff
    .put(`/admin/production/packing/${SERVICE_DAY}/sheets/${reference}/lines/${CROISSANT}`)
    .send({ initials: "MB" })
    .expect(204);
}

describe("le droit b2b_supervision, seul", () => {
  it("ouvre les quatre lectures de la Supervision", async () => {
    await supervisorOnly();
    const agent = ctx.asSub(SUPERVISOR);

    for (const { supervision } of PAIRS) {
      await agent.get(supervision).expect(200);
    }
    await agent.get(`/admin/supervision/day?date=${SERVICE_DAY}`).expect(200);
  });

  it("n'ouvre AUCUN des trois postes qu'elle rejoue", async () => {
    await supervisorOnly();
    const agent = ctx.asSub(SUPERVISOR);

    for (const { station } of PAIRS) {
      await agent.get(station).expect(403);
    }
  });
});

describe("sans le droit", () => {
  it("refuse les quatre lectures (403)", async () => {
    await communicationStaff(WITHOUT_RIGHT);
    const agent = ctx.asSub(WITHOUT_RIGHT);

    for (const { supervision } of PAIRS) {
      await agent.get(supervision).expect(403);
    }
    await agent.get(`/admin/supervision/day?date=${SERVICE_DAY}`).expect(403);
  });
});

describe("la même lecture que le poste", () => {
  it.each(PAIRS)("la colonne $column rend exactement ce que rend le poste", async (pair) => {
    await supervisorOnly();
    await seedWorkedDay();

    const station: unknown = (await ctx.asSub(E2E_STAFF_SUB).get(pair.station).expect(200)).body;
    const supervision: unknown = (await ctx.asSub(SUPERVISOR).get(pair.supervision).expect(200))
      .body;

    expect(supervision).toEqual(station);
  });

  it("les données semées ont bien du relief — une égalité entre deux vides ne prouverait rien", async () => {
    await supervisorOnly();
    await seedWorkedDay();
    const agent = ctx.asSub(SUPERVISOR);

    const worksheet = jsonBody<ProductionWorksheetView>(
      await agent.get(PAIRS[0].supervision).expect(200),
    );
    const packing = jsonBody<ProductionPackingView>(
      await agent.get(PAIRS[1].supervision).expect(200),
    );
    const queue = jsonBody<HandoverQueueView>(await agent.get(PAIRS[2].supervision).expect(200));

    expect(worksheet.generatedAt).not.toBeNull();
    expect(packing.sheets).toHaveLength(1);
    expect(queue.entries).toHaveLength(1);
  });
});

describe("la forme du jour", () => {
  it.each(PAIRS)("la colonne $column refuse un jour mal formé (400)", async (pair) => {
    await supervisorOnly();
    const malformed = pair.supervision.replace(SERVICE_DAY, "03-10-2026");

    await ctx.asSub(SUPERVISOR).get(malformed).expect(400);
  });
});

describe("supervision/day sans date", () => {
  it("rend le jour courant du serveur, à l'heure de Paris", async () => {
    await supervisorOnly();

    // Lu avant et après : un passage de minuit pendant l'appel ne rougit pas.
    const before = instantToLocal(new Date()).day;
    const view = jsonBody<DaySupervisionView>(
      await ctx.asSub(SUPERVISOR).get(`/admin/supervision/day`).expect(200),
    );
    const after = instantToLocal(new Date()).day;

    expect([before, after]).toContain(view.date);
  });
});
