/**
 * E2E — **la conversion des colonnes du planificateur** par la vraie route
 * machine (`documentation/commandes/planificateur/plan-planificateur-de-commandes.md`,
 * lot L2, § 4 et § 5).
 *
 * L'horloge est doublée, et chaque instant se dit relativement au jour servi
 * (trois jours devant aujourd'hui) : la règle générale ferme la veille à
 * midi, la colonne se commande donc la veille à 11 h 45 (Paris).
 *
 * Ce que seul le vrai Postgres prouve : la commande porte sa provenance, et
 * une colonne ne donne qu'une commande (`orders_one_per_planned_column`) ;
 * l'issue s'écrit sur la colonne, et la cloche sonne une fois.
 */
import {
  WORKSPACE_HEADER,
  localToInstant,
  type PlannedColumnOpened,
  type PlannedRoutingPayload,
} from "@lfd/contracts";

import type { PlannerSweepReport } from "../src/recurring/planned/application/commands/sweep-planned-columns.command.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { pickupSite } from "./order-factory.js";
import { publishSalesTerms } from "./recurring-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const BUYER = "auth0|planner-conversion";
/** Le jour servi : trois jours devant, pour que la veille et l'avant-veille soient à venir. */
const DAY = serviceDay(3);
const clock = new FixedClock(new Date());

let ctx: E2eContext;
let companyId = "";
let pickupId = "";

/** Un instant de Paris, `days` jours avant le jour servi. */
function beforeDay(days: number, time: string): Date {
  const day = new Date(`${DAY}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() - days);
  const instant = localToInstant(day.toISOString().slice(0, 10), time);
  if (instant === null) {
    throw new TypeError(`${time} n'existe pas à Paris ce jour-là`);
  }
  return instant;
}

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: Clock, value: clock }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(new Date());
  await publishSalesTerms(ctx);
  pickupId = await pickupSite(ctx.prisma);
  companyId = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { grantedTerms: ["monthly"] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, buyer.id, companyId, CustomerRole.owner);
  // La règle générale : la veille à midi.
  await ctx.prisma.orderCutoff.create({
    data: { pickupAddressId: null, weekday: null, daysBefore: 1, time: "12:00", graceMinutes: 0 },
  });
});

const routing = (start = "07:00", end = "08:00"): PlannedRoutingPayload => ({
  method: "pickup",
  deliveryAddress: null,
  pickupAddressId: pickupId,
  window: { start, end },
});

/** Ouvre une colonne et, si des SKU sont donnés, y pose six de chacun. */
async function column(skus: readonly string[], window = routing()): Promise<string> {
  const opened = await ctx
    .asSub(BUYER)
    .post("/planner/columns")
    .set(WORKSPACE_HEADER, companyId)
    .set(INTENT_KEY, freshIntent())
    .send({ day: DAY, routing: window })
    .expect(200);
  const { id, version } = jsonBody<PlannedColumnOpened>(opened);
  if (skus.length > 0) {
    await put(id, version, skus, window).expect(200);
  }
  return id;
}

function put(id: string, version: number, skus: readonly string[], window = routing()) {
  return ctx
    .asSub(BUYER)
    .put(`/planner/columns/${id}`)
    .set(WORKSPACE_HEADER, companyId)
    .send({ version, routing: window, lines: skus.map((sku) => ({ sku, quantity: 6 })) });
}

async function sweep(): Promise<PlannerSweepReport> {
  const response = await ctx
    .http()
    .post("/admin/planner/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return jsonBody<PlannerSweepReport>(response);
}

const stored = (id: string) => ctx.prisma.plannedColumn.findUniqueOrThrow({ where: { id } });

/** La boîte d'envoi relayée comme le cron du Worker, puis le travail de fond vidé. */
async function relayOutbox(): Promise<void> {
  await ctx
    .http()
    .post("/admin/outbox/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
}

describe("planner — la conversion", () => {
  it("se commande quinze minutes avant la fermeture, une seule fois, avec sa provenance", async () => {
    const id = await column(["VIE-001-1"]);
    expect((await stored(id)).convertsAt).toEqual(
      new Date(beforeDay(1, "12:00").getTime() - 15 * 60_000),
    );

    clock.set(beforeDay(1, "11:30"));
    expect(await sweep()).toMatchObject({ due: 1, placed: 0 });

    clock.set(beforeDay(1, "11:50"));
    expect(await sweep()).toMatchObject({ due: 1, placed: 1 });
    const orders = await ctx.prisma.order.findMany({ where: { fromPlannedColumnId: id } });
    expect(orders).toHaveLength(1);
    expect(await stored(id)).toMatchObject({ status: "placed", orderId: orders[0]?.id });

    expect(await sweep()).toMatchObject({ due: 0, placed: 0 });
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it("refuse l'écriture du client une fois l'instant atteint (409)", async () => {
    const id = await column(["VIE-001-1"]);
    clock.set(beforeDay(1, "11:46"));
    await put(id, 2, ["VIE-001-1", "PAI-001-1"]).expect(409);
  });

  it("un article qui ferme plus tôt avance la conversion de toute la colonne", async () => {
    await ctx.prisma.catalogItem.update({
      where: { sku: "PAI-001-1" },
      data: {
        orderLimitDaysBefore: 2,
        orderLimitTime: "12:00",
        orderLimitGraceMinutes: 0,
        orderLimitStaffMayExceed: false,
      },
    });
    const id = await column(["VIE-001-1", "PAI-001-1"]);
    expect((await stored(id)).convertsAt).toEqual(
      new Date(beforeDay(2, "12:00").getTime() - 15 * 60_000),
    );

    clock.set(beforeDay(2, "11:50"));
    expect(await sweep()).toMatchObject({ placed: 1 });
    expect(await ctx.prisma.order.count({ where: { fromPlannedColumnId: id } })).toBe(1);
  });

  it("deux créneaux le même jour font deux commandes", async () => {
    const morning = await column(["VIE-001-1"], routing("07:00", "08:00"));
    const noon = await column(["VIE-001-1"], routing("11:00", "12:00"));
    clock.set(beforeDay(1, "11:50"));
    expect(await sweep()).toMatchObject({ placed: 2 });
    for (const id of [morning, noon]) {
      expect(await ctx.prisma.order.count({ where: { fromPlannedColumnId: id } })).toBe(1);
    }
  });

  it("une colonne vide n'est ni commandée, ni alertée : elle reste brouillon", async () => {
    const id = await column([]);
    clock.set(beforeDay(1, "11:50"));
    expect(await sweep()).toMatchObject({ due: 0, placed: 0, refused: 0, missed: 0 });
    expect((await stored(id)).status).toBe("draft");
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("planner — les colonnes non passées", () => {
  it("l'acheteur parti : refus définitif, et la cloche sonne une fois", async () => {
    const id = await column(["VIE-001-1"]);
    await ctx.prisma.membership.deleteMany({ where: { companyId } });
    clock.set(beforeDay(1, "11:50"));

    expect(await sweep()).toMatchObject({ refused: 1 });
    expect(await stored(id)).toMatchObject({ status: "refused", refusalCause: "buyer_left" });
    expect(await ctx.prisma.order.count()).toBe(0);

    await relayOutbox();
    await relayOutbox();
    expect(
      await ctx.prisma.staffNotification.findMany({
        where: { kind: "recurring.planned_column_refused" },
        select: { audience: true, link: true },
      }),
    ).toEqual([{ audience: "b2b_subscriptions:read", link: `/comptes-clients/${companyId}` }]);
    expect(await sweep()).toMatchObject({ due: 0 });
  });

  it("une société sans crédit : refus nommé, aucune commande", async () => {
    const id = await column(["VIE-001-1"]);
    await ctx.prisma.company.update({ where: { id: companyId }, data: { grantedTerms: [] } });
    clock.set(beforeDay(1, "11:50"));

    expect(await sweep()).toMatchObject({ refused: 1, placed: 0 });
    expect(await stored(id)).toMatchObject({ status: "refused", refusalCause: "no_settlement" });
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("la fermeture passée sans balayage : manquée, jamais rattrapée", async () => {
    const id = await column(["VIE-001-1"]);
    clock.set(beforeDay(1, "12:05"));

    expect(await sweep()).toMatchObject({ missed: 1, placed: 0 });
    expect((await stored(id)).status).toBe("missed");
    expect(await ctx.prisma.order.count()).toBe(0);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "recurring.planned_column_missed" } }),
    ).toBe(1);
  });
});
