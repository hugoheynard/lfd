import type { CustomerCancellationStage } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { PackingWithdrawalOutcome } from "../../../../../packing/channels/commerce/index.js";
import type { OrderWithdrawalOutcome } from "../../../../../production/channels/commerce/index.js";
import type { CancellationSubject } from "../../../domain/ports/cancellation-subject.reader.js";
import { CancellationAllowanceGate } from "../../services/cancellation-allowance-gate.js";
import { CancellationRefundRequester } from "../../services/cancellation-refund-requester.js";
import { CancellationRule } from "../../services/cancellation-rule.js";
import { OrderCancellation } from "../../services/order-cancellation.service.js";
import { VoucherRestitutionRefusal } from "../../services/voucher-restitution-refusal.js";
import { CancelOrderCommand } from "../cancel-order.command.js";
import { CancelOrderHandler } from "../cancel-order.handler.js";
import {
  cancellationSubject,
  FixedInscriptions,
  FixedSubjects,
  InMemoryCancellations,
  RecordingNoteVoiding,
  ScriptedCancelGateway,
  ScriptedDesk,
  ScriptedPackingDesk,
  workshops,
  ScriptedEngagements,
} from "./cancellation-doubles.js";
import { FixedCancellationSettings } from "./customer-cancellation-doubles.js";
import { RecordingDurable } from "./durable-doubles.js";
import { InMemoryRefundRequests, RecordingDispatch, RefundStore } from "./refund-doubles.js";
import { RecordingRedemption, RETURNED } from "./voucher-doubles.js";

/**
 * L'autorisation du plan A1, calculée une fois par le noyau (A1.1), et ce
 * qu'elle ouvre depuis A1.2 : une commande de retrait inscrite se retire du
 * fournil, puis du colisage — dans cet ordre, sous l'ordre des verrous du
 * § 2.4.
 */

/** Recopié dans l'écriture, jamais comparé à l'horloge. */
const NOW = new Date(0);

function scene(input: {
  readonly stage: CustomerCancellationStage;
  readonly desk?: OrderWithdrawalOutcome;
  readonly packing?: PackingWithdrawalOutcome;
  readonly subject?: Partial<CancellationSubject>;
}) {
  const trace: string[] = [];
  const subject = cancellationSubject(input.subject ?? {});
  const subjects = new FixedSubjects(subject);
  const engagements = new ScriptedEngagements({ kind: "free" }, trace);
  const rule = new CancellationRule(engagements);
  const settings = new FixedCancellationSettings({ b2cCancellableUntil: input.stage });
  const rows = new InMemoryCancellations(subject, trace);
  const bakery = new ScriptedDesk(input.desk ?? "withdrawn", trace);
  const packing = new ScriptedPackingDesk(input.packing ?? "withdrawn", trace);
  const durable = new RecordingDurable();
  const handler = new CancelOrderHandler(
    new OrderCancellation(
      subjects,
      rows,
      new ScriptedCancelGateway({ kind: "cancelled" }, trace),
      workshops(bakery, packing),
      new RecordingRedemption(false, RETURNED),
      new VoucherRestitutionRefusal(subjects, new FixedInscriptions(), rule),
      rule,
      new CancellationAllowanceGate(settings),
      engagements,
      new CancellationRefundRequester(
        new InMemoryRefundRequests(new RefundStore()),
        new RecordingDispatch(),
      ),
      durable,
      new RecordingNoteVoiding(trace),
      new DirectUnitOfWork(),
      new FixedClock(NOW),
    ),
  );
  return { handler, trace, settings, rows, bakery, packing, durable };
}

const cancel = () => new CancelOrderCommand("ord_1", "fiche-marie", "Le client a rappelé");

describe("OrderCancellation — l'autorisation du plan A1", () => {
  it("étape production_plan, commande inscrite : refusée, et le colisage n'est pas appelé", async () => {
    const { handler, trace, bakery } = scene({ stage: "production_plan", desk: "inscribed" });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.inscribed",
    });
    expect(bakery.allowances).toEqual(["before_inscription"]);
    expect(trace).not.toContain("cancel:ord_1");
    expect(trace.some((step) => step.startsWith("packing:"))).toBe(false);
  });

  it("étape ready, retrait inscrit : fournil, PUIS colisage, PUIS écriture (§ 2.4)", async () => {
    const { handler, trace, rows, bakery, packing } = scene({
      stage: "ready",
      desk: "withdrawn_after_inscription",
      subject: { status: "confirmed" },
    });

    await handler.execute(cancel());

    expect(bakery.allowances).toEqual(["before_packing"]);
    expect(packing.calls).toEqual([{ day: "2026-10-13", orderId: "ord_1", by: "fiche-marie" }]);
    const order = [
      "lock:ord_1",
      "withdraw:2026-10-13:ord_1",
      "packing:2026-10-13:ord_1",
      "cancel:ord_1",
    ];
    expect(trace.filter((step) => order.includes(step))).toEqual(order);
    expect(rows.records).toHaveLength(1);
  });

  it("étape ready, livraison inscrite : `delivery_after_plan` avant tout guichet", async () => {
    const { handler, trace } = scene({
      stage: "ready",
      subject: { status: "confirmed", fulfillmentMethod: "delivery" },
    });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.delivery_after_plan",
    });
    expect(trace).toEqual([]);
  });

  it("étape ready, livraison que le fournil dit inscrite : le fournil est appelé sous `before_inscription`", async () => {
    const { handler, bakery, packing } = scene({
      stage: "ready",
      desk: "inscribed",
      subject: { fulfillmentMethod: "delivery" },
    });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.delivery_after_plan",
    });
    expect(bakery.allowances).toEqual(["before_inscription"]);
    expect(packing.calls).toEqual([]);
  });

  it.each([
    ["packed", "orders.cancel.packed"],
    ["delivery_bin", "orders.cancel.delivery_bin"],
  ] as const)("le colisage répond « %s » : refus, rien n'est écrit", async (outcome, code) => {
    const { handler, rows } = scene({
      stage: "ready",
      desk: "withdrawn_after_inscription",
      packing: outcome,
      subject: { status: "confirmed" },
    });

    await expect(handler.execute(cancel())).rejects.toMatchObject({ code });
    expect(rows.records).toEqual([]);
  });

  it("étape ready, commande devenue prête : « prête », avant tout guichet", async () => {
    const { handler, trace } = scene({ stage: "ready", subject: { status: "ready" } });

    await expect(handler.execute(cancel())).rejects.toMatchObject({ code: "orders.cancel.ready" });
    expect(trace).toEqual([]);
  });

  it("une commande de société inscrite reste refusée, réglage « prête » ou non (Q1)", async () => {
    const { handler, bakery } = scene({
      stage: "ready",
      desk: "inscribed",
      subject: { companyId: "co_1" },
    });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.inscribed",
    });
    expect(bakery.allowances).toEqual(["before_inscription"]);
  });

  /**
   * Plan A1, § 1 point 5 : l'écriture conditionnée ne trouve rien (un état que
   * le `where` refuse, sans que la règle sache le nommer) — `state_changed`,
   * et la transaction défait les retraits.
   */
  it("l'écriture ne franchit pas : `state_changed`", async () => {
    const { handler, rows } = scene({
      stage: "ready",
      desk: "withdrawn_after_inscription",
      subject: { status: "confirmed" },
    });
    rows.refuseWrite = true;

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.state_changed",
    });
  });

  it("étape ready, commande non inscrite : annulée comme avant", async () => {
    const { handler, rows, durable } = scene({ stage: "ready" });

    await handler.execute(cancel());

    expect(rows.records).toHaveLength(1);
    expect(cancelledPayload(durable)).toMatchObject({
      afterInscription: false,
      stageApplied: "ready",
    });
  });

  it("lot A1.3 : retirée après l'arrêt, le fait `order.cancelled` le dit", async () => {
    const { handler, durable } = scene({
      stage: "ready",
      desk: "withdrawn_after_inscription",
      subject: { status: "confirmed" },
    });

    await handler.execute(cancel());

    expect(cancelledPayload(durable)).toMatchObject({
      afterInscription: true,
      stageApplied: "ready",
    });
  });

  it("lot A1.3 : sous l'étape « arrêt du plan », le fait dit `production_plan`", async () => {
    const { handler, durable } = scene({ stage: "production_plan" });

    await handler.execute(cancel());

    expect(cancelledPayload(durable)).toMatchObject({
      afterInscription: false,
      stageApplied: "production_plan",
    });
  });

  it("lit le réglage UNE fois pour une commande personnelle, relecture sous verrou comprise", async () => {
    const { handler, settings } = scene({ stage: "ready" });

    await handler.execute(cancel());

    expect(settings.reads).toBe(1);
  });

  it("ne lit pas le réglage pour une commande de société : un pro n'est pas concerné", async () => {
    const { handler, settings } = scene({ stage: "ready", subject: { companyId: "co_1" } });

    await handler.execute(cancel());

    expect(settings.reads).toBe(0);
  });
});

/** La charge du fait `order.cancelled` publié. */
function cancelledPayload(
  durable: RecordingDurable,
): Readonly<Record<string, unknown>> | undefined {
  return durable.facts.find((fact) => fact.type === "order.cancelled")?.payload;
}
