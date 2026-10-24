/**
 * E2E de **l'annulation par le client connecté** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, lot C6,
 * C6.10) — le mur, le réglage, l'argent, le journal et le courriel, la course
 * avec la clôture. L'invité est dans `order-guest-cancel.e2e-spec.ts`.
 *
 * Non-régression du noyau : les suites `order-staff-cancel*` tournent
 * inchangées sur le même `OrderCancellation`.
 */
import type { CustomerOrderDetailView } from "@lfd/contracts";
import type request from "supertest";

import {
  CompanyStatus,
  CustomerRole,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { daysAgo, E2E_STAFF_SUB, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  bootCustomerScene,
  company,
  customer,
  customerCancel,
  member,
  seedCustomerOrder,
  setCancellation,
} from "./order-customer-cancel-scene.js";
import {
  cancelledMails,
  deliver,
  resetScene,
  scene,
  withdrawals,
} from "./order-staff-cancel-scene.js";
import { seedOrder } from "./order-staff-cancel-orders.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootCustomerScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

const codeOf = (response: request.Response) => jsonBody<{ readonly code: string }>(response).code;

const cancelColumns = (orderId: string) =>
  ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      cancelledBy: true,
      cancelledByKind: true,
      cancelledByUserId: true,
      cancellationReason: true,
      cancellationReasonCode: true,
    },
  });

/** Une commande de société, et un membre ACCEPTÉ de cette société. */
async function proOrder(
  role: CustomerRole = CustomerRole.orders,
  payment: PaymentStatus = PaymentStatus.pending,
) {
  const companyId = await company();
  const author = await customer();
  await member(author.id, companyId);
  const other = await customer();
  await member(other.id, companyId, { role });
  const order = await seedCustomerOrder({ placedByUserId: author.id, companyId, payment });
  return { companyId, author, other, ...order };
}

describe("le mur (C6.2)", () => {
  it("membre `orders` d'une société : 204, même sur la commande d'un autre membre (Q-C6.3)", async () => {
    const { other, orderId } = await proOrder();
    await customerCancel(other.sub, orderId).expect(204);
    expect(await cancelColumns(orderId)).toMatchObject({
      status: OrderStatus.cancelled,
      cancelledBy: null,
      cancelledByKind: "customer",
      cancelledByUserId: other.id,
    });
  });

  it("membre `billing` : 204 (Q-C6.2)", async () => {
    const { other, orderId } = await proOrder(CustomerRole.billing);
    await customerCancel(other.sub, orderId).expect(204);
  });

  it("membre d'une AUTRE société : 404, jamais 403", async () => {
    const { orderId } = await proOrder();
    const stranger = await customer();
    await member(stranger.id, await company());
    const response = await customerCancel(stranger.sub, orderId);
    expect(response.status).toBe(404);
    expect((await cancelColumns(orderId)).status).toBe(OrderStatus.placed);
  });

  /**
   * B2 : le mur exige un rattachement ACCEPTÉ. Une invitation PÉRIMÉE non
   * acceptée ne l'est jamais — 404. Une invitation VIVANTE, elle, est acceptée
   * par la résolution du `Principal` à la première requête
   * (`MembershipAcceptance.acceptLive`, lu le 2026-10-13) : le cas « vivante
   * non acceptée » n'atteint jamais le mur par HTTP, et se tient au test de
   * l'adaptateur et du handler.
   */
  it("invitation PÉRIMÉE non acceptée : 404 (B2)", async () => {
    const { companyId, orderId } = await proOrder();
    const invited = await customer();
    // Une entrée ailleurs, pour que la personne passe la porte d'entrée.
    await member(invited.id, await company());
    await ctx.prisma.membership.create({
      data: {
        userId: invited.id,
        companyId,
        role: CustomerRole.orders,
        invitedAt: new Date(daysAgo(30)),
        acceptedAt: null,
      },
    });
    await customerCancel(invited.sub, orderId).expect(404);
  });

  it("invitation VIVANTE : acceptée à la première requête, elle annule (204)", async () => {
    const { companyId, orderId } = await proOrder();
    const invited = await customer();
    await member(invited.id, companyId, { accepted: false });
    await customerCancel(invited.sub, orderId).expect(204);
    const membership = await ctx.prisma.membership.findFirstOrThrow({
      where: { userId: invited.id, companyId },
      select: { acceptedAt: true },
    });
    expect(membership.acceptedAt).not.toBeNull();
  });

  it.each([CompanyStatus.suspended, CompanyStatus.terminated])(
    "société %s : refus (B2), la commande reste",
    async (status) => {
      const { companyId, other, orderId } = await proOrder();
      await ctx.prisma.company.update({ where: { id: companyId }, data: { status } });
      await customerCancel(other.sub, orderId).expect(404);
      expect((await cancelColumns(orderId)).status).toBe(OrderStatus.placed);
    },
  );

  /**
   * Relu le 2026-10-21 (lot C1 de `plan-commandes-des-sites.md`) : le sens
   * NE change PAS — ce membre est `orders` du principal (défaut de `member`),
   * et `orders`/`billing` n'héritent de rien (§7.8). L'`owner`/`admin` du
   * principal, lui, annule désormais : `site-orders-from-principal.e2e-spec.ts`.
   */
  it("membre `orders` de la société mère sans rattachement au site : 404", async () => {
    const parentId = await company();
    const site = await ctx.prisma.company.update({
      where: { id: await company() },
      data: { parentCompanyId: parentId },
    });
    const parentMember = await customer();
    await member(parentMember.id, parentId);
    const author = await customer();
    await member(author.id, site.id);
    const { orderId } = await seedCustomerOrder({ placedByUserId: author.id, companyId: site.id });
    await customerCancel(parentMember.sub, orderId).expect(404);
  });

  it("un particulier sur la commande d'un autre particulier : 404", async () => {
    await setCancellation(true);
    const author = await customer();
    const other = await customer();
    const { orderId } = await seedCustomerOrder({ placedByUserId: author.id });
    await customerCancel(other.sub, orderId).expect(404);
  });
});

describe("le réglage des particuliers (C6.3, C6.5)", () => {
  /**
   * Décision de Hugo du 2026-10-13 : il n'y a plus de réglage « fermé ». Le
   * délai est ACTIF par défaut ; désactivé, seul l'arrêt du plan de
   * production limite un particulier, comme un pro.
   */
  it("délai actif par défaut : `too_late` à J+1 ; désactivé, la même commande s'annule", async () => {
    const author = await customer();
    const soon = await seedCustomerOrder({ placedByUserId: author.id, inDays: 1 });
    const refused = await customerCancel(author.sub, soon.orderId);
    expect(refused.status).toBe(409);
    expect(codeOf(refused)).toBe("orders.customer_cancel.too_late");

    await setCancellation(false);
    await customerCancel(author.sub, soon.orderId).expect(204);
  });

  it("un pro n'a pas de délai, même actif", async () => {
    await setCancellation(true, 168);
    const pro = await proOrder();
    await customerCancel(pro.other.sub, pro.orderId).expect(204);
  });

  it("délai imposé dépassé : `too_late` avec l'heure ; délai tenu : 204", async () => {
    await setCancellation(true, 48);
    const author = await customer();
    const soon = await seedCustomerOrder({ placedByUserId: author.id, inDays: 1 });
    const late = await customerCancel(author.sub, soon.orderId);
    expect(late.status).toBe(409);
    expect(codeOf(late)).toBe("orders.customer_cancel.too_late");
    expect(jsonBody<{ message: string }>(late).message).toMatch(
      /jusqu'au \d{2}\/\d{2} à \d{2}:\d{2}/u,
    );

    const later = await seedCustomerOrder({ placedByUserId: author.id, inDays: 7 });
    await customerCancel(author.sub, later.orderId, { reasonCode: "wrong_date" }).expect(204);
  });

  it("la route admin lit et pose le réglage, l'auteur figé ; un délai hors borne est un 400", async () => {
    await setCancellation(true, 12);
    const view = await ctx.asSub(E2E_STAFF_SUB).get("/admin/customer-cancellation").expect(200);
    expect(view.body).toMatchObject({ delayEnabled: true, hoursBefore: 12 });
    expect(jsonBody<{ updatedBy: string | null }>(view).updatedBy).not.toBeNull();
    await ctx
      .asSub(E2E_STAFF_SUB)
      .patch("/admin/customer-cancellation")
      .send({ hoursBefore: 169 })
      .expect(400);
  });
});

describe("le geste (C6.6, C6.9)", () => {
  it("un fait, un courriel « vous avez annulé », le journal cite le client, la cloche sonne", async () => {
    await setCancellation(true);
    const author = await customer();
    const { orderId } = await seedCustomerOrder({ placedByUserId: author.id });

    await customerCancel(author.sub, orderId, {
      reasonCode: "other",
      reasonText: "Imprévu",
    }).expect(204);
    await deliver();

    expect(await cancelColumns(orderId)).toMatchObject({
      cancelledBy: null,
      cancelledByKind: "customer",
      cancelledByUserId: author.id,
      cancellationReason: "Imprévu",
      cancellationReasonCode: "other",
    });
    expect(scene.cancelledIntents).toHaveLength(1);
    expect(await withdrawals()).toHaveLength(1);
    expect(cancelledMails()).toHaveLength(1);
    expect(cancelledMails()[0]?.data).toMatchObject({ author: { kind: "self" } });
    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "order.cancelled" } });
    expect(journal[0]?.payload).toMatchObject({ cancelledBy: null, cancelledByKind: "customer" });
    const bell = await ctx.prisma.staffNotification.findMany({
      where: { kind: "order.cancelled_by_customer" },
    });
    expect(bell).toHaveLength(1);
  });

  it("payée : la demande de remboursement n'a pas d'auteur staff", async () => {
    const pro = await proOrder(CustomerRole.orders, PaymentStatus.paid);
    await customerCancel(pro.other.sub, pro.orderId).expect(204);
    const request = await ctx.prisma.orderRefundRequest.findUniqueOrThrow({
      where: { orderId: pro.orderId },
    });
    expect(request.requestedBy).toBeNull();
  });

  it("second clic : `already_cancelled`", async () => {
    const pro = await proOrder();
    await customerCancel(pro.other.sub, pro.orderId).expect(204);
    const again = await customerCancel(pro.other.sub, pro.orderId);
    expect(again.status).toBe(409);
    expect(codeOf(again)).toBe("orders.customer_cancel.already_cancelled");
  });

  it("GET /orders/:id dit l'annulabilité, et le mur d'annulation y vaut `not_allowed`", async () => {
    const pro = await proOrder();
    const visible = await ctx.asSub(pro.other.sub).get(`/orders/${pro.orderId}`).expect(200);
    expect(jsonBody<CustomerOrderDetailView>(visible).cancellability).toMatchObject({
      cancellable: true,
      until: null,
      money: { kind: "nothing_charged" },
    });

    // Société suspendue : la commande se VOIT encore, elle ne s'annule plus (B2).
    await ctx.prisma.company.update({
      where: { id: pro.companyId },
      data: { status: CompanyStatus.suspended },
    });
    const seen = await ctx.asSub(pro.other.sub).get(`/orders/${pro.orderId}`).expect(200);
    expect(jsonBody<CustomerOrderDetailView>(seen).cancellability).toMatchObject({
      cancellable: false,
      code: "not_allowed",
    });
  });
});

describe("la course avec la clôture (C3.4, acteur client)", () => {
  const DAY = serviceDay();
  const closeDay = () => ctx.asSub(E2E_STAFF_SUB).post(`/admin/production/batch/${DAY}/close`);
  /** Une commande pro au compte : producible, donc inscrite par la clôture. */
  function freeProOrder() {
    return proOrder(CustomerRole.orders, PaymentStatus.not_required);
  }

  it("clôturée d'abord : le client reçoit « en préparation », sans mot du fournil", async () => {
    await seedOrder({ payment: PaymentStatus.paid });
    const pro = await freeProOrder();
    await closeDay().expect(201);
    await deliver();

    const response = await customerCancel(pro.other.sub, pro.orderId);

    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe("orders.customer_cancel.in_preparation");
    expect(jsonBody<{ message: string }>(response).message).not.toMatch(/fournil/u);
  });

  it("annulée entre la lecture de la clôture et son verrou : absente du compte à produire", async () => {
    const paid = await seedOrder({ payment: PaymentStatus.paid });
    const pro = await freeProOrder();
    scene.afterProducibleRead = async () => {
      await customerCancel(pro.other.sub, pro.orderId).expect(204);
    };

    const response = await closeDay();
    await deliver();

    expect(response.status).toBe(201);
    expect(
      await ctx.prisma.productionOrder.findMany({
        where: { serviceDay: DAY },
        select: { orderId: true },
      }),
    ).toEqual([{ orderId: paid.orderId }]);
    const state = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: pro.orderId },
      select: { status: true },
    });
    expect(state.status).toBe(OrderStatus.cancelled);
  });
});
