/**
 * E2E des **niveaux de suivi du fournil** — plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, lot N1, sur le vrai
 * Postgres jetable.
 *
 * Ce que seule cette suite prouve :
 *
 * - **le réglage du fournil** : sa ligne unique, son CHECK, l'auteur figé, un
 *   fait conforme au contrat, le refus d'une marge hors bornes ;
 * - **le niveau d'un poste** : la colonne, son fait, et la fiche qui le sert
 *   sur la ligne de son produit ;
 * - **le figement** : la clé unique sur la journée et l'insertion qui ignore
 *   le conflit, le déclencheur du journal de la journée ;
 * - **la part corrigée** : le CHECK `0 ≤ corrigé ≤ quantité`, et la fiche
 *   qui la déduit de ce qui est sorti.
 *
 * La mise en service est remplacée par une date lointaine : la valeur de
 * production (`TRACKING_LEVELS_SINCE`) est encore à venir, et aucune journée
 * de test ne serait figée.
 */
import type { CreatedIdResponse, ProductionTrackingView } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { DayTrackingLevelsFreezing } from "../src/production/atelier/application/services/day-tracking-levels-freezing.service.js";
import { TrackingLevelsCommissioning } from "../src/production/atelier/domain/ports/tracking-levels-commissioning.js";
import { ServiceDay } from "../src/production/day/index.js";
import { dayVersionOf } from "./day-versions-door.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
  recordBatch,
  worksheetLine,
} from "./production-day-fixture.js";

const TRACKING = "/admin/production/settings/tracking";
const WORKSTATIONS = "/admin/production/workstations";
const FIRST = "01K6A0000000000000000000A1";
/** La référence produit du croissant de test (`VIE-001-1` est sa déclinaison). */
const CROISSANT_PRODUCT = "VIE-001";

/** Une mise en service si ancienne que toute journée de test la suit. */
const COMMISSIONED_LONG_AGO = { since: (): Date => new Date(0) };

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
    { token: TrackingLevelsCommissioning, value: COMMISSIONED_LONG_AGO },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

async function setTracking(level: string, marginMinutes: number, expected = 204) {
  return ctx
    .asSub(STAFF)
    .put(TRACKING)
    .set(INTENT_KEY, freshIntent())
    .send({ level, marginMinutes })
    .expect(expected);
}

async function tracking(): Promise<ProductionTrackingView> {
  return jsonBody<ProductionTrackingView>(await ctx.asSub(STAFF).get(TRACKING).expect(200));
}

/** 24 croissants au compte, plan arrêté. */
async function closedDayOfTwentyFour(): Promise<void> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 24 }]);
  await closePlan(ctx);
  await settle();
}

function freeze() {
  return ctx.app.get(DayTrackingLevelsFreezing).freezeIfDue(ServiceDay.of(SERVICE_DAY));
}

describe("le niveau de suivi du fournil", () => {
  it("vaut toujours vert à quinze minutes tant que personne ne l'a posé", async () => {
    expect(await tracking()).toEqual({ level: "always_green", marginMinutes: 15 });
  });

  it("se pose, fige l'auteur et écrit un fait conforme au contrat", async () => {
    await setTracking("simple", 20);

    expect(await tracking()).toEqual({ level: "simple", marginMinutes: 20 });
    const row = await ctx.prisma.productionTrackingSettings.findUniqueOrThrow({
      where: { key: "house" },
    });
    expect(row.updatedByStaffId).not.toBe("");
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "production_tracking_settings.updated" },
      select: { type: true, payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts.map((fact) => checkJournalFact(fact.type, fact.payload))).toEqual([null]);
  });

  it("refuse une marge hors bornes en nommant le cas, sans rien écrire", async () => {
    const refused = await setTracking("simple", 300, 400);

    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "production.tracking_settings.invalid_margin",
    );
    expect(await ctx.prisma.productionTrackingSettings.count()).toBe(0);
  });

  it("la base refuse un niveau inconnu (CHECK)", async () => {
    await expect(
      ctx.prisma.productionTrackingSettings.create({
        data: {
          key: "house",
          level: "green",
          updatedAt: new Date(0),
          updatedByStaffId: "staff",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("le niveau figé d'une journée arrêtée", () => {
  it("se fige au premier passage, fait avancer la journée, et ne se réécrit plus", async () => {
    await closedDayOfTwentyFour();
    await setTracking("simple", 15);
    const before = await dayVersionOf(ctx.asSub(STAFF), "production", SERVICE_DAY);

    expect((await freeze()).house).toBe("simple");
    expect(await dayVersionOf(ctx.asSub(STAFF), "production", SERVICE_DAY)).not.toBe(before);

    await setTracking("detailed", 15);
    expect((await freeze()).house).toBe("simple");
    const rows = await ctx.prisma.productionDayTrackingLevel.findMany();
    expect(rows.map((row) => [row.serviceDay, row.houseLevel])).toEqual([[SERVICE_DAY, "simple"]]);
    expect((await worksheetLine(ctx)).trackingLevel).toBe("simple");
  });

  it("pas encore figée, la fiche sert le réglage courant", async () => {
    await closedDayOfTwentyFour();
    await setTracking("detailed", 15);

    expect((await worksheetLine(ctx)).trackingLevel).toBe("detailed");
    expect(await ctx.prisma.productionDayTrackingLevel.count()).toBe(0);
  });

  it("le niveau propre d'un poste vaut pour la ligne de son produit", async () => {
    await closedDayOfTwentyFour();
    const pastry = jsonBody<CreatedIdResponse>(
      await ctx
        .asSub(STAFF)
        .post(WORKSTATIONS)
        .set(INTENT_KEY, freshIntent())
        .send({ name: "Pâtisserie" })
        .expect(201),
    ).id;
    await ctx
      .asSub(STAFF)
      .put(`${WORKSTATIONS}/placements`)
      .set(INTENT_KEY, freshIntent())
      .send({ productSkus: [CROISSANT_PRODUCT], workstationId: pastry })
      .expect(204);
    await ctx
      .asSub(STAFF)
      .put(`${WORKSTATIONS}/${pastry}/tracking-level`)
      .set(INTENT_KEY, freshIntent())
      .send({ trackingLevel: "detailed" })
      .expect(204);

    const levels = await freeze();

    expect(levels.house).toBe("always_green");
    expect(levels.workstations.get(pastry)).toBe("detailed");
    expect((await worksheetLine(ctx)).trackingLevel).toBe("detailed");
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "production_workstation.tracking_level_set" },
      select: { type: true, payload: true },
    });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
  });
});

describe("la part corrigée d'une fournée", () => {
  it("est déduite de ce qui est sorti, et fait avancer la journée", async () => {
    await closedDayOfTwentyFour();
    expect(await recordBatch(ctx, FIRST, 24)).toBe(204);
    const before = await dayVersionOf(ctx.asSub(STAFF), "production", SERVICE_DAY);

    // Aucun geste ne l'écrit encore (le rouge vient au lot N2) : la colonne
    // est posée en base pour éprouver ses lecteurs.
    await ctx.prisma.productionBatch.update({
      where: { id: FIRST },
      data: { correctedQuantity: 9 },
    });

    expect(await dayVersionOf(ctx.asSub(STAFF), "production", SERVICE_DAY)).not.toBe(before);
    expect(await worksheetLine(ctx)).toMatchObject({
      produced: 15,
      remaining: 9,
      done: false,
      batches: [expect.objectContaining({ id: FIRST, quantity: 15 })],
    });
  });

  it("la base refuse une part corrigée au-delà de la fournée (CHECK)", async () => {
    await closedDayOfTwentyFour();
    await recordBatch(ctx, FIRST, 12);

    await expect(
      ctx.prisma.productionBatch.update({
        where: { id: FIRST },
        data: { correctedQuantity: 13 },
      }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.productionBatch.update({
        where: { id: FIRST },
        data: { correctedQuantity: -1 },
      }),
    ).rejects.toThrow();
  });
});
