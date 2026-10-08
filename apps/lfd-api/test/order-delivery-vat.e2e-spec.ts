/**
 * E2E de **la TVA de la livraison** — le réglage du comptable (plan
 * `documentation/order/plan-tva-des-frais-de-port.md`, V2).
 *
 * Ce que seul l'e2e prouve : la garde lit `b2b_accounting` dans la table des
 * rôles, en base ; la ligne absente se relit `standard` ; le CHECK refuse un
 * mode inconnu ; le geste s'écrit au journal au nom de qui l'a fait.
 *
 * Le jeton porteur EST le `sub` : chaque rôle est une vraie fiche en base.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const DELIVERY_VAT = "/admin/order-delivery-vat";

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

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
async function asRole(
  role: "commercial" | "comptabilite",
): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

describe("la TVA de la livraison", () => {
  it("se relit `standard`, non choisie, tant qu'aucun réglage n'est posé", async () => {
    const accounting = await asRole("comptabilite");

    const read = await accounting.get(DELIVERY_VAT).expect(200);

    expect(read.body).toEqual({ mode: "standard", configured: false });
    expect(await ctx.prisma.orderDeliveryVat.count()).toBe(0);
  });

  it("se règle et se relit par la comptabilité", async () => {
    const accounting = await asRole("comptabilite");

    await accounting.put(DELIVERY_VAT).send({ mode: "follows_goods" }).expect(204);
    const read = await accounting.get(DELIVERY_VAT).expect(200);

    expect(read.body).toEqual({ mode: "follows_goods", configured: true });
  });

  it("🔴 est refusée au commercial, qui n'a pas `b2b_accounting`, sans rien écrire", async () => {
    const commercial = await asRole("commercial");

    expect((await commercial.get(DELIVERY_VAT)).status).toBe(403);
    expect((await commercial.put(DELIVERY_VAT).send({ mode: "follows_goods" })).status).toBe(403);
    expect(await ctx.prisma.orderDeliveryVat.count()).toBe(0);
  });

  it("refuse un mode inconnu (400), sans rien écrire", async () => {
    const accounting = await asRole("comptabilite");

    await accounting.put(DELIVERY_VAT).send({ mode: "reduced" }).expect(400);
    expect(await ctx.prisma.orderDeliveryVat.count()).toBe(0);
  });

  it("🔴 le CHECK de la base refuse un mode inconnu écrit en contournant l'API", async () => {
    await expect(
      ctx.prisma.orderDeliveryVat.create({ data: { id: "singleton", mode: "reduced" } }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.orderDeliveryVat.create({ data: { id: "autre", mode: "standard" } }),
    ).rejects.toThrow();
  });

  it("journalise la bascule au nom de la comptable, et pas la reprise du même mode", async () => {
    const accounting = await asRole("comptabilite");
    const { id } = await ctx.prisma.staffUser.findUniqueOrThrow({
      where: { email: "comptabilite@lfc.test" },
      select: { id: true },
    });

    await accounting.put(DELIVERY_VAT).send({ mode: "follows_goods" }).expect(204);
    await accounting.put(DELIVERY_VAT).send({ mode: "follows_goods" }).expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "order_delivery_vat." } },
      select: { type: true, actorType: true, actorId: true, payload: true },
    });
    expect(facts).toEqual([
      {
        type: "order_delivery_vat.mode_set",
        actorType: "staff",
        actorId: id,
        payload: { before: "standard", after: "follows_goods" },
      },
    ]);
  });
});
