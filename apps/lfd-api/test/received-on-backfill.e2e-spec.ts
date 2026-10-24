/**
 * **La reprise des dates de réception** (plan
 * `documentation/commandes/plan-date-de-reception.md`, §8) — le cœur du script
 * `ops:received-on-backfill`, contre le vrai Postgres : la simulation n'écrit
 * rien, `--apply` date par le bus, un second passage ne change rien, et les
 * contrôles « après » rendent zéro. Une date sans remise est listée, pas réparée.
 *
 * Les instants sont le SUJET : ils ne sont comparés qu'au jour qu'ils donnent,
 * jamais à l'horloge.
 */
import { CommandBus } from "@nestjs/cqrs";

import { OrderHandoverHistoryReader } from "../src/handover/channels/commerce/index.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import {
  afterIsClean,
  runReceivedOnBackfill,
  type BackfillDeps,
} from "../prisma/ops/received-on-backfill.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

/** Remise à 00h30 le 1er novembre à Paris — le 31 octobre en UTC. */
const HANDED_OVER_AT = new Date("2026-10-31T23:30:00.000Z");
const ALREADY_DATED = "2026-10-02";

let ctx: E2eContext;
let deps: BackfillDeps;
let sequence = 0;
const lines: string[] = [];

beforeAll(async () => {
  ctx = await bootstrapE2e();
  deps = {
    prisma: ctx.prisma,
    commands: ctx.app.get(CommandBus),
    handovers: ctx.app.get(OrderHandoverHistoryReader),
    log: (line) => lines.push(line),
  };
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  lines.length = 0;
});

async function order(handedOverAt: Date | null, receivedOn: string | null): Promise<string> {
  sequence += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `auth0|reprise-${String(sequence)}` });
  const row = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-REPRISE-${String(sequence)}`,
      placedByUserId: user.id,
      clientele: OrderClientele.public,
      status: handedOverAt === null ? OrderStatus.ready : OrderStatus.fulfilled,
      subtotalCents: 1_000,
      totalCents: 1_000,
      paymentStatus: PaymentStatus.paid,
      handedOverAt,
      receivedOn: receivedOn === null ? null : new Date(`${receivedOn}T00:00:00.000Z`),
    },
    select: { id: true },
  });
  return row.id;
}

async function receivedOn(orderId: string): Promise<string | null> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { receivedOn: true },
  });
  return row.receivedOn?.toISOString().slice(0, 10) ?? null;
}

describe("ops:received-on-backfill — la reprise des dates de réception", () => {
  it("en simulation : compte et liste, n'écrit rien", async () => {
    const undated = await order(HANDED_OVER_AT, null);

    const report = await runReceivedOnBackfill(deps, false);

    expect(report.before.pending).toHaveLength(1);
    expect(report.before.withoutHandover).toHaveLength(1);
    expect(report.after).toBeNull();
    expect(await receivedOn(undated)).toBeNull();
    expect(lines.some((line) => line.startsWith("SIMULATION"))).toBe(true);
  });

  /**
   * Régression (2026-10-24) : la reprise par `RecordOrderDeliveryDayCommand`
   * laissait sans date une commande remise sans ligne `order_handover`.
   */
  it("une commande remise sans attestation de retrait restait sans date après la reprise", async () => {
    const undated = await order(HANDED_OVER_AT, null);
    const dated = await order(HANDED_OVER_AT, ALREADY_DATED);

    const report = await runReceivedOnBackfill(deps, true);

    expect(await receivedOn(undated)).toBe("2026-11-01");
    expect(await receivedOn(dated)).toBe(ALREADY_DATED);
    expect(report.after).not.toBeNull();
    expect(report.after?.movedDates).toEqual([]);
    expect(report.after !== null && afterIsClean(report.after)).toBe(true);
  });

  it("rejouée : rien à dater, rien ne bouge, les contrôles restent à zéro", async () => {
    const undated = await order(HANDED_OVER_AT, null);
    await runReceivedOnBackfill(deps, true);

    const second = await runReceivedOnBackfill(deps, true);

    expect(second.before.pending).toEqual([]);
    expect(second.dated).toBe(0);
    expect(await receivedOn(undated)).toBe("2026-11-01");
    expect(second.after !== null && afterIsClean(second.after)).toBe(true);
  });

  it("une date sans remise est listée, jamais réparée, et fait échouer les contrôles", async () => {
    const orphan = await order(null, ALREADY_DATED);

    const report = await runReceivedOnBackfill(deps, true);

    expect(report.before.datedWithoutHandover).toHaveLength(1);
    expect(report.after?.datedWithoutHandover).toHaveLength(1);
    expect(report.after !== null && afterIsClean(report.after)).toBe(false);
    expect(await receivedOn(orphan)).toBe(ALREADY_DATED);
  });
});
