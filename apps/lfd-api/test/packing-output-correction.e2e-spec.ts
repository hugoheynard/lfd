/**
 * **La correction du fournil au colisage** (D9 de
 * `documentation/colisage/plan-niveaux-de-suivi-colisage.md`), sur le vrai
 * Postgres : le rouge du fournil (`production.output_corrected`) baisse la
 * réserve du colisage — le manquant d'abord, puis le libre —, sonne chez qui
 * décide pour le reste sans toucher aux sacs, ne baisse jamais deux fois,
 * attend sa remise, et se rattrape au démarrage.
 *
 * La mise en service des niveaux est une date lointaine, comme dans la suite
 * du rouge : sinon aucune journée de test ne serait figée.
 */
import { CatchUpOutputCorrections } from "../src/packing/application/corrections/catch-up-output-corrections.js";
import { OnHandedToPacking } from "../src/packing/application/handlers/on-handed-to-packing.handler.js";
import { OnOutputCorrected } from "../src/packing/application/handlers/on-output-corrected.handler.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { TrackingLevelsCommissioning } from "../src/production/atelier/domain/ports/tracking-levels-commissioning.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import type { E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  packing,
  packingOrderPath,
  place,
  recordBatch,
} from "./production-day-fixture.js";

const LINE = `/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}`;
const BATCH = "01K6A0000000000000000000C4";
const OUTPUT_CORRECTED = "production.output_corrected";
const COMMISSIONED_LONG_AGO = { since: (): Date => new Date(0) };

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
    ADMIN_VERIFIER_OVERRIDE,
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

/** 24 croissants au compte, plan arrêté, inscrits au colisage. */
async function dayOfTwentyFour(): Promise<void> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 24 }]);
  await closePlan(ctx);
  await settle();
}

/** Le rouge au fournil : `produced` pièces réellement sorties. */
async function red(produced: number): Promise<void> {
  await ctx
    .asSub(STAFF)
    .post(`${LINE}/problem`)
    .set(INTENT_KEY, freshIntent())
    .send({ produced })
    .expect(204);
}

async function reserve() {
  return ctx.prisma.packingStock.findUniqueOrThrow({
    where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
    select: { received: true, packed: true, missing: true },
  });
}

async function applied(): Promise<number | undefined> {
  const row = await ctx.prisma.packingAppliedCorrection.findUnique({
    where: {
      serviceDay_handoffId_sku: { serviceDay: SERVICE_DAY, handoffId: BATCH, sku: CROISSANT },
    },
  });
  return row?.applied;
}

async function bellsFor(total: number): Promise<number> {
  return ctx.prisma.staffNotification.count({
    where: { idempotencyKey: `correction:${SERVICE_DAY}:${BATCH}:${CROISSANT}:${String(total)}` },
  });
}

/** Le message de la boîte d'envoi, livré à la main à l'abonné. */
function deliveryOf(fact: { id: string; type: string; payload: unknown }) {
  const payload =
    typeof fact.payload === "object" && fact.payload !== null && !Array.isArray(fact.payload)
      ? Object.fromEntries(Object.entries(fact.payload))
      : {};
  return { eventId: fact.id, type: fact.type, payload };
}

describe("la correction du fournil au colisage", () => {
  it("prend le libre quand rien n'est au sac", async () => {
    await dayOfTwentyFour();
    expect(await recordBatch(ctx, BATCH, 24)).toBe(204);
    await settle();

    await red(15);
    await settle();

    expect(await reserve()).toEqual({ received: 15, packed: 0, missing: 0 });
    expect(await applied()).toBe(9);
    expect(await bellsFor(9)).toBe(0);
  });

  it("absorbe d'abord le manquant, puis sonne pour le reste sans toucher au sac", async () => {
    await dayOfTwentyFour();
    expect(await recordBatch(ctx, BATCH, 24)).toBe(204);
    await settle();
    const [sheet] = (await packing(ctx)).sheets;
    if (sheet === undefined) {
      throw new Error("La scène devait inscrire une commande au colisage.");
    }
    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(sheet.orderId)}/problem`)
      .set(INTENT_KEY, freshIntent())
      .send({ lines: [{ sku: CROISSANT, present: 20 }] })
      .expect(204);
    await settle();
    expect(await reserve()).toEqual({ received: 24, packed: 20, missing: 4 });

    await red(15);
    await settle();

    expect(await reserve()).toEqual({ received: 20, packed: 20, missing: 0 });
    expect(await applied()).toBe(4);
    expect(await bellsFor(9)).toBe(1);
  });

  it("rejouée — le fait, puis le rattrapage — ne baisse jamais deux fois", async () => {
    await dayOfTwentyFour();
    expect(await recordBatch(ctx, BATCH, 24)).toBe(204);
    await settle();
    await red(15);
    await settle();
    const fact = await ctx.prisma.outboxMessage.findFirstOrThrow({
      where: { type: OUTPUT_CORRECTED },
    });

    await ctx.app
      .get(UnitOfWork)
      .run(() => ctx.app.get(OnOutputCorrected).handle(deliveryOf(fact)));
    expect(await ctx.app.get(CatchUpOutputCorrections).execute()).toBe(0);

    expect((await reserve()).received).toBe(15);
    expect(await applied()).toBe(9);
  });

  it("une correction avant sa remise attend, et la réception l'applique", async () => {
    await dayOfTwentyFour();
    expect(await recordBatch(ctx, BATCH, 24)).toBe(204);
    await settle();
    // La boîte d'envoi relaie la remise dès sa validation : pour que la
    // correction arrive la première, la remise est rendue « pas encore reçue ».
    await ctx.prisma.packingReceipt.delete({ where: { id: BATCH } });
    await ctx.prisma.packingStock.update({
      where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
      data: { received: 0 },
    });

    await red(15);
    await settle();
    expect(await applied()).toBeUndefined();
    expect((await reserve()).received).toBe(0);

    const handoff = await ctx.prisma.outboxMessage.findFirstOrThrow({
      where: { type: "production.handed_to_packing" },
    });
    await ctx.app
      .get(UnitOfWork)
      .run(() => ctx.app.get(OnHandedToPacking).handle(deliveryOf(handoff)));

    expect((await reserve()).received).toBe(15);
    expect(await applied()).toBe(9);
  });

  it("rattrape au démarrage une correction que le colisage n'a jamais reçue", async () => {
    await dayOfTwentyFour();
    expect(await recordBatch(ctx, BATCH, 24)).toBe(204);
    await settle();
    // Une part corrigée posée sans fait : celle d'avant l'abonné.
    await ctx.prisma.productionBatch.update({
      where: { id: BATCH },
      data: { correctedQuantity: 6 },
    });

    expect(await ctx.app.get(CatchUpOutputCorrections).execute()).toBe(1);
    expect(await ctx.app.get(CatchUpOutputCorrections).execute()).toBe(0);

    expect((await reserve()).received).toBe(18);
    expect(await applied()).toBe(6);
  });
});
