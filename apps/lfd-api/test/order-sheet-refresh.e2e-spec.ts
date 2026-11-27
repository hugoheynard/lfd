/**
 * La reprise de la confirmation rangée d'une commande passée au compte puis
 * convertie en commande interne (`OrderSheetRefresh`, opération
 * `orders.ord-35-sheet`) : la copie gardée au stockage porte les prix de la
 * passation, et doit être refaite d'après la commande telle qu'elle est.
 */
import { Buffer } from "node:buffer";

import { OrderSheetArchive } from "../src/lafoliecoffee/orders/application/services/order-sheet-archive.service.js";
import { pdfText } from "../src/lafoliecoffee/orders/domain/services/__tests__/pdf-text.js";
import { OrderReader } from "../src/lafoliecoffee/orders/domain/ports/order.reader.js";
import { OrderSheetRefresh } from "../src/lafoliecoffee/orders/infrastructure/ord-35-sheet.operation.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { backorderDecor, SKU, type BackorderDecor } from "./backorder-conversion-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, serviceDay, type E2eContext } from "./e2e-harness.js";
import { placeOrder, type PlacedTestOrder } from "./order-factory.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let decor: BackorderDecor;

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
  decor = await backorderDecor(ctx);
});

function place(): Promise<PlacedTestOrder> {
  return placeOrder(ctx, {
    buyerUserId: decor.buyerId,
    companyId: decor.companyId,
    fulfillment: { method: "pickup", pickupSiteId: decor.pickupId },
    forDay: serviceDay(1),
    lines: [{ sku: SKU, quantity: 4 }],
  });
}

/** Le téléchargement du bureau : il range la confirmation si elle manque, sinon la relit. */
async function download(order: PlacedTestOrder): Promise<{ text: string; fileName: string }> {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .get(`/admin/orders/${order.id}/bon.pdf`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return {
    text: pdfText(response.body as Buffer),
    fileName: String(response.headers["content-disposition"]),
  };
}

/**
 * La conversion en commande interne, telle que l'opération retirée
 * `orders.ord-35-in-house` l'a écrite en production : l'offre `in_house` et
 * les totaux à zéro, sans toucher la révision.
 */
async function convertInHouse(order: PlacedTestOrder): Promise<void> {
  await ctx.prisma.$executeRaw`
    UPDATE public.orders SET
      offer_nature = 'in_house', offer_note = 'Commande interne',
      offer_notifies_customer = true,
      offered_total_cents = total_cents, offered_vat_cents = vat_cents,
      offered_vat_shares = COALESCE(vat_shares, '[]'::jsonb),
      vat_cents = 0, vat_shares = '[]'::jsonb, total_cents = 0,
      ttc_by_rate = CASE WHEN ttc_by_rate IS NULL THEN NULL ELSE '[]'::jsonb END,
      billable_vat_cents = CASE WHEN billable_total_cents IS NULL THEN NULL ELSE 0 END,
      billable_vat_shares = CASE WHEN billable_total_cents IS NULL THEN NULL ELSE '[]'::jsonb END,
      billable_total_cents = CASE WHEN billable_total_cents IS NULL THEN NULL ELSE 0 END
    WHERE id = ${order.id}`;
}

function refreshFor(orderNumber: string): OrderSheetRefresh {
  return new OrderSheetRefresh(
    ctx.app.get(PrismaService),
    ctx.app.get(OrderReader),
    ctx.app.get(OrderSheetArchive),
    orderNumber,
  );
}

/** La relecture du PDF perd le signe « € » : une feuille chiffrée se reconnaît à sa colonne de prix. */
const PRICED = "PU HT";

it("refait sans prix la confirmation rangée d'une commande convertie, une seule fois", async () => {
  const order = await place();
  const before = await download(order);
  expect(before.text).toContain(PRICED);
  expect(before.fileName).toMatch(/LFC-ORD-\d+-[A-Z0-9-]+-confirmation\.pdf/);

  const refresh = refreshFor(order.orderNumber);
  expect(await refresh.refusal()).toMatch(/dit déjà ce que dit la commande/);

  await convertInHouse(order);
  // La copie rangée n'a pas bougé : le téléchargement sert encore les prix.
  expect((await download(order)).text).toContain(PRICED);
  expect(await refresh.refusal()).toBeNull();

  expect(await refresh.apply()).toBe(true);
  const after = await download(order);
  expect(after.text).not.toContain(PRICED);
  expect(after.text).toContain("Commande interne");

  expect(await refresh.refusal()).not.toBeNull();
  expect(await refresh.apply()).toBe(false);
});

it("refuse une commande inexistante", async () => {
  const refresh = refreshFor("ORD-INEXISTANTE");
  expect(await refresh.refusal()).toMatch(/n'existe pas/);
  expect(await refresh.apply()).toBe(false);
});
