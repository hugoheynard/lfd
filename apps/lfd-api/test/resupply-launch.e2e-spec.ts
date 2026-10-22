/**
 * E2E de **« Lancer » un réassort « au plus tôt »** (R4a,
 * `documentation/reassort-boutiques/plan-au-plus-tot.md` §2) sur le vrai
 * Postgres : le verrou de la journée, les colonnes et les CHECK de la
 * migration, le fait durable et son abonné du commerce.
 *
 * Ce qui ne s'éprouve qu'ici : la COURSE entre « Lancer » au fournil et
 * « Annuler » au comptoir — deux transactions sur le même verrou, dont une
 * seule gagne — et la journée jamais arrêtée que le lancement ouvre (Q5).
 *
 * L'horloge est figée le jour servi (J, dans une semaine), à 8 h : « au plus
 * tôt » vise J. Aucune date du calendrier. Une seule journée pour toute la
 * suite, dans l'ordre : la première l'ouvre (Q5), les suivantes lancent sur
 * une journée arrêtée — les comptes se lisent en écart.
 *
 * Écriture Prisma assumée : le point (`site.create`), faute de route de
 * création dans le harnais du fournil — la forme de `resupply-labo-flow`.
 */
import type { ResupplyProductionDayView } from "@lfd/contracts";
import { localToInstant } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  SERVICE_DAY,
  STAFF,
  worksheetLine,
} from "./production-day-fixture.js";

const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    ADMIN_VERIFIER_OVERRIDE,
  ]));
  // Une journée vierge : les suites voisines laissent la leur arrêtée.
  await ctx.reset();
  const morning = localToInstant(SERVICE_DAY, "08:00");
  if (morning === null) {
    throw new TypeError(`heure locale inexistante : ${SERVICE_DAY} 08:00`);
  }
  clock.set(morning);
});

afterAll(async () => {
  await ctx.close();
});

const staff = () => ctx.asSub(STAFF);
const launchPath = (id: string) => `/admin/production/batch/${SERVICE_DAY}/resupplies/${id}/launch`;

async function seedLabo(): Promise<string> {
  const labo = await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
      supply: "on_site",
    },
    select: { id: true },
  });
  return labo.id;
}

/** Le comptoir pose ses croissants « au plus tôt » et envoie la demande. */
async function counterSendsAsap(site: string, quantity: number): Promise<string> {
  const base = `/admin/site-resupplies/sites/${site}`;
  const added = await staff()
    .post(`${base}/drafts/asap/lines`)
    .send({ sku: CROISSANT, quantity })
    .expect(201);
  const id = jsonBody<{ id: string }>(added).id;
  const view = jsonBody<{ drafts: readonly { id: string; version: number }[] }>(
    await staff().get(base).expect(200),
  );
  const version = view.drafts.find((draft) => draft.id === id)?.version;
  await staff().post(`${base}/${id}/send`).send({ version }).expect(204);
  return id;
}

/** Le compte à produire du croissant, lu sur la fiche d'atelier. */
async function counted(): Promise<number> {
  return (await worksheetLine(ctx)).quantity;
}

async function prodManagerTab(): Promise<ResupplyProductionDayView> {
  return jsonBody<ResupplyProductionDayView>(
    await staff().get(`/admin/site-resupplies/to-produce/${SERVICE_DAY}`).expect(200),
  );
}

describe("Lancer un réassort « au plus tôt » (R4a)", () => {
  it("ouvre la journée jamais arrêtée avec ce seul réassort, le compte, et l'affiche « lancé »", async () => {
    const labo = await seedLabo();
    const id = await counterSendsAsap(labo, 12);

    await staff().post(launchPath(id)).expect(204);
    await ctx.drain();

    const day = await ctx.prisma.productionDay.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { closedAt: true, closedBy: true, packingOwner: true },
    });
    expect(day.closedBy).not.toBeNull();
    expect(day.packingOwner).toBe("packing");
    expect(day.closedAt).toEqual(clock.now());
    expect(
      await ctx.prisma.productionResupply.findMany({
        where: { serviceDay: SERVICE_DAY },
        select: { resupplyId: true, kind: true, launchedAt: true },
      }),
    ).toEqual([{ resupplyId: id, kind: "asap", launchedAt: clock.now() }]);
    expect(await counted()).toBe(12);
    const launched = (await prodManagerTab()).sites[0]?.resupplies[0];
    expect(launched).toMatchObject({ id, launchedAt: clock.now().toISOString() });
    expect(launched?.launchedBy).not.toBeUndefined();
  });

  it("refuse un second « Lancer » (409) et l'annulation au comptoir, avec le message du serveur", async () => {
    const labo = await seedLabo();
    const id = await counterSendsAsap(labo, 6);
    const before = await counted();
    await staff().post(launchPath(id)).expect(204);

    await staff().post(launchPath(id)).expect(409);
    const refusal = await staff()
      .post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`)
      .expect(409);

    expect(JSON.stringify(refusal.body)).toContain("déjà lancé ce réassort");
    expect(await counted()).toBe(before + 6);
  });

  it("un réassort annulé avant le lancement n'est plus lançable (404)", async () => {
    const labo = await seedLabo();
    const id = await counterSendsAsap(labo, 6);
    await staff().post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`).expect(204);

    await staff().post(launchPath(id)).expect(404);

    expect(
      await ctx.prisma.productionResupply.count({
        where: { serviceDay: SERVICE_DAY, resupplyId: id },
      }),
    ).toBe(0);
  });

  it("🔴 la course « Lancer » / « Annuler » : une seule gagne, et l'état le dit", async () => {
    const labo = await seedLabo();
    const id = await counterSendsAsap(labo, 9);

    const [launch, cancel] = await Promise.all([
      staff().post(launchPath(id)),
      staff().post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`),
    ]);

    const inPlan = await ctx.prisma.productionResupply.count({
      where: { serviceDay: SERVICE_DAY, resupplyId: id },
    });
    const row = await ctx.prisma.siteResupply.findUniqueOrThrow({
      where: { id },
      select: { cancelledAt: true },
    });
    if (launch.status === 204) {
      expect(cancel.status).toBe(409);
      expect(inPlan).toBe(1);
      expect(row.cancelledAt).toBeNull();
    } else {
      expect([launch.status, cancel.status]).toEqual([404, 204]);
      expect(inPlan).toBe(0);
      expect(row.cancelledAt).not.toBeNull();
    }
  });

  it("un réassort lancé survit à la réouverture et revient au ré-arrêt", async () => {
    const labo = await seedLabo();
    const id = await counterSendsAsap(labo, 5);
    await staff().post(launchPath(id)).expect(204);
    const launched = await ctx.prisma.productionResupply.count({
      where: { serviceDay: SERVICE_DAY, kind: "asap" },
    });
    const before = await counted();

    await staff().post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    expect(
      await ctx.prisma.productionResupply.count({
        where: { serviceDay: SERVICE_DAY, kind: "asap" },
      }),
    ).toBe(launched);
    await staff().post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`).expect(409);

    await staff().post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);
    expect(await counted()).toBe(before);
  });
});
