/**
 * E2E de la **reprise de la porte de passation** —
 * `20261031100000_la_porte_de_passation` (`documentation/promotions/promotions.md`, § 2.7, lot L1).
 *
 * La migration est appliquée par le harnais ; on rejoue ici son seul
 * `UPDATE`, lu dans le fichier, sur des commandes remises à `registered` —
 * l'état exact de toute commande juste après l'`ADD COLUMN`. Les commandes
 * sont passées par le VRAI handler ; seul le passage de l'invité au compte
 * s'écrit en SQL, parce que c'est l'état de la fiche que la reprise lit.
 *
 * Le cas qui justifie la règle : un invité qui devient un compte SUR LA MÊME
 * FICHE (`guest-account-claim.ts`) porte désormais un `sub`, et
 * « `auth0_sub IS NULL` » seul rendrait ses commandes d'invité `registered`.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PlaceShopOrderPayload } from "@lfd/contracts";

import { PlaceShopOrderCommand } from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261031100000_la_porte_de_passation/migration.sql",
);

/** Le seul `UPDATE` de la migration, tel qu'il est écrit. */
function backfillStatement(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const match = /UPDATE "public"\."orders"[\s\S]*?;/.exec(sql);
  if (match === null) {
    throw new Error("L'UPDATE de reprise est introuvable dans la migration.");
  }
  return match[0];
}

let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const paymentIntentId = `pi_buyer_kind_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
  retrieveIntent: () =>
    Promise.resolve({
      paymentIntentId: "pi_buyer_kind_1",
      clientSecret: "pi_buyer_kind_1_secret",
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_public",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

function payload(): PlaceShopOrderPayload {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: pickupId,
    requestedDeliveryDate: serviceDay(),
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 3 }],
  };
}

/** Une commande d'invité, par le vrai handler ; rend son id et celui du porteur. */
async function guestOrder(): Promise<{ readonly id: string; readonly userId: string }> {
  const placed = await ctx.app
    .get(PlaceShopOrderHandler)
    .execute(new PlaceShopOrderCommand(payload()));
  await ctx.drain();
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: placed.id },
    select: { id: true, placedByUserId: true },
  });
  return { id: row.id, userId: row.placedByUserId };
}

/** L'état de toute commande juste après l'`ADD COLUMN`, puis la reprise. */
async function replayBackfill(): Promise<void> {
  await ctx.prisma.order.updateMany({ data: { buyerKind: "registered" } });
  await ctx.prisma.$executeRawUnsafe(backfillStatement());
}

async function buyerKindOf(orderId: string): Promise<string> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { buyerKind: true },
  });
  return row.buyerKind;
}

describe("la reprise de la porte de passation", () => {
  it("rend `guest` une commande d'invité dont la fiche n'a toujours pas de compte", async () => {
    const order = await guestOrder();

    await replayBackfill();

    expect(await buyerKindOf(order.id)).toBe("guest");
  });

  it("🔴 GARDE `guest` quand l'invité est devenu un compte APRÈS sa commande", async () => {
    const order = await guestOrder();
    // Le rattachement pose le `sub` ET l'instant, sur la même fiche.
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE "public"."users"
          SET "auth0_sub" = 'auth0|devenu-compte', "became_account_at" = now() + interval '1 minute'
        WHERE "id" = $1`,
      order.userId,
    );

    await replayBackfill();

    expect(await buyerKindOf(order.id)).toBe("guest");
  });

  it("laisse `registered` une commande passée alors que la fiche était déjà un compte", async () => {
    const order = await guestOrder();
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE "public"."users"
          SET "auth0_sub" = 'auth0|deja-compte', "became_account_at" = now() - interval '1 day'
        WHERE "id" = $1`,
      order.userId,
    );

    await replayBackfill();

    expect(await buyerKindOf(order.id)).toBe("registered");
  });

  it("la base refuse un invité qui porterait une saisie de l'équipe (CHECK)", async () => {
    const order = await guestOrder();

    await expect(
      ctx.prisma.order.update({ where: { id: order.id }, data: { placedByStaffId: "staff_1" } }),
    ).rejects.toThrow(/orders_buyer_kind_guest_shape/);
  });
});
