import { backorderAbandonmentScene } from "../../../../backorder/application/__tests__/backorder-abandonment-doubles.js";
import { FixedHandoverHistory } from "../../../../application/commands/__tests__/handover-history-double.js";
import { Backorder } from "../../../../backorder/domain/entities/backorder.js";
import { BackorderLine } from "../../../../backorder/domain/value-objects/backorder-line.js";
import { increaseCancellation } from "../../../../revision/application/commands/__tests__/card-increase-scene.js";
import { DirectUnitOfWork } from "../../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import type { OrderWithdrawalOutcome } from "../../../../../../production/channels/commerce/index.js";
import { OrderNotCancellableError } from "../../../domain/errors/order-cancellation-errors.js";
import { CancellationRefundRequester } from "../../services/cancellation-refund-requester.js";
import { CancellationAllowanceGate } from "../../services/cancellation-allowance-gate.js";
import { FixedCancellationSettings } from "./customer-cancellation-doubles.js";
import { CancellationRule } from "../../services/cancellation-rule.js";
import { OrderCancellation } from "../../services/order-cancellation.service.js";
import { VoucherRestitutionRefusal } from "../../../../application/services/voucher-restitution-refusal.js";
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
  workshops,
  ScriptedEngagements,
} from "./cancellation-doubles.js";
import { RecordingDurable } from "../../../../application/commands/__tests__/durable-doubles.js";
import {
  FixedCardAdoption,
  RecordingCardRefunds,
} from "../../../../application/commands/__tests__/refund-doubles.js";
import {
  RecordingRedemption,
  RETURNED,
} from "../../../../application/commands/__tests__/voucher-doubles.js";

/**
 * L'annulation de la commande d'origine abandonne son reliquat OUVERT, dans
 * sa transaction ; un reliquat transformé n'est pas touché (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5).
 */

/** Recopié dans l'écriture, jamais comparé à l'horloge. */
const NOW = new Date(0);
const STAFF = "fiche-marie";

function openBackorder(): Backorder {
  return Backorder.open({
    id: "bo_1",
    originOrderId: "ord_1",
    companyId: "co_1",
    buyerUserId: "usr_1",
    lines: [BackorderLine.of({ sku: "CRO", quantity: 4, saleUnit: "piece" })],
    openedAt: NOW,
  });
}

function scene(backorders: readonly Backorder[], desk: OrderWithdrawalOutcome = "withdrawn") {
  const trace: string[] = [];
  const subject = cancellationSubject();
  const subjects = new FixedSubjects(subject);
  const engagements = new ScriptedEngagements({ kind: "free" }, trace);
  const rule = new CancellationRule(engagements);
  const reliquat = backorderAbandonmentScene(backorders, NOW, trace);
  const handler = new CancelOrderHandler(
    new OrderCancellation(
      subjects,
      new InMemoryCancellations(subject, trace),
      new ScriptedCancelGateway({ kind: "cancelled" }, trace),
      workshops(new ScriptedDesk(desk, trace)),
      new RecordingRedemption(false, RETURNED),
      new VoucherRestitutionRefusal(subjects, new FixedInscriptions(), rule),
      rule,
      new CancellationAllowanceGate(new FixedCancellationSettings()),
      engagements,
      new CancellationRefundRequester(new RecordingCardRefunds(), new FixedCardAdoption("pi_1")),
      new RecordingDurable(),
      new RecordingNoteVoiding(trace),
      new DirectUnitOfWork(),
      new FixedClock(NOW),
      new FixedHandoverHistory(),
      increaseCancellation().cancellation,
      reliquat.abandonment,
    ),
  );
  return { handler, trace, ...reliquat };
}

const cancel = () => new CancelOrderCommand("ord_1", STAFF, "Le client a rappelé");

describe("CancelOrderHandler — le reliquat de l'origine", () => {
  it("abandonne le reliquat ouvert APRÈS l'écriture de l'annulation, au nom de l'équipe", async () => {
    const { handler, trace, backorders, journal } = scene([openBackorder()]);

    await handler.execute(cancel());

    expect(trace.indexOf("lock-backorder-by-origin")).toBeGreaterThan(
      trace.indexOf("cancel:ord_1"),
    );
    expect(backorders.stateOf("bo_1")).toMatchObject({
      state: "abandoned",
      closedAt: NOW,
      closedByStaffId: STAFF,
    });
    expect(journal.types()).toEqual(["backorder.abandoned"]);
    expect(journal.facts[0]).toMatchObject({ subjectType: "order", subjectId: "ord_1" });
  });

  it("laisse un reliquat transformé : sa commande vit sa vie", async () => {
    const converted = openBackorder();
    converted.convert("ord_2", NOW, "fiche-paul");
    const { handler, backorders, journal } = scene([converted]);

    await handler.execute(cancel());

    expect(backorders.stateOf("bo_1")).toMatchObject({
      state: "converted",
      convertedOrderId: "ord_2",
      closedByStaffId: "fiche-paul",
    });
    expect(journal.types()).toEqual([]);
  });

  it("sans reliquat, l'annulation ne journalise rien du reliquat", async () => {
    const { handler, backorders, journal } = scene([]);

    await handler.execute(cancel());

    expect(backorders.saved).toEqual([]);
    expect(journal.types()).toEqual([]);
  });

  it("une annulation refusée (inscrite au fournil) laisse le reliquat ouvert", async () => {
    const { handler, backorders } = scene([openBackorder()], "inscribed");

    await expect(handler.execute(cancel())).rejects.toBeInstanceOf(OrderNotCancellableError);
    expect(backorders.stateOf("bo_1")?.state).toBe("open");
  });
});
