import { randomUUID } from "node:crypto";
/**
 * E2E de **la version par journée** — `documentation/caching-usage/plan-version-par-journee.md`,
 * lots V1 et V2, sur le vrai Postgres jetable.
 *
 * Le cœur du lot V1 : chaque écrivain CONNU d'une journée fait avancer la
 * version du bon journal — le commerce (`public.day_change`) ou le fournil
 * (`production.day_change`). Aucun code applicatif ne l'avance : ce sont les
 * déclencheurs de la base (D1). Si un geste passe ici sans faire bouger la
 * version, un écran resterait figé sans le dire — c'est ce que cette suite
 * est là pour voir.
 *
 * La version se lit par les deux routes du lot V2, dont les droits sont
 * éprouvés à la fin.
 */
import type { DayVersionView } from "@lfd/contracts";

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

const MEMBER = "auth0|member-day-version";
const DAY = serviceDay();
const OTHER_DAY = serviceDay(8);
const CROISSANT = "VIE-001";
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
    const id = `pi_e2e_version_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

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
  issuedIntents.splice(0);
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

type Journal = "commerce" | "production";
const ROUTE: Readonly<Record<Journal, string>> = {
  commerce: "/admin/supervision/version",
  production: "/admin/production/version",
};

async function version(journal: Journal, day = DAY): Promise<number> {
  const view = jsonBody<DayVersionView>(
    await staff().get(`${ROUTE[journal]}?date=${day}`).expect(200),
  );
  expect(view.date).toBe(day);
  return view.version;
}

/**
 * Joue le geste et rend la version AVANT et APRÈS. On draine : un retrait ou
 * un colisage arrive au commerce par un abonné, hors de la requête.
 */
async function around(journal: Journal, gesture: () => Promise<unknown>) {
  const before = await version(journal);
  await gesture();
  await ctx.drain();
  return { before, after: await version(journal) };
}

type Lines = readonly { sku: string; quantity: number }[];

/** Passe une commande de retrait pour le jour ; `settle` règle sa carte. */
async function place(lines: Lines, settle = true, day = DAY): Promise<string> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const pickupAddressId =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        pickupAddressId,
        note: "",
        lines,
      })
      .expect(201),
  );
  if (settle) {
    await settleCardPayments(ctx, issuedIntents);
  }
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: placed.orderNumber },
    select: { id: true },
  });
  return row.id;
}

const close = () => staff().post(`/admin/production/batch/${DAY}/close`).expect(201);

async function planned(orderId: string) {
  return ctx.prisma.productionOrder.findFirstOrThrow({
    where: { serviceDay: DAY, orderId },
    select: { reference: true, lines: { select: { sku: true } } },
  });
}

const bake = (sku: string) =>
  staff()
    .put(`/admin/production/worksheet/${DAY}/lines/${sku}/done`)
    .send({ initials: "KA" })
    .expect(204);

/** Une commande du jour, arrêtée, sa ligne sortie du four : prête au colisage. */
async function readyToPack(): Promise<{ orderId: string; reference: string }> {
  const orderId = await place([{ sku: CROISSANT, quantity: 6 }]);
  await close();
  await bake(CROISSANT);
  return { orderId, reference: (await planned(orderId)).reference };
}

const packLine = (reference: string, sku: string) =>
  staff()
    .put(`/admin/production/packing/${DAY}/sheets/${reference}/lines/${sku}`)
    .send({ initials: "MB" })
    .expect(204);

const packed = (reference: string) =>
  staff().post(`/admin/production/batch/${DAY}/sheets/${reference}/packed`).expect(201);

describe("le journal du COMMERCE avance à chaque écriture de commande", () => {
  it("passer", async () => {
    const { before, after } = await around("commerce", () =>
      place([{ sku: CROISSANT, quantity: 2 }], false),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("payer", async () => {
    await place([{ sku: CROISSANT, quantity: 2 }], false);
    const { before, after } = await around("commerce", () =>
      settleCardPayments(ctx, issuedIntents),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("annuler (l'abandon du règlement)", async () => {
    const orderId = await place([{ sku: CROISSANT, quantity: 2 }], false);
    const { before, after } = await around("commerce", () =>
      ctx.asSub(MEMBER).post(`/orders/${orderId}/abandon`).expect(204),
    );
    expect(after).toBeGreaterThan(before);
    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    expect(row.status).toBe("cancelled");
  });

  it("retirer — par le statut de la commande, sans surveiller `order_handover`", async () => {
    const { orderId, reference } = await readyToPack();
    await packLine(reference, CROISSANT);
    await packed(reference);
    await ctx.drain();
    const { handoverToken } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { handoverToken: true },
    });

    const { before, after } = await around("commerce", () =>
      staff()
        .post(`/admin/handover/${handoverToken ?? ""}`)
        .expect(201),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("ne touche QUE la journée de la commande", async () => {
    const other = await version("commerce", OTHER_DAY);
    await place([{ sku: CROISSANT, quantity: 2 }]);
    expect(await version("commerce", OTHER_DAY)).toBe(other);
  });

  it("une commande déplacée fait bouger l'ancien ET le nouveau jour", async () => {
    const orderId = await place([{ sku: CROISSANT, quantity: 2 }]);
    const [day, other] = [await version("commerce"), await version("commerce", OTHER_DAY)];

    // Aucun geste de l'application ne déplace encore une commande : le
    // déclencheur est éprouvé directement, puisque c'est lui qui le garantit.
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { requestedDeliveryDate: new Date(`${OTHER_DAY}T00:00:00.000Z`) },
    });

    expect(await version("commerce")).toBeGreaterThan(day);
    expect(await version("commerce", OTHER_DAY)).toBeGreaterThan(other);
  });
});

describe("le journal du FOURNIL avance à chaque geste du fournil", () => {
  it("clôturer — une ligne par journée et par instruction, pas une par ligne insérée", async () => {
    await place([
      { sku: CROISSANT, quantity: 4 },
      { sku: BAGUETTE, quantity: 2 },
    ]);
    await place([
      { sku: CROISSANT, quantity: 3 },
      { sku: BAGUETTE, quantity: 1 },
    ]);
    await place([{ sku: CROISSANT, quantity: 5 }]);
    const journal = () => ctx.prisma.productionDayChange.count({ where: { serviceDay: DAY } });
    const traces = await journal();

    const { before, after } = await around("production", close);

    expect(after).toBeGreaterThan(before);
    const inserted =
      (await ctx.prisma.productionOrder.count({ where: { serviceDay: DAY } })) +
      (await ctx.prisma.productionOrderLine.count({ where: { order: { serviceDay: DAY } } })) +
      (await ctx.prisma.productionCount.count({ where: { serviceDay: DAY } }));
    // 3 commandes + 5 lignes + 2 comptes = 10 lignes insérées ; le journal en
    // reçoit bien moins, parce que le déclencheur est d'INSTRUCTION.
    expect(inserted).toBe(10);
    expect((await journal()) - traces).toBeLessThan(inserted);
  });

  it("cocher une ligne de la fiche d'atelier", async () => {
    await place([{ sku: CROISSANT, quantity: 6 }]);
    await close();
    const { before, after } = await around("production", () => bake(CROISSANT));
    expect(after).toBeGreaterThan(before);
  });

  it("cocher une ligne au bac", async () => {
    const { reference } = await readyToPack();
    const { before, after } = await around("production", () => packLine(reference, CROISSANT));
    expect(after).toBeGreaterThan(before);
  });

  it("poser un container", async () => {
    const { reference } = await readyToPack();
    const { before, after } = await around("production", () =>
      staff()
        .post(`/admin/production/packing/${DAY}/sheets/${reference}/containers/add`)
        .expect(204),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("fermer le sac — et le commerce l'apprend aussi (la commande passe prête)", async () => {
    const { reference } = await readyToPack();
    await packLine(reference, CROISSANT);
    const commerce = await version("commerce");
    const { before, after } = await around("production", () => packed(reference));
    expect(after).toBeGreaterThan(before);
    expect(await version("commerce")).toBeGreaterThan(commerce);
  });

  it("retirer à nouveau (le retirage)", async () => {
    await place([{ sku: CROISSANT, quantity: 6 }]);
    await close();
    await place([{ sku: BAGUETTE, quantity: 2 }]);
    const { before, after } = await around("production", () =>
      staff().post(`/admin/production/worksheet/${DAY}/retake`).expect(201),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("contrôler la qualité", async () => {
    await place([{ sku: CROISSANT, quantity: 6 }]);
    await close();
    const { before, after } = await around("production", () =>
      staff()
        .post(`/admin/supervision/quality/checks`)
        .send({
          id: `01JQV${randomUUID().replace(/-/gu, "").slice(0, 21).toUpperCase()}`,
          serviceDay: DAY,
          target: { kind: "line", sku: CROISSANT },
          verdict: "ok",
          note: null,
          uploadIds: [],
        })
        .expect(201),
    );
    expect(after).toBeGreaterThan(before);
  });
});

describe("les routes de version (V2)", () => {
  /** Une fiche `communication` : ni commandes, ni supervision par son rôle. */
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

  async function allowRead(sub: string, resource: "b2b_supervision" | "b2b_orders") {
    const staffUserId = await communicationStaff(sub);
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId, resource, action: "read", effect: "allow" },
    });
  }

  it("rendent zéro pour une journée que rien n'a touchée", async () => {
    expect(await version("commerce")).toBe(0);
    expect(await version("production")).toBe(0);
  });

  it("la version du commerce se lit sous `b2b_supervision:read`, pas celle du fournil", async () => {
    await allowRead("staff-version-supervision", "b2b_supervision");
    const supervisor = ctx.asSub("staff-version-supervision");
    await supervisor.get(`${ROUTE.commerce}?date=${DAY}`).expect(200);
    await supervisor.get(`${ROUTE.production}?date=${DAY}`).expect(403);
  });

  it("la version du fournil se lit aussi sous `b2b_supervision:read`, par la porte de la Supervision", async () => {
    await place([{ sku: CROISSANT, quantity: 2 }]);
    await close();
    await allowRead("staff-version-sup-fournil", "b2b_supervision");
    const supervisor = ctx.asSub("staff-version-sup-fournil");
    const view = jsonBody<DayVersionView>(
      await supervisor.get(`/admin/supervision/production-version?date=${DAY}`).expect(200),
    );
    expect(view).toEqual({ date: DAY, version: await version("production") });
    expect(view.version).toBeGreaterThan(0);
    await supervisor.get(`${ROUTE.production}?date=${DAY}`).expect(403);
  });

  it("la version du fournil se lit sous `b2b_orders:read`, pas celle du commerce", async () => {
    await allowRead("staff-version-fournil", "b2b_orders");
    const baker = ctx.asSub("staff-version-fournil");
    await baker.get(`${ROUTE.production}?date=${DAY}`).expect(200);
    await baker.get(`${ROUTE.commerce}?date=${DAY}`).expect(403);
  });

  it("le comptoir lit la version du commerce sous `b2b_orders:read`, la même que la Supervision", async () => {
    await place([{ sku: CROISSANT, quantity: 2 }]);
    await allowRead("staff-version-comptoir", "b2b_orders");
    const counter = ctx.asSub("staff-version-comptoir");
    const view = jsonBody<DayVersionView>(
      await counter.get(`/admin/orders/day-version?date=${DAY}`).expect(200),
    );
    expect(view).toEqual({ date: DAY, version: await version("commerce") });
    expect(view.version).toBeGreaterThan(0);
  });

  it("refusent une personne sans aucun des deux droits", async () => {
    await communicationStaff("staff-version-sans-droit");
    const nobody = ctx.asSub("staff-version-sans-droit");
    await nobody.get(`${ROUTE.commerce}?date=${DAY}`).expect(403);
    await nobody.get(`${ROUTE.production}?date=${DAY}`).expect(403);
    await nobody.get(`/admin/orders/day-version?date=${DAY}`).expect(403);
  });

  it("refusent une date absente ou mal formée", async () => {
    for (const route of Object.values(ROUTE)) {
      await staff().get(route).expect(400);
      await staff().get(`${route}?date=03/10/2026`).expect(400);
    }
  });
});
