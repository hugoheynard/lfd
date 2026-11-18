/**
 * **Le niveau de suivi figé par fiche** (plan
 * `documentation/colisage/plan-niveaux-de-suivi-colisage.md`, D1–D3), sur le
 * vrai Postgres : la colonne neuve et son CHECK, le réglage relu en base au
 * moment de l'inscription, et le reliquat qui relit sa fiche d'origine.
 */
import { OnPackingListDrawn } from "../src/packing/application/handlers/on-packing-list-drawn.handler.js";
import { PackingSheetRepository } from "../src/packing/domain/ports/packing-sheet.repository.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { PackingListDrawnEvent } from "../src/production/channels/packing/index.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import { PACKING_SETTINGS } from "./packing-settings-scene.js";

const SERVICE_DAY = serviceDay();
/** Recopié dans le fait, jamais comparé à l'horloge. */
const DRAWN = new Date("2026-10-13T03:00:00.000Z");

function drawn(orderId: string, rank: number, fulfillmentMethod: "pickup" | "delivery") {
  return new PackingListDrawnEvent(SERVICE_DAY, DRAWN, {
    orderId,
    rank,
    reference: `ORD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod,
    dueAt: null,
    clientele: "pro",
    siteId: null,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 2, saleUnit: "piece" }],
  }).durableFact();
}

describe("Le niveau de suivi figé à la naissance d'une fiche (C1)", () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  async function inscribe(orderId: string, rank: number, method: "pickup" | "delivery") {
    const fact = drawn(orderId, rank, method);
    await ctx.app
      .get(OnPackingListDrawn)
      .handle({ eventId: fact.key, type: fact.type, payload: fact.payload });
  }

  async function levelOf(orderId: string, rank: number): Promise<string | null | undefined> {
    const row = await ctx.prisma.packingOrder.findUnique({
      where: { serviceDay_orderId_rank: { serviceDay: SERVICE_DAY, orderId, rank } },
      select: { trackingLevel: true },
    });
    return row?.trackingLevel;
  }

  it("un retrait naît en simple tant que personne n'a rien réglé ; une livraison sans niveau", async () => {
    await inscribe("ord_pickup", 1, "pickup");
    await inscribe("ord_delivery", 1, "delivery");

    expect(await levelOf("ord_pickup", 1)).toBe("simple");
    expect(await levelOf("ord_delivery", 1)).toBeNull();

    const sheet = await ctx.app
      .get(UnitOfWork)
      .run(() => ctx.app.get(PackingSheetRepository).lock(SERVICE_DAY, "ord_delivery", 1));
    expect(sheet?.trackingLevel).toBe("detailed");
  });

  it("le réglage changé vaut pour les fiches suivantes, pas pour celles déjà nées", async () => {
    await inscribe("ord_before", 1, "pickup");
    await admin(ctx)
      .put(PACKING_SETTINGS)
      .send({ halfSharing: false, pickupTrackingLevel: "detailed" })
      .expect(204);
    await inscribe("ord_after", 1, "pickup");
    await inscribe("ord_before", 1, "pickup");

    expect(await levelOf("ord_before", 1)).toBe("simple");
    expect(await levelOf("ord_after", 1)).toBe("detailed");
  });

  it("un reliquat prend le niveau de sa fiche d'origine, pas le réglage du moment", async () => {
    await inscribe("ord_origin", 1, "pickup");
    await admin(ctx)
      .put(PACKING_SETTINGS)
      .send({ halfSharing: false, pickupTrackingLevel: "detailed" })
      .expect(204);
    await inscribe("ord_origin", 2, "pickup");

    expect(await levelOf("ord_origin", 2)).toBe("simple");
  });

  it("la base refuse un niveau inconnu (CHECK)", async () => {
    await inscribe("ord_check", 1, "pickup");

    await expect(
      ctx.prisma.packingOrder.update({
        where: {
          serviceDay_orderId_rank: { serviceDay: SERVICE_DAY, orderId: "ord_check", rank: 1 },
        },
        data: { trackingLevel: "always_green" },
      }),
    ).rejects.toThrow();
  });
});
