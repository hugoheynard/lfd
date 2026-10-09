/**
 * La migration `20261009130000_la_boutique_reste_fermee` reprend l'état de la
 * clé `shop` retirée : une boutique fermée aux commandes le reste après le
 * déploiement (Hugo, 2026-10-09 : la production valait `browse`).
 *
 * La base de test est déjà migrée : la migration est REJOUÉE ici sur une base
 * remise à zéro, puis relue par la route publique — c'est elle que la
 * boutique lit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";

const CARRY_OVER = join(
  process.cwd(),
  "prisma/migrations/20261009130000_la_boutique_reste_fermee/migration.sql",
);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function setShop(value: string): Promise<void> {
  await ctx.prisma.featureAccessOverride.create({
    data: {
      key: "shop",
      value,
      updatedAt: new Date(daysAgo(3)),
      updatedByStaffId: "",
      updatedByName: "Test",
      updatedByRole: "admin",
    },
  });
}

async function replay(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(readFileSync(CARRY_OVER, "utf8"));
}

async function opening(): Promise<{ readonly b2b: boolean; readonly b2c: boolean }> {
  const row = await ctx.prisma.orderOpening.findUnique({ where: { key: "orders" } });
  return { b2b: row?.ordersOpenToB2b ?? true, b2c: row?.ordersOpenToB2c ?? true };
}

describe("la reprise de la clé `shop`", () => {
  it.each(["browse", "closed"])(
    "`shop = %s` ferme les commandes aux deux clientèles",
    async (value) => {
      await setShop(value);

      await replay();

      expect(await opening()).toEqual({ b2b: false, b2c: false });
    },
  );

  it("`shop = order` ne pose rien : la boutique reste ouverte", async () => {
    await setShop("order");

    await replay();

    expect(await ctx.prisma.orderOpening.count()).toBe(0);
  });

  it("sans ligne `shop`, rien n'est écrit", async () => {
    await replay();

    expect(await ctx.prisma.orderOpening.count()).toBe(0);
  });

  it("ne remplace jamais un réglage déjà posé", async () => {
    await setShop("browse");
    await ctx.prisma.orderOpening.create({
      data: {
        key: "orders",
        ordersOpenToB2b: true,
        ordersOpenToB2c: false,
        updatedAt: new Date(daysAgo(1)),
        updatedByStaffId: "",
        updatedByName: "Hugo",
        updatedByRole: "admin",
      },
    });

    await replay();

    expect(await opening()).toEqual({ b2b: true, b2c: false });
  });
});
