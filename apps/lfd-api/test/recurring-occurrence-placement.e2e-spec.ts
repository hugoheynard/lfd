/**
 * E2E — **la passation d'une échéance de panier récurrent** (plan du
 * planificateur, lot R3) contre le vrai serveur : la commande passée au compte
 * avec sa provenance, une seule commande pour deux balayages, le refus nommé
 * qui n'écrit rien, et ce qui n'est pas dû.
 */
import { WORKSPACE_HEADER } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { PlaceRecurringOccurrenceCommand } from "../src/lafoliecoffee/orders/application/commands/place-recurring-occurrence.command.js";
import type { PlaceRecurringOccurrenceResult } from "../src/lafoliecoffee/orders/application/commands/place-recurring-occurrence.command.js";
import type { CreatedSubscription } from "../src/lafoliecoffee/subscriptions/domain/ports/subscription.repository.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { pickupSite } from "./order-factory.js";

const BUYER = "auth0|recurring-buyer";
/** Une semaine devant : l'horizon du planificateur (Q1). */
const DAY = serviceDay(7);

let ctx: E2eContext;
let bus: CommandBus;
let companyId = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e();
  bus = ctx.app.get(CommandBus);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = await pickupSite(ctx.prisma);
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  companyId = company.id;
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { grantedTerms: ["monthly"] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, buyer.id, companyId, CustomerRole.owner);
});

/** Un panier hebdomadaire de la société, armé depuis son premier jour. */
async function weeklyBasket(first = DAY): Promise<string> {
  const response = await ctx
    .asSub(BUYER)
    .post("/subscriptions")
    .set(INTENT_KEY, freshIntent())
    .set(WORKSPACE_HEADER, companyId)
    .send({
      fromOrderId: null,
      recurrence: "weekly",
      startDate: first,
      endDate: null,
      fulfillmentMethod: "pickup",
      deliveryAddress: null,
      pickupAddressId: pickupId,
      requestedWindow: { start: "07:00", end: "08:00" },
      lines: [{ sku: "VIE-001-1", quantity: 6 }],
      note: "Le lundi",
    })
    .expect(201);
  const id = jsonBody<CreatedSubscription>(response).id;
  await ctx.prisma.subscription.update({
    where: { id },
    data: { armedFrom: new Date(`${first}T00:00:00.000Z`) },
  });
  return id;
}

function place(subscriptionId: string, date = DAY): Promise<PlaceRecurringOccurrenceResult> {
  return bus.execute<PlaceRecurringOccurrenceCommand, PlaceRecurringOccurrenceResult>(
    new PlaceRecurringOccurrenceCommand(subscriptionId, date),
  );
}

describe("la passation d'une échéance", () => {
  it("passe la commande au compte, avec sa provenance et son créneau, et l'inscrit", async () => {
    const id = await weeklyBasket();

    const result = await place(id);

    expect(result.kind).toBe("generated");
    const order = await ctx.prisma.order.findFirstOrThrow({ where: { fromSubscriptionId: id } });
    expect(order).toMatchObject({
      companyId,
      placedByStaffId: null,
      recurringDeltas: { added: [], removed: [] },
    });
    expect(
      await ctx.prisma.subscriptionOccurrenceRun.findMany({
        where: { subscriptionId: id },
        select: { outcome: true, orderId: true },
      }),
    ).toEqual([{ outcome: "generated", orderId: order.id }]);
  });

  it("un second balayage ne passe pas une seconde commande", async () => {
    const id = await weeklyBasket();

    const results = await Promise.all([place(id), place(id)]);

    expect(results.filter((result) => result.kind === "generated")).toHaveLength(1);
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: id } })).toBe(1);
    expect((await place(id)).kind).toBe("already_closed");
  });

  it("un jour hors du rythme n'est pas dû, et rien ne s'inscrit", async () => {
    const id = await weeklyBasket();

    expect(await place(id, serviceDay(8))).toEqual({ kind: "not_due" });
    expect(await ctx.prisma.subscriptionOccurrenceRun.count()).toBe(0);
  });

  it("un panier en pause n'est pas dû", async () => {
    const id = await weeklyBasket();
    await ctx
      .asSub(BUYER)
      .patch(`/subscriptions/${id}/status`)
      .set(WORKSPACE_HEADER, companyId)
      .send({ status: "paused" })
      .expect(204);

    expect(await place(id)).toEqual({ kind: "not_due" });
  });

  it("une société sans crédit : refus nommé, aucune commande, le refus s'inscrit", async () => {
    const id = await weeklyBasket();
    await ctx.prisma.company.update({ where: { id: companyId }, data: { grantedTerms: [] } });

    const result = await place(id);

    expect(result).toMatchObject({ kind: "refused", cause: "no_settlement", newCause: true });
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: id } })).toBe(0);
    // Le même refus rejoué ne relance pas l'alerte.
    expect(await place(id)).toMatchObject({ kind: "refused", newCause: false });
  });

  it("l'acheteur parti de la société : refus nommé", async () => {
    const id = await weeklyBasket();
    await ctx.prisma.membership.deleteMany({ where: { companyId } });

    expect(await place(id)).toMatchObject({ kind: "refused", cause: "buyer_left" });
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: id } })).toBe(0);
  });

  it("trop tard pour aujourd'hui : aucune dérogation, aucune commande, l'échéance est close", async () => {
    const today = serviceDay(0);
    const id = await weeklyBasket(today);
    // Une dérogation ouverte pour ce jour : l'équipe l'aurait dépensée, pas la machine.
    const waiver = await ctx.prisma.orderCutoffWaiver.create({
      data: {
        companyId,
        fulfillmentDate: new Date(`${today}T00:00:00.000Z`),
        reason: "Livraison exceptionnelle",
        grantedByStaffId: E2E_STAFF_ID,
      },
    });

    const result = await place(id, today);

    expect(result.kind === "missed_deadline" || result.kind === "refused").toBe(true);
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: id } })).toBe(0);
    expect(
      await ctx.prisma.orderCutoffWaiver.findUniqueOrThrow({ where: { id: waiver.id } }),
    ).toMatchObject({ usedByOrderId: null, usedAt: null });
  });
});
