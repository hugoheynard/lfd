/**
 * E2E des **fournées** — plan `documentation/production/plan-fournees-progressives.md`,
 * D1, D3, D4, D6.
 *
 * Ce qui ne se prouve que contre le vrai Postgres :
 *
 * - **l'idempotence** tient par `ON CONFLICT DO NOTHING` puis relecture — un
 *   doublé en mémoire la mimerait, il ne la prouverait pas ;
 * - **la course** : deux mises au bac simultanées sur 12 disponibles pour deux
 *   lignes de 12 — une seule passe, parce que le verrou `FOR UPDATE` de la
 *   réserve du colisage les sérialise ;
 * - **le retour** : annuler ou décocher une fournée remise DEMANDE un retour
 *   au colisage (K2), qui rend ce qui n'est pas au bac — rien, si tout y est.
 * - **la version** avance à chaque fournée, par le déclencheur de la table.
 *
 * ⚠️ Le verrou est éprouvé par l'adaptateur `pg`, pas à travers Prisma
 * Accelerate (le plan le laisse ouvert).
 */
import type { DayVersionView, PackingSheet } from "@lfd/contracts";

import { createUser } from "./factories.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bagLines,
  bootstrapProductionDay,
  cancelBatch,
  closePlan,
  markLine,
  packing,
  place,
  recordBatch,
  storedBatches,
  worksheetLine,
} from "./production-day-fixture.js";

/** Des ULID de forme valide, tirés « par l'écran ». */
const FIRST = "01K6A0000000000000000000A1";
const SECOND = "01K6A0000000000000000000B2";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** La boîte d'envoi vidée : liste à coliser, remises, demandes de retour et réponses. */
async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

/** Deux bacs de 12 croissants, plan arrêté : 24 au compte. Rend les bacs du poste. */
async function twoBagsOfTwelve(): Promise<readonly PackingSheet[]> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
  await closePlan(ctx);
  await settle();
  return (await packing(ctx)).sheets;
}

/** Un sac au colisage, et les 12 croissants de la commande dedans — rend le statut. */
async function bagOf(sheet: PackingSheet | undefined): Promise<number> {
  if (sheet === undefined) {
    throw new Error("La journée devait porter deux bacs.");
  }
  await settle();
  return bagLines(ctx, sheet);
}

async function version(): Promise<number> {
  return jsonBody<DayVersionView>(
    await ctx.asSub(STAFF).get(`/admin/production/version?date=${SERVICE_DAY}`).expect(200),
  ).version;
}

describe("déclarer une fournée", () => {
  it("fait avancer la ligne, et la VERSION de la journée à chaque fournée", async () => {
    await twoBagsOfTwelve();
    const before = await version();

    expect(await recordBatch(ctx, FIRST, 10)).toBe(204);
    const afterFirst = await version();
    expect(await recordBatch(ctx, SECOND, 16)).toBe(204);

    expect(afterFirst).not.toBe(before);
    expect(await version()).not.toBe(afterFirst);
    expect(await worksheetLine(ctx)).toMatchObject({
      quantity: 24,
      produced: 26,
      remaining: 0,
      surplus: 2,
      done: true,
    });
  });

  it("un rejeu de la MÊME charge est un succès, et ne compte qu'une fois", async () => {
    await twoBagsOfTwelve();

    const statuses = await Promise.all([recordBatch(ctx, FIRST, 12), recordBatch(ctx, FIRST, 12)]);

    // Deux requêtes identiques simultanées : jamais de 500.
    expect(statuses).toEqual([204, 204]);
    expect(await storedBatches(ctx)).toHaveLength(1);
    expect((await worksheetLine(ctx)).produced).toBe(12);
  });

  it("🔴 le même id pour une AUTRE charge est refusé (409), rien n'est compté", async () => {
    await twoBagsOfTwelve();
    await recordBatch(ctx, FIRST, 12);

    expect(await recordBatch(ctx, FIRST, 18)).toBe(409);
    expect((await worksheetLine(ctx)).produced).toBe(12);
  });

  it("le rejeu d'une fournée ANNULÉE réussit et ne la ressuscite pas", async () => {
    await twoBagsOfTwelve();
    await recordBatch(ctx, FIRST, 12);
    await settle();
    expect(await cancelBatch(ctx, FIRST)).toBe(204);
    // Le colisage rend tout ce qui n'est pas au bac : la fournée s'annule.
    await settle();

    expect(await recordBatch(ctx, FIRST, 12)).toBe(204);

    expect((await worksheetLine(ctx)).produced).toBe(0);
    expect((await storedBatches(ctx))[0]?.cancelledAt).not.toBeNull();
  });
});

describe("annuler une fournée", () => {
  it("🔴 ses pièces déjà dans un sac : le colisage n'en rend rien, la fournée compte encore", async () => {
    const [first] = await twoBagsOfTwelve();
    await recordBatch(ctx, FIRST, 12);
    expect(await bagOf(first)).toBe(204);

    expect(await cancelBatch(ctx, FIRST)).toBe(204);
    await settle();

    expect((await worksheetLine(ctx)).produced).toBe(12);
    expect((await storedBatches(ctx))[0]?.cancelledAt).toBeNull();
  });

  it("annuler deux fois est un succès silencieux ; une fournée inconnue, 404", async () => {
    await twoBagsOfTwelve();
    await recordBatch(ctx, FIRST, 12);
    await settle();

    expect(await cancelBatch(ctx, FIRST)).toBe(204);
    await settle();
    expect(await cancelBatch(ctx, FIRST)).toBe(204);
    expect(await cancelBatch(ctx, SECOND)).toBe(404);
  });
});

describe("le colisage puise dans ce qui est sorti (D4)", () => {
  it("🔴 LA COURSE : 12 disponibles, deux lignes de 12 au même instant — une seule passe", async () => {
    const [first, second] = await twoBagsOfTwelve();
    await recordBatch(ctx, FIRST, 12);
    await settle();

    const statuses = await Promise.all([bagOf(first), bagOf(second)]);

    expect([...statuses].sort()).toEqual([204, 409]);
    const sheets = (await packing(ctx)).sheets;
    expect(sheets.reduce((total, sheet) => total + sheet.packedPieces, 0)).toBe(12);
  });

  it("le premier sac se remplit dès que ses 12 sont sortis, sans attendre les 24", async () => {
    const [first, second] = await twoBagsOfTwelve();
    await recordBatch(ctx, FIRST, 12);

    expect(await bagOf(first)).toBe(204);
    expect(await bagOf(second)).toBe(409);
    await recordBatch(ctx, SECOND, 12);
    expect(await bagOf(second)).toBe(204);
  });
});

describe("l'ancienne case, traduite", () => {
  it("cocher rejoué sur une ligne complète est un succès sans effet", async () => {
    await twoBagsOfTwelve();

    expect(await markLine(ctx)).toBe(204);
    expect(await markLine(ctx)).toBe(204);

    expect(await storedBatches(ctx)).toHaveLength(1);
    expect(await worksheetLine(ctx)).toMatchObject({ produced: 24, done: true, initials: "MB" });
  });

  it("🔴 décocher ce qui est au bac : le colisage n'en rend que le reste", async () => {
    const [first] = await twoBagsOfTwelve();
    await markLine(ctx);
    expect(await bagOf(first)).toBe(204);

    await ctx
      .asSub(STAFF)
      .delete(`/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}/done`)
      .expect(204);
    await settle();

    // 24 sortis, 12 dans un sac : le colisage rend 12, la fiche en garde 12.
    expect((await worksheetLine(ctx)).produced).toBe(12);
  });
});
