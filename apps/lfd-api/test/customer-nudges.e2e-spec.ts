/**
 * **Les deux relances d'un retrait en retard** (Supervision, 2026-10-25) —
 * « Rappel au client » et « Avertir le client », sur le vrai Postgres,
 * mailer et horloge doublés.
 *
 * Ce que seul le vrai chemin prouve : la trace s'écrit sur la commande (et
 * le CHECK l'accepte), un second geste est refusé en 409 nommé, le délai
 * réglé après la fin du créneau est lu au réglage et appliqué au serveur,
 * le bon courriel part, et la Supervision relit qui a fait quoi.
 */
import { localToInstant, type CustomerNudgesView } from "@lfd/contracts";

import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closeOrder,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { accountOrder } from "./shortfall-decision-scene.js";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly idempotencyKey?: string;
  readonly data: unknown;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

const MINUTE_MS = 60_000;
const clock = new FixedClock(new Date());
let ctx: E2eContext;

/** La fin du créneau par défaut des commandes de test (07:00 – 08:00), à Paris. */
function slotEnd(): Date {
  const end = localToInstant(SERVICE_DAY, "08:00");
  if (end === null) {
    throw new Error(`Fin de créneau illisible le ${SERVICE_DAY}.`);
  }
  return end;
}

const afterEnd = (minutes: number): Date => new Date(slotEnd().getTime() + minutes * MINUTE_MS);

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    { token: MAILER, value: recordingMailer },
    { token: Clock, value: clock },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
  sentMails.splice(0);
});

async function gesture(
  orderId: string,
  path: "pickup-reminder" | "delay-warning",
): Promise<{ status: number; code: unknown }> {
  const response = await ctx.asSub(STAFF).post(`/admin/orders/${orderId}/${path}`).send({});
  await ctx.drain();
  const body: unknown = response.body;
  const code = typeof body === "object" && body !== null && "code" in body ? body.code : null;
  return { status: response.status, code };
}

async function nudges(): Promise<CustomerNudgesView> {
  return jsonBody<CustomerNudgesView>(
    await ctx
      .asSub(STAFF)
      .get(`/admin/supervision/customer-nudges?date=${SERVICE_DAY}`)
      .expect(200),
  );
}

const mailsOf = (template: string): readonly SentMail[] =>
  sentMails.filter((mail) => mail.template === template);

/** Une commande au retrait, prête (les trois croissants au sac, déclarée prête). */
async function readyOrder(): Promise<{ readonly id: string; readonly orderNumber: string }> {
  const order = await accountOrder(ctx, 3);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  return order;
}

describe("« Rappel au client »", () => {
  it("part une fois, se trace sur la commande, et la Supervision le relit", async () => {
    const order = await readyOrder();
    clock.set(afterEnd(5));

    expect(await gesture(order.id, "pickup-reminder")).toMatchObject({ status: 204 });

    const reminders = sentMails.filter(
      (mail) => mail.idempotencyKey === `order.pickup-reminder:${order.id}`,
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      template: "customer.order-ready",
      data: { reminder: true },
    });
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.pickupRemindedAt?.toISOString()).toBe(afterEnd(5).toISOString());
    expect(row.pickupRemindedByStaffId).not.toBeNull();
    expect(row.delayWarnedAt).toBeNull();

    const view = await nudges();
    expect(view.orders).toHaveLength(1);
    expect(view.orders[0]).toMatchObject({
      orderId: order.id,
      pickupReminder: { at: afterEnd(5).toISOString() },
      delayWarning: null,
    });
    expect(typeof view.orders[0]?.pickupReminder?.byName).toBe("string");

    expect(await gesture(order.id, "pickup-reminder")).toEqual({
      status: 409,
      code: "orders.pickup_reminder.already_sent",
    });
    expect(
      sentMails.filter((mail) => mail.idempotencyKey === `order.pickup-reminder:${order.id}`),
    ).toHaveLength(1);
  });

  it("🔴 est refusé avant le délai réglé, lu au réglage du commerce", async () => {
    const order = await readyOrder();
    await ctx
      .asSub(STAFF)
      .patch("/admin/order-cutoff-settings")
      .send({ pickupReminderDelayMinutes: 30 })
      .expect(204);
    clock.set(afterEnd(29));

    expect(await gesture(order.id, "pickup-reminder")).toEqual({
      status: 409,
      code: "orders.pickup_reminder.too_early",
    });
    expect((await nudges()).pickupReminderDelayMinutes).toBe(30);

    clock.set(afterEnd(30));
    expect((await gesture(order.id, "pickup-reminder")).status).toBe(204);
  });

  it("🔴 est refusé sur une commande pas prête : c'est « Avertir le client »", async () => {
    const waiting = await accountOrder(ctx, 0);
    clock.set(afterEnd(1));

    expect(await gesture(waiting.id, "pickup-reminder")).toEqual({
      status: 409,
      code: "orders.handover.reminder_refused",
    });
  });
});

describe("« Avertir le client »", () => {
  it("part une fois sur une commande pas prête, et se trace", async () => {
    const order = await accountOrder(ctx, 0);
    clock.set(afterEnd(10));

    expect(await gesture(order.id, "delay-warning")).toMatchObject({ status: 204 });

    const delayed = mailsOf("customer.order-delayed");
    expect(delayed).toHaveLength(1);
    expect(delayed[0]).toMatchObject({
      idempotencyKey: `order.delay-warning:${order.id}`,
      data: { reference: order.orderNumber },
    });
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.delayWarnedAt?.toISOString()).toBe(afterEnd(10).toISOString());
    expect(row.delayWarnedByStaffId).not.toBeNull();

    expect(await gesture(order.id, "delay-warning")).toEqual({
      status: 409,
      code: "orders.delay_warning.already_sent",
    });
    expect(mailsOf("customer.order-delayed")).toHaveLength(1);
  });

  it("est refusé avant la fin du créneau", async () => {
    const order = await accountOrder(ctx, 0);
    clock.set(afterEnd(-1));

    expect(await gesture(order.id, "delay-warning")).toEqual({
      status: 409,
      code: "orders.delay_warning.too_early",
    });
  });

  it("est refusé sur une commande prête : c'est un rappel qu'il faut", async () => {
    const ready = await readyOrder();
    clock.set(afterEnd(1));
    expect(await gesture(ready.id, "delay-warning")).toEqual({
      status: 409,
      code: "orders.delay_warning.refused",
    });
    expect(mailsOf("customer.order-delayed")).toEqual([]);
  });
});

describe("le réglage des délais", () => {
  it("refuse un délai négatif en 400 nommé, sans rien poser", async () => {
    const response = await ctx
      .asSub(STAFF)
      .patch("/admin/order-cutoff-settings")
      .send({ delayWarningDelayMinutes: -5 });

    expect(response.status).toBe(400);
    expect((response.body as { code?: unknown }).code).toBe(
      "order_cutoff_settings.invalid_nudge_delay",
    );
    expect((await nudges()).delayWarningDelayMinutes).toBe(0);
  });
});
