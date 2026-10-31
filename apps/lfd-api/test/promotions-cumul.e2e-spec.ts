/**
 * E2E du **cumul sur demande** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 16 et § 16.1, lot L12), sur le vrai Postgres :
 *
 * 1. deux promotions « Cumulable » sur le même article se posent toutes deux
 *    (le refus de chevauchement ne s'applique pas entre elles) et se
 *    combinent l'une après l'autre au devis ;
 * 2. une non cumulable face à une cumulable reste refusée à la pose ;
 * 3. « Cumulable » est admis sur une promotion de panier depuis M7 (§ 18.6),
 *    et deux cumulables de panier se posent ensemble ; une non cumulable de
 *    panier face à elles reste refusée.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import type { ShopQuoteView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { onlyVariant, posePromotion, promotionTerms } from "./promotion-fixtures.js";

const SKU = "VIE-001-1";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Le prix unitaire HT que le devis anonyme sert pour une pièce. */
async function unitPrice(): Promise<number> {
  const body = { lines: [{ sku: SKU, quantity: 1 }], fulfillment: null };
  const view = jsonBody<ShopQuoteView>(await ctx.http().post("/shop/quote").send(body).expect(200));
  const line = view.lines[0];
  if (line === undefined) {
    throw new Error("Le devis n'a pas de ligne.");
  }
  return line.unitPriceMillicents;
}

/** Arrondi au plus proche, la moitié vers le haut — en entiers, sans flottant. */
function percentOf(millicents: number, remainingPercent: number): number {
  return Math.floor((millicents * remainingPercent + 50) / 100);
}

describe("le cumul sur demande (§ 16)", () => {
  it("deux cumulables sur le même article se posent et se combinent : 20 % puis 15 % du reste", async () => {
    const before = await unitPrice();
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Cumul −20 %",
        effect: { kind: "percent_off", value: 2_000 },
        cumulative: true,
      }),
    );
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Cumul −15 % croissant",
        effect: { kind: "percent_off", value: 1_500 },
        scope: onlyVariant(SKU),
        cumulative: true,
      }),
    );

    // Un seul arrondi, en fin de chaîne : × 0,8 × 0,85 = × 0,68.
    expect(await unitPrice()).toBe(percentOf(before, 68));
    const stored = await ctx.prisma.promotion.findMany({ select: { cumulative: true } });
    expect(stored.map((row) => row.cumulative)).toEqual([true, true]);
  });

  it("refuse une non cumulable qui se dispute l'article avec une cumulable", async () => {
    await posePromotion(staff(), promotionTerms({ internalName: "Cumul", cumulative: true }));

    const refused = await staff()
      .post("/admin/promotions")
      .send(promotionTerms({ internalName: "Seule", scope: onlyVariant(SKU) }))
      .expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("promotions.overlapping");
    expect(await ctx.prisma.promotion.count()).toBe(1);
  });

  it("admet deux promotions de panier cumulables, refuse une non cumulable face à elles (M7)", async () => {
    const basket = (internalName: string, cumulative: boolean) =>
      promotionTerms({
        internalName,
        fulfillment: { kind: "pickup", pickupId: null },
        cumulative,
      });
    await posePromotion(staff(), basket("Panier cumulable A", true));
    await posePromotion(staff(), basket("Panier cumulable B", true));

    const refused = await staff()
      .post("/admin/promotions")
      .send(basket("Panier seul", false))
      .expect(409);

    // Même acheminement : le chevauchement nomme l'article, avant la limite par commande.
    expect(jsonBody<{ code: string }>(refused).code).toBe("promotions.overlapping");
    expect(await ctx.prisma.promotion.count()).toBe(2);
  });
});
