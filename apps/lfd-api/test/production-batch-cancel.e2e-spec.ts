/**
 * **L'annulation d'une fournée, contre le vrai Postgres** — l'adaptateur
 * `PrismaProductionBatchRepository.cancel`, seul.
 *
 * Régression (audit final du réassort, 2026-11-03) : l'annulation était une
 * écriture conditionnée (`cancelled_at IS NULL`) dont personne ne lisait le
 * nombre de lignes touchées. Zéro passait pour « déjà annulée » — y compris
 * pour une fournée ABSENTE de la base, que l'agrégat venait pourtant de
 * laisser passer : rien n'était annulé, et rien ne le disait.
 */
import { ProductionBatchRepository } from "../src/production/domain/ports/production-batch.repository.js";
import { BatchToCancelMissingError } from "../src/production/domain/errors/batch-errors.js";
import { ServiceDay } from "../src/production/domain/value-objects/service-day.value-object.js";
import { createUser } from "./factories.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closePlan,
  MEMBER,
  place,
  recordBatch,
  SERVICE_DAY,
  storedBatches,
} from "./production-day-fixture.js";

/** Un ULID de forme valide, tiré « par l'écran ». */
const BATCH = "01K6A0000000000000000000C3";
/** Des instants recopiés dans la trace, jamais comparés à l'horloge — exception étroite du §5. */
const FIRST_CANCEL = { at: new Date("2026-09-07T05:00:00.000Z"), by: "staff_four" };
const SECOND_CANCEL = { at: new Date("2026-09-07T06:00:00.000Z"), by: "staff_autre" };

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

describe("annuler une fournée par l'adaptateur", () => {
  it("refuse, en le nommant, une fournée absente de la journée au lieu de passer en silence", async () => {
    const batches = ctx.app.get(ProductionBatchRepository);
    await expect(
      batches.cancel(ServiceDay.of(SERVICE_DAY), "absente", FIRST_CANCEL),
    ).rejects.toThrow(BatchToCancelMissingError);
  });

  it("annuler deux fois la même fournée passe sans effet, et seule la première annulation reste tracée", async () => {
    await place(ctx, issued, [{ sku: "VIE-001-1", quantity: 4 }]);
    await closePlan(ctx);
    await ctx.drain();
    expect(await recordBatch(ctx, BATCH, 2)).toBe(204);
    const batches = ctx.app.get(ProductionBatchRepository);
    const day = ServiceDay.of(SERVICE_DAY);

    await batches.cancel(day, BATCH, FIRST_CANCEL);
    await batches.cancel(day, BATCH, SECOND_CANCEL);

    const stored = await ctx.prisma.productionBatch.findUniqueOrThrow({
      where: { id: BATCH },
      select: { cancelledBy: true },
    });
    expect(stored.cancelledBy).toBe("staff_four");
    expect((await storedBatches(ctx)).map((batch) => batch.cancelledAt !== null)).toEqual([true]);
  });
});
