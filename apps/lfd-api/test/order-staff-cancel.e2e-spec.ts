/**
 * E2E de **l'annulation d'une commande par l'équipe** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C3) — les gestes,
 * les refus nommés, Stripe, le bon, le courriel, le journal, le droit.
 *
 * Les courses (double clic, deux membres de l'équipe, clôture, retirage,
 * transaction rejouée) sont dans `order-staff-cancel-races.e2e-spec.ts`.
 */
import { randomUUID } from "node:crypto";

import type { AdminOrderView, PlacedOrderResponse, RoleGrant } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";
import type request from "supertest";

import { ConvertLoyaltyPointsCommand } from "../src/b2b/loyalty/application/commands/convert-loyalty-points.command.js";
import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { OrderRepository } from "../src/b2b/orders/domain/ports/order.repository.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { OrderWithdrawalDesk, ServiceDay } from "../src/production/channels/commerce/index.js";
import {
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  bootScene,
  cancelledMails,
  cancelRequest,
  DAY,
  deliver,
  orderState,
  REASON,
  resetScene,
  scene,
  withdrawals,
} from "./order-staff-cancel-scene.js";
import { seedFreeOrder, seedOrder } from "./order-staff-cancel-orders.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

const codeOf = (response: request.Response) => jsonBody<{ readonly code: string }>(response).code;

describe("POST /admin/orders/:id/cancel — carte non payée (décision 7)", () => {
  it("annule, ferme l'intention, retire du fournil, signe, écrit au journal et prévient le client", async () => {
    const { orderId, intent } = await seedOrder();

    const response = await cancelRequest(orderId);
    await deliver();

    expect(response.status).toBe(204);
    expect(scene.cancelledIntents).toEqual([intent]);
    const state = await orderState(orderId);
    expect(state).toMatchObject({
      status: OrderStatus.cancelled,
      paymentStatus: PaymentStatus.failed,
      cancelledBy: E2E_STAFF_ID,
      cancellationReason: REASON,
    });
    expect(state.cancelledAt).not.toBeNull();
    expect(await withdrawals()).toMatchObject([{ orderId, serviceDay: DAY }]);
    expect(cancelledMails()).toHaveLength(1);
    expect(cancelledMails()[0]?.data).toMatchObject({ regime: "due", voucher: null });
    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "order.cancelled" } });
    expect(journal).toHaveLength(1);
    expect(journal[0]?.payload).toMatchObject({ orderId, reason: REASON, regime: "due" });
  });

  it("ferme aussi l'intention d'un pro dont la carte est refusée", async () => {
    const { orderId, intent } = await seedOrder({
      clientele: OrderClientele.pro,
      payment: PaymentStatus.failed,
    });

    await cancelRequest(orderId).expect(204);

    expect(scene.cancelledIntents).toEqual([intent]);
    expect((await orderState(orderId)).status).toBe(OrderStatus.cancelled);
  });

  it("une carte sans intention s'annule sans appeler Stripe", async () => {
    const { orderId } = await seedOrder({ intent: null });

    await cancelRequest(orderId).expect(204);

    expect(scene.cancelledIntents).toEqual([]);
  });

  it("une intention déjà annulée chez Stripe laisse écrire", async () => {
    const { orderId } = await seedOrder();
    scene.cancellation = { kind: "already_cancelled" };

    await cancelRequest(orderId).expect(204);
  });

  it.each([
    // Lot C4 : la carte a abouti pendant le clic — rechargez, C4 proposera le remboursement.
    ["payée entre-temps", { kind: "already_paid" }, "orders.cancel.paid_just_now"],
    ["paiement en traitement", { kind: "in_progress" }, "orders.cancel.payment_in_progress"],
    [
      "Stripe injoignable",
      { kind: "unavailable", reason: "ECONNRESET" },
      "orders.cancel.provider_unavailable",
    ],
  ] as const)(
    "Stripe refuse (%s) : 409 nommé, la commande ne bouge pas",
    async (_, outcome, code) => {
      const { orderId } = await seedOrder();
      scene.cancellation = outcome;

      const response = await cancelRequest(orderId);

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe(code);
      expect(await orderState(orderId)).toMatchObject({
        status: OrderStatus.placed,
        paymentStatus: PaymentStatus.pending,
        cancelledBy: null,
      });
      expect(await withdrawals()).toEqual([]);
    },
  );

  it("un échec de carte qui arrive APRÈS l'annulation n'écrit rien et ne publie rien", async () => {
    const { orderId, intent } = await seedOrder();
    await cancelRequest(orderId).expect(204);
    await deliver();

    await ctx.app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(intent ?? "", "failed"));
    await deliver();

    expect((await orderState(orderId)).status).toBe(OrderStatus.cancelled);
    expect(scene.mails.map((mail) => mail.template)).toEqual(["customer.order-cancelled"]);
  });
});

describe("POST /admin/orders/:id/cancel — total nul", () => {
  it("s'annule sans Stripe ; le règlement reste « non requis »", async () => {
    const { orderId } = await seedFreeOrder();

    await cancelRequest(orderId).expect(204);
    await deliver();

    expect(scene.cancelledIntents).toEqual([]);
    expect(await orderState(orderId)).toMatchObject({
      status: OrderStatus.cancelled,
      paymentStatus: PaymentStatus.not_required,
    });
    expect(cancelledMails()[0]?.data).toMatchObject({ regime: "free" });
  });
});

/**
 * Lot C4 : le refus `orders.cancel.paid` de C3 a disparu — une commande payée
 * par carte s'annule, avec remboursement. Ses gestes et ses refus sont éprouvés
 * par `order-staff-cancel-refund*.e2e-spec.ts`.
 */
describe("POST /admin/orders/:id/cancel — les refus nommés", () => {
  it.each([
    ["prête", { status: OrderStatus.ready }, "orders.cancel.ready"],
    ["confirmée par le plan", { status: OrderStatus.confirmed }, "orders.cancel.inscribed"],
  ] as const)("%s : 409, sans appeler Stripe", async (_, seed, code) => {
    const { orderId } = await seedOrder(seed);

    const response = await cancelRequest(orderId);

    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe(code);
    expect(scene.cancelledIntents).toEqual([]);
  });

  /**
   * Lot C5 : le refus `orders.cancel.account` de C3 a disparu — une commande
   * au compte que la comptabilité n'a pas engagée s'annule. Ses refus
   * comptables sont éprouvés par `order-account-cancel*.e2e-spec.ts`.
   */
  it("au compte, rien d'engagé : 204, sans appeler Stripe (lot C5)", async () => {
    const { orderId } = await seedOrder({ payment: PaymentStatus.not_required, intent: null });

    await cancelRequest(orderId).expect(204);

    expect(scene.cancelledIntents).toEqual([]);
    expect((await orderState(orderId)).status).toBe(OrderStatus.cancelled);
  });

  it("un motif vide : 400 qui le demande", async () => {
    const { orderId } = await seedOrder();

    const response = await cancelRequest(orderId, E2E_STAFF_SUB, "   ");

    expect(response.status).toBe(400);
    expect(codeOf(response)).toBe("orders.cancel.reason_required");
  });

  it("une commande inconnue : 404", async () => {
    await cancelRequest("commande-inconnue").expect(404);
  });

  it("sans `b2b_cancel_order:write` : 403, même avec les commandes en écriture", async () => {
    const { orderId } = await seedOrder();
    const grants: readonly RoleGrant[] = [{ resource: "b2b_orders", action: "write" }];
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/staff-roles")
      .send({ key: "commandes", label: "commandes", grants })
      .expect(201);
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "Commandes",
        email: "commandes@lfc.test",
        role: null,
        roleKey: "commandes",
        status: "active",
        auth0Id: "staff-commandes",
      },
    });

    await cancelRequest(orderId, "staff-commandes").expect(403);

    expect((await orderState(orderId)).status).toBe(OrderStatus.placed);
  });
});

describe("le bon de fidélité", () => {
  const CLIENT = "auth0|annulation-fidele";

  /** Un bon d'un palier (5 € HT), par la vraie conversion, et un point de retrait. */
  async function holderWithVoucher(): Promise<{ voucherId: string; pickupId: string }> {
    const point = await ctx.prisma.site.create({
      data: {
        label: "Le Labo",
        ligne1: "Route de la Balme",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        isDefault: true,
      },
      select: { id: true },
    });
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put("/admin/loyalty/settings")
      .send({
        pointsPerStep: 1_000,
        stepValueCents: 500,
        openToPublic: true,
        openToPro: false,
        voucherValidityDays: 365,
        welcomeBonusPoints: null,
      })
      .expect(204);
    const user = await createUser(ctx.prisma, { auth0Sub: CLIENT, firstName: "Léa" });
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/loyalty/adjustments")
      .send({ holderKind: "user", holderId: user.id, points: 1_000, reason: "reprise" })
      .expect(204);
    const voucherId = await ctx.app
      .get(CommandBus)
      .execute<ConvertLoyaltyPointsCommand, string>(
        new ConvertLoyaltyPointsCommand("user", user.id, user.id, 1, null),
      );
    return { voucherId, pickupId: point.id };
  }

  /** La vraie passation : `quantity` croissants à 2 € HT, avec le bon. */
  async function placeWithVoucher(quantity: number): Promise<{ id: string; voucherId: string }> {
    const { voucherId, pickupId } = await holderWithVoucher();
    const response = await ctx
      .asSub(CLIENT)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        fulfillmentMethod: "pickup",
        // Pas de commande sans créneau (2026-10-14).
        requestedWindow: { start: "07:00", end: "08:00" },
        pickupAddressId: pickupId,
        requestedDeliveryDate: DAY,
        note: "",
        lines: [{ sku: "VIE-001", quantity }],
        voucherId,
      })
      .expect(201);
    return { id: jsonBody<PlacedOrderResponse>(response).id, voucherId };
  }

  const voucherStatus = async (id: string) =>
    (await ctx.prisma.loyaltyVoucher.findUniqueOrThrow({ where: { id } })).status;

  it("une carte non payée qui porte un bon : le bon est rendu, une fois, et le courriel le dit", async () => {
    const { id, voucherId } = await placeWithVoucher(10);
    expect(await voucherStatus(voucherId)).toBe("reserved");

    await cancelRequest(id).expect(204);
    await cancelRequest(id).expect(409);
    await deliver();

    expect(await voucherStatus(voucherId)).toBe("available");
    expect(cancelledMails()).toHaveLength(1);
    expect(cancelledMails()[0]?.data).toMatchObject({ voucher: { outcome: "returned" } });
  });
  // Le total nul couvert par un bon (reliquat soldé à la passation) n'est plus
  // refusé depuis le lot C3b : `order-staff-cancel-voucher.e2e-spec.ts`.
});

describe("le guichet du fournil", () => {
  it("deux retraits de la même commande ne font qu'une ligne", async () => {
    const { orderId } = await seedFreeOrder();
    const desk = ctx.app.get(OrderWithdrawalDesk);
    const uow = ctx.app.get(UnitOfWork);

    const first = await uow.run(() =>
      desk.withdraw(ServiceDay.of(DAY), orderId, "before_inscription"),
    );
    const second = await uow.run(() =>
      desk.withdraw(ServiceDay.of(DAY), orderId, "before_inscription"),
    );

    expect([first, second]).toEqual(["withdrawn", "withdrawn"]);
    expect(await withdrawals()).toHaveLength(1);
  });
});

describe("S1 — le retrait ne ressuscite pas une annulée", () => {
  /** Régression : `markFulfilled` n'avait aucune condition de statut (plan d'annulation, S1). */
  it("markFulfilled sur une commande annulée rend false, et elle reste annulée", async () => {
    const { orderId, orderNumber } = await seedFreeOrder();
    await cancelRequest(orderId).expect(204);

    const written = await ctx.app
      .get(OrderRepository)
      .markFulfilled(orderNumber, new Date(), E2E_STAFF_ID, "scan", serviceDay(0), "fulfilled");

    expect(written).toBe(false);
    expect((await orderState(orderId)).status).toBe(OrderStatus.cancelled);
  });
});

describe("GET /admin/orders/:id — cancellability (C3.8)", () => {
  it("dit qu'une carte non payée s'annule, puis pourquoi elle ne s'annule plus", async () => {
    const { orderId } = await seedOrder();

    const before = jsonBody<AdminOrderView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/orders/${orderId}`).expect(200),
    );
    await cancelRequest(orderId).expect(204);
    const after = jsonBody<AdminOrderView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/orders/${orderId}`).expect(200),
    );

    expect(before.cancellability).toEqual({ cancellable: true, voucher: null, refund: null });
    expect(after.cancellability).toMatchObject({ cancellable: false });
    expect(after.cancellability).toHaveProperty(
      "reason",
      expect.stringMatching(
        /^Cette commande est déjà annulée \(le \d\d\/\d\d à \d\d:\d\d\)\.$/u,
      ) as string,
    );
  });
});
