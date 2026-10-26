/**
 * E2E de **l'annulation par l'invité** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, lot C6,
 * C6.4, C6.10) — le lien du courriel, le même 404 pour tout lien qui ne mène
 * nulle part, la page qui dit pourquoi, S3, le débit propre.
 */
import type { GuestOrderCancellationView } from "@lfd/contracts";

import { OrderPlacedMail } from "../src/b2b/orders/application/services/order-placed-mail.service.js";
import { CancellationLinkSigner } from "../src/b2b/orders/domain/ports/cancellation-link-signer.js";
import { OrderStatus, PaymentStatus } from "../src/platform/database/client/client.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bootCustomerScene,
  CLIENT_BASE_URL,
  customer,
  guest,
  seedCustomerOrder,
  setCancellation,
  visitor,
} from "./order-customer-cancel-scene.js";
import { resetScene, scene } from "./order-staff-cancel-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootCustomerScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
  await setCancellation(true);
});

const tokenOf = (orderId: string) => ctx.app.get(CancellationLinkSigner).sign(orderId);
const view = (orderId: string, token: string) =>
  visitor().post("/shop/orders/cancellation/view").send({ orderId, token });
const confirm = (orderId: string, token: string) =>
  visitor().post("/shop/orders/cancellation/confirm").send({ orderId, token });

async function guestOrder(seed: { readonly inDays?: number | null } = {}) {
  const buyer = await guest();
  const order = await seedCustomerOrder({ placedByUserId: buyer.id, ...seed });
  return { buyer, ...order, token: tokenOf(order.orderId) };
}

describe("le lien du courriel (C6.4, B1)", () => {
  it("l'accusé d'un invité porte la page d'annulation, le jeton en fragment — le même au rejeu", async () => {
    const { orderId, token } = await guestOrder();
    const mail = ctx.app.get(OrderPlacedMail);

    await mail.send(orderId);
    await mail.send(orderId);

    const links = scene.mails
      .filter((sent) => sent.template === "customer.order-placed")
      .map((sent) => (sent.data as { readonly manageUrl?: string }).manageUrl);
    expect(links).toEqual([
      `${CLIENT_BASE_URL}/annuler#${orderId}.${token}`,
      `${CLIENT_BASE_URL}/annuler#${orderId}.${token}`,
    ]);
  });

  it("l'accusé d'un compte porte SA commande dans « Mes commandes », sans secret", async () => {
    const author = await customer();
    const { orderId } = await seedCustomerOrder({ placedByUserId: author.id });

    await ctx.app.get(OrderPlacedMail).send(orderId);

    expect(scene.mails[0]?.data).toMatchObject({
      manageUrl: `${CLIENT_BASE_URL}/mes-commandes/${orderId}`,
    });
  });
});

describe("POST /shop/orders/cancellation/view", () => {
  it("rend la page étroite : ni nom de famille, ni adresse, ni téléphone, ni jeton de retrait", async () => {
    const { orderId, orderNumber, token } = await guestOrder();

    const response = await view(orderId, token).expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    const body = jsonBody<GuestOrderCancellationView>(response);
    expect(body).toMatchObject({
      orderNumber,
      firstName: "Paul",
      lines: [{ name: "Croissant", quantity: 1 }],
      cancellability: { cancellable: true },
    });
    expect(Object.keys(body).sort()).toEqual(
      [
        "cancellability",
        "firstName",
        "fulfillment",
        "lines",
        "orderNumber",
        "requestedFor",
        "status",
        "totalCents",
      ].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/handoverToken|example\.test|lastName|phone/u);
  });

  it.each([
    ["un jeton faux", async () => ({ ...(await guestOrder()), token: "faux" })],
    [
      "le jeton d'une autre commande",
      async () => ({ ...(await guestOrder()), token: (await guestOrder()).token }),
    ],
    ["au-delà de 90 jours après le retrait", () => guestOrder({ inDays: -95 })],
  ])("%s → le même 404 neutre", async (_label, seed) => {
    const { orderId, token } = await seed();
    const response = await view(orderId, token);
    expect(response.status).toBe(404);
    expect(jsonBody<{ code: string }>(response).code).toBe("orders.customer_cancel.link_not_found");
  });

  it("une commande inconnue, au jeton bien formé → le même 404", async () => {
    await view("ord_inconnue", tokenOf("ord_inconnue")).expect(404);
  });

  it("une commande déjà annulée : page 200 avec la raison, POST refusé avec la phrase", async () => {
    const { orderId, token } = await guestOrder();
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.cancelled, paymentStatus: PaymentStatus.failed },
    });

    const page = await view(orderId, token).expect(200);
    expect(jsonBody<GuestOrderCancellationView>(page).cancellability).toMatchObject({
      cancellable: false,
      code: "already_cancelled",
    });
    const refused = await confirm(orderId, token);
    expect(refused.status).toBe(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "orders.customer_cancel.already_cancelled",
    );
  });

  it("S3 : la fiche est devenue un compte — la page dit « connectez-vous », le POST refuse", async () => {
    const { buyer, orderId, token } = await guestOrder();
    await ctx.prisma.user.update({
      where: { id: buyer.id },
      data: { auth0Sub: `auth0|devenu-${buyer.id}` },
    });

    const page = await view(orderId, token).expect(200);
    expect(jsonBody<GuestOrderCancellationView>(page).cancellability).toMatchObject({
      code: "account_required",
    });
    const refused = await confirm(orderId, token);
    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "orders.customer_cancel.account_required",
    );
  });

  it("S3 : la fiche est désactivée — « contactez la boutique »", async () => {
    const { buyer, orderId, token } = await guestOrder();
    await ctx.prisma.user.update({ where: { id: buyer.id }, data: { status: "disabled" } });

    const refused = await confirm(orderId, token);
    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "orders.customer_cancel.account_disabled",
    );
  });
});

describe("POST /shop/orders/cancellation/confirm", () => {
  it("le bon jeton annule : `guest`, la fiche de l'invité, aucune fiche staff ; second clic : déjà annulée", async () => {
    const { buyer, orderId, token } = await guestOrder();

    await confirm(orderId, token).expect(204);

    expect(
      await ctx.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, cancelledBy: true, cancelledByKind: true, cancelledByUserId: true },
      }),
    ).toEqual({
      status: OrderStatus.cancelled,
      cancelledBy: null,
      cancelledByKind: "guest",
      cancelledByUserId: buyer.id,
    });
    const again = await confirm(orderId, token);
    expect(jsonBody<{ code: string }>(again).code).toBe("orders.customer_cancel.already_cancelled");
  });

  /**
   * Décision du 2026-10-13 : plus de « réglage fermé » — sans délai, seul le
   * fournil limite. Depuis le 2026-10-26, le délai est figé à la passation :
   * le désactiver après ne libère pas la commande ; passée sans délai, elle
   * s'annule.
   */
  it("délai actif : `too_late` à J+1, même désactivé après ; passée sans délai, l'invité annule", async () => {
    const { orderId, token } = await guestOrder({ inDays: 1 });
    const refused = await confirm(orderId, token);
    expect(jsonBody<{ code: string }>(refused).code).toBe("orders.customer_cancel.too_late");

    await setCancellation(false);
    const still = await confirm(orderId, token);
    expect(jsonBody<{ code: string }>(still).code).toBe("orders.customer_cancel.too_late");

    const free = await guestOrder({ inDays: 1 });
    await confirm(free.orderId, free.token).expect(204);
  });

  it("le jeton n'ouvre pas `GET /orders/:id`", async () => {
    const { orderId, token } = await guestOrder();
    const response = await ctx
      .http()
      .get(`/orders/${orderId}`)
      .set("Authorization", `Bearer ${token}`);
    // Le jeton présenté comme porteur n'est le `sub` de personne qui ait
    // passé cette commande : le mur des commandes répond comme à un étranger.
    expect(response.status).toBe(404);
  });

  it("débits distincts : le 6ᵉ confirm d'une IP est refusé, la lecture garde son seau", async () => {
    const { orderId, token } = await guestOrder();
    const sameIp = visitor();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sameIp.post("/shop/orders/cancellation/confirm").send({ orderId, token: "faux" });
    }
    await sameIp.post("/shop/orders/cancellation/confirm").send({ orderId, token }).expect(429);
    await sameIp.post("/shop/orders/cancellation/view").send({ orderId, token }).expect(200);
  });
});
