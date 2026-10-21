/**
 * E2E du **réassort arrivé** (lot R3e de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md` — Hugo
 * 2026-10-21 : « un seul signal, deux gestes »).
 *
 * Ce qui ne s'éprouve qu'ici : le fait `delivery.transfer_received` par la
 * vraie boîte d'envoi jusqu'au réassort du Village, les colonnes et les
 * CHECK de l'arrivée, la cloche adressée au comptoir, « Monté » sous le droit
 * du fournil, et la réception qui ne l'attend pas.
 *
 * L'horloge est gelée la VEILLE de la journée servie (dans une semaine).
 */
import type { ResupplyProductionDayView, ResupplyReceiptView } from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  FixedRoad,
  receiveAtCounter,
  seedVillage,
  seedVillageOrder,
} from "./internal-transfer-scene.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { counterSent } from "./site-resupply-scene.js";

const EVE = addDays(SERVICE_DAY, -1);
const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    { token: RoadTravelTimeReader, value: new FixedRoad() },
    // Le jeton porteur EST le `sub` : le droit se prouve sur d'autres fiches.
    {
      token: AdminTokenVerifier,
      value: {
        verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
          Promise.resolve({ subject: token, scopes: [] }),
      },
    },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const eve = localToInstant(EVE, "12:00");
  if (eve === null) {
    throw new TypeError(`heure locale inexistante : ${EVE} 12:00`);
  }
  clock.set(eve);
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

/** Le Labo : servi sur place, de la feuille à la vitrine. */
async function seedLabo(): Promise<string> {
  const labo = await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
    },
    select: { id: true },
  });
  return labo.id;
}

function croissants(site: string, quantity: number): Promise<string> {
  return counterSent(ctx.asSub(STAFF), site, "tomorrow", [{ sku: CROISSANT, quantity }]);
}

async function holderOf(
  key: string,
  grants: readonly { resource: string; action: string }[],
): Promise<request.Agent> {
  await ctx.asSub(STAFF).post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

function mounted(agent: request.Agent, siteId: string, resupplyId: string) {
  return agent.post(`/admin/bakehouse-resupplies/sites/${siteId}/${resupplyId}/mounted`);
}

async function receptionOf(siteId: string, resupplyId: string) {
  const view = jsonBody<ResupplyReceiptView>(
    await ctx.asSub(STAFF).get(`/admin/resupply-receipts/${siteId}/${SERVICE_DAY}`).expect(200),
  );
  return view.receptions.find((reception) => reception.resupplyId === resupplyId);
}

async function bells() {
  return ctx.prisma.staffNotification.findMany({
    where: { kind: "resupply.arrived" },
    select: { subject: true, audience: true, idempotencyKey: true, link: true },
  });
}

describe("le réassort arrivé (R3e)", () => {
  it("Village : la réception du transfert le passe à arrivé, et la cloche sonne au comptoir", async () => {
    const village = await seedVillage(ctx);
    const orderId = await seedVillageOrder(ctx, SERVICE_DAY, village);
    const id = await croissants(village, 6);
    await closePlan(ctx);
    await settle();
    expect((await receptionOf(village, id))?.arrivedAt).toBeNull();

    await receiveAtCounter(ctx, orderId, "Venu par le personnel").expect(204);
    await settle();

    expect(await receptionOf(village, id)).toMatchObject({
      status: "expected",
      arrivedAt: clock.now().toISOString(),
    });
    expect(await bells()).toEqual([
      {
        subject: "Réassort arrivé — à réceptionner : Val Village",
        audience: "handover_counter:read",
        idempotencyKey: `notification:resupply.arrived:${id}`,
        link: "/comptoir/reassort",
      },
    ]);
    const tab = jsonBody<ResupplyProductionDayView>(
      await ctx.asSub(STAFF).get(`/admin/site-resupplies/to-produce/${SERVICE_DAY}`).expect(200),
    );
    expect(tab.transferSiteIds).toEqual([village]);
  });

  it("Labo : « Monté » le passe à arrivé ; un second ne change rien et ne sonne pas", async () => {
    const labo = await seedLabo();
    const id = await croissants(labo, 4);
    const bakehouse = await holderOf("r3e-fournil", [
      { resource: "production_resupply", action: "write" },
    ]);

    await mounted(bakehouse, labo, id).expect(204);
    const first = await ctx.prisma.siteResupply.findUniqueOrThrow({ where: { id } });
    clock.set(new Date(clock.now().getTime() + 60_000));
    await mounted(bakehouse, labo, id).expect(204);
    await settle();

    const again = await ctx.prisma.siteResupply.findUniqueOrThrow({ where: { id } });
    expect(again.arrivedAt).toEqual(first.arrivedAt);
    const paul = await ctx.prisma.staffUser.findFirstOrThrow({
      where: { auth0Id: "staff-r3e-fournil" },
      select: { id: true },
    });
    expect(again.arrivedByStaffId).toBe(paul.id);
    expect(again.version).toBe(first.version);
    expect((await bells()).map((bell) => bell.subject)).toEqual([
      "Réassort arrivé — à réceptionner : Le Labo",
    ]);
  });

  it("le comptoir fait foi : un réassort attendu se réceptionne, puis « Monté » n'a plus d'objet", async () => {
    const labo = await seedLabo();
    const id = await croissants(labo, 4);
    const morning = localToInstant(SERVICE_DAY, "07:00");
    if (morning === null) {
      throw new TypeError(`heure locale inexistante : ${SERVICE_DAY} 07:00`);
    }
    clock.set(morning);

    await ctx
      .asSub(STAFF)
      .post(`/admin/resupply-receipts/${labo}/resupplies/${id}/receive`)
      .expect(204);
    await mounted(ctx.asSub(STAFF), labo, id).expect(204);
    await settle();

    expect((await receptionOf(labo, id))?.arrivedAt).toBeNull();
    expect(await bells()).toEqual([]);
  });

  it("le droit : ni le comptoir ni la lecture du fournil ne disent « Monté »", async () => {
    const labo = await seedLabo();
    const id = await croissants(labo, 4);
    const counter = await holderOf("r3e-comptoir", [
      { resource: "handover_counter", action: "write" },
    ]);
    const reader = await holderOf("r3e-fournil-lecture", [
      { resource: "production_resupply", action: "read" },
    ]);

    await mounted(counter, labo, id).expect(403);
    await mounted(reader, labo, id).expect(403);
    expect(
      (await ctx.prisma.siteResupply.findUniqueOrThrow({ where: { id } })).arrivedAt,
    ).toBeNull();
  });

  it("la base refuse une arrivée sans auteur, ou sur une demande en cours", async () => {
    const labo = await seedLabo();
    const id = await croissants(labo, 4);

    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "public"."site_resupply" SET "arrived_at" = now() WHERE "id" = ${id}`,
    ).rejects.toThrow(/site_resupply_arrival_whole/u);
    await expect(
      ctx.prisma.$executeRaw`UPDATE "public"."site_resupply"
        SET "placed_at" = NULL, "placed_by_staff_id" = NULL, "placed_by_name" = NULL,
            "placed_by_role" = NULL, "arrived_at" = now(), "arrived_by_staff_id" = 's',
            "arrived_by_name" = 'n', "arrived_by_role" = 'r'
        WHERE "id" = ${id}`,
    ).rejects.toThrow(/site_resupply_arrival_placed/u);
  });
});
